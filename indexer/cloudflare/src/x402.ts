// src/x402.ts — HTTP 402 Payment Required middleware for Agent Arena premium data API
//
// Protocol flow:
//   1. Client → GET /premium/...  (no payment header)
//   2. Worker → HTTP 402  { x402Version, accepts: [{ payTo, amount, asset, ... }] }
//   3. Client sends OKB tx on X-Layer to `payTo` address
//   4. Client → GET /premium/...  X-PAYMENT: <txHash>
//   5. Worker verifies tx on-chain (recipient, value, recency ≤ 5 min)
//   6. Worker → HTTP 200  X-PAYMENT-RESPONSE: accepted

import type { Context, Next } from "hono";
import type { Env } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAIN_ID        = 196;                 // X-Layer Mainnet
const PAYMENT_TIMEOUT = 300;                 // 5 minutes — payment valid window (seconds)
const OKB_DECIMALS    = 18n;
const WEI_PER_OKB     = 10n ** OKB_DECIMALS;

/** Convert "0.001" OKB string → wei as bigint */
export function okbToWei(okb: string): bigint {
  const [whole, frac = ""] = okb.split(".");
  const fracPadded = frac.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * WEI_PER_OKB + BigInt(fracPadded);
}

// ─── On-chain payment verification ────────────────────────────────────────────

interface RpcResult<T> { result?: T; error?: { message: string } }

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json() as RpcResult<T>;
    return data.result ?? null;
  } catch {
    return null;
  }
}

interface EthTx {
  to: string | null;
  value: string;
  blockHash: string;
}

interface EthReceipt {
  status: string;       // "0x1" = success
  blockHash: string;
}

interface EthBlock {
  timestamp: string;    // hex
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Verify an OKB payment on X-Layer.
 * Checks: tx exists, tx succeeded, correct recipient, sufficient value, recent block.
 */
export async function verifyOKBPayment(
  txHash: string,
  requiredWei: bigint,
  recipient: string,
  rpcUrl: string,
): Promise<VerifyResult> {
  // 1. Receipt — confirms tx is mined and succeeded
  const receipt = await rpcCall<EthReceipt>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { valid: false, reason: "tx not found or not yet mined" };
  if (receipt.status !== "0x1") return { valid: false, reason: "tx reverted" };

  // 2. Transaction — check recipient and value
  const tx = await rpcCall<EthTx>(rpcUrl, "eth_getTransactionByHash", [txHash]);
  if (!tx) return { valid: false, reason: "tx not found" };

  if (!tx.to || tx.to.toLowerCase() !== recipient.toLowerCase()) {
    return { valid: false, reason: `wrong recipient: expected ${recipient}, got ${tx.to}` };
  }

  const valuePaid = BigInt(tx.value);
  if (valuePaid < requiredWei) {
    return {
      valid: false,
      reason: `insufficient payment: required ${requiredWei} wei, got ${valuePaid} wei`,
    };
  }

  // 3. Block timestamp — payment must be within PAYMENT_TIMEOUT seconds
  const block = await rpcCall<EthBlock>(rpcUrl, "eth_getBlockByHash", [receipt.blockHash, false]);
  if (!block) return { valid: false, reason: "could not fetch block" };

  const blockTs = parseInt(block.timestamp, 16);
  const nowTs   = Math.floor(Date.now() / 1000);
  if (nowTs - blockTs > PAYMENT_TIMEOUT) {
    return { valid: false, reason: `payment expired (${nowTs - blockTs}s ago, max ${PAYMENT_TIMEOUT}s)` };
  }

  return { valid: true };
}

// ─── Middleware factory ────────────────────────────────────────────────────────

export interface X402Options {
  /** OKB amount as decimal string e.g. "0.001" */
  amountOKB: string;
  /** Human-readable description shown to client */
  description: string;
}

/**
 * Hono middleware that gates a route behind an x402 OKB payment.
 *
 * Usage:
 *   app.get("/premium/foo", require402({ amountOKB: "0.001", description: "..." }), handler)
 */
export function require402(opts: X402Options) {
  const requiredWei = okbToWei(opts.amountOKB);

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const paymentHeader = c.req.header("X-PAYMENT");
    const recipient     = c.env.PAYMENT_RECIPIENT;

    if (!recipient) {
      // Misconfigured — skip payment gate in dev/fallback
      console.warn("[x402] PAYMENT_RECIPIENT not set, bypassing gate");
      await next();
      return;
    }

    // ── No payment header → return 402 with payment requirements ─────────────
    if (!paymentHeader) {
      return c.json(
        {
          x402Version: 1,
          error: "Payment Required",
          accepts: [
            {
              scheme: "exact",
              network: "xlayer-mainnet",
              chainId: CHAIN_ID,
              asset: "OKB",
              maxAmountRequired: opts.amountOKB,
              payTo: recipient,
              resource: c.req.url,
              description: opts.description,
              mimeType: "application/json",
              maxTimeoutSeconds: PAYMENT_TIMEOUT,
            },
          ],
        },
        402,
      );
    }

    // ── Payment header present → verify on-chain ──────────────────────────────
    const txHash = paymentHeader.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return c.json({ error: "Invalid X-PAYMENT header: expected a 0x-prefixed tx hash" }, 402);
    }

    const result = await verifyOKBPayment(txHash, requiredWei, recipient, c.env.XLAYER_RPC);

    if (!result.valid) {
      return c.json(
        {
          x402Version: 1,
          error: "Payment verification failed",
          reason: result.reason,
          accepts: [
            {
              scheme: "exact",
              network: "xlayer-mainnet",
              chainId: CHAIN_ID,
              asset: "OKB",
              maxAmountRequired: opts.amountOKB,
              payTo: recipient,
              resource: c.req.url,
              description: opts.description,
              mimeType: "application/json",
              maxTimeoutSeconds: PAYMENT_TIMEOUT,
            },
          ],
        },
        402,
      );
    }

    // ── Valid payment — proceed ───────────────────────────────────────────────
    await next();
    c.header("X-PAYMENT-RESPONSE", "accepted");
    c.header("X-PAYMENT-TX", txHash);
  };
}
