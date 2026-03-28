"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { ethers } from "ethers";
import { XLAYER_CHAIN } from "@/lib/contracts";

// OKX Wallet injects window.okxwallet; MetaMask injects window.ethereum
declare global {
  interface Window {
    okxwallet?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export type WalletType = "okx" | "metamask" | null;

interface Web3ContextType {
  address: string | null;
  signer: ethers.Signer | null;
  provider: ethers.BrowserProvider | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletType: WalletType;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToXLayer: () => Promise<void>;
  openWalletModal: () => Promise<void>;
  chainId: number | null;
}

const Web3Context = createContext<Web3ContextType>({
  address: null, signer: null, provider: null,
  isConnected: false, isConnecting: false, walletType: null, chainId: null,
  connect: async () => {}, disconnect: () => {},
  switchToXLayer: async () => {}, openWalletModal: async () => {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEip1193(type: WalletType) {
  if (type === "okx")      return window.okxwallet ?? null;
  if (type === "metamask") return window.ethereum   ?? null;
  return null;
}

function detectWallets(): { hasOkx: boolean; hasMeta: boolean } {
  if (typeof window === "undefined") return { hasOkx: false, hasMeta: false };
  return {
    hasOkx:  !!window.okxwallet,
    hasMeta: !!window.ethereum,
  };
}

const CYAN = "#1de1f1";

// ─── Wallet Picker Modal ──────────────────────────────────────────────────────

function WalletPickerModal({
  onSelect,
  onClose,
  hasOkx,
  hasMeta,
}: {
  onSelect: (type: WalletType) => void;
  onClose: () => void;
  hasOkx: boolean;
  hasMeta: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border border-white/15 p-6 w-80 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white tracking-widest uppercase">
            Connect Wallet
          </h3>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xs">✕</button>
        </div>

        {/* OKX Wallet */}
        <button
          onClick={() => onSelect("okx")}
          disabled={!hasOkx}
          className="w-full flex items-center gap-4 px-4 py-3 border transition disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: hasOkx ? `${CYAN}60` : "rgba(255,255,255,0.1)" }}
        >
          {/* OKX logo */}
          <span className="text-lg font-bold text-white/80 w-8 text-center select-none">OKX</span>
          <div className="flex-1 text-left">
            <p className="text-sm text-white">OKX Wallet</p>
            <p className="text-xs text-white/40">
              {hasOkx ? "Detected · Recommended" : "Not installed"}
            </p>
          </div>
          {hasOkx && (
            <span className="text-xs px-2 py-0.5 border" style={{ borderColor: `${CYAN}50`, color: CYAN }}>
              Priority
            </span>
          )}
        </button>

        {/* MetaMask */}
        <button
          onClick={() => onSelect("metamask")}
          disabled={!hasMeta}
          className="w-full flex items-center gap-4 px-4 py-3 border border-white/10 hover:border-white/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {/* MetaMask fox emoji as lightweight placeholder */}
          <span className="text-lg w-8 text-center select-none">🦊</span>
          <div className="flex-1 text-left">
            <p className="text-sm text-white">MetaMask</p>
            <p className="text-xs text-white/40">
              {hasMeta ? "Detected" : "Not installed"}
            </p>
          </div>
        </button>

        {/* Neither installed */}
        {!hasOkx && !hasMeta && (
          <div className="text-center text-xs text-white/40 pt-2 space-y-2">
            <p>No wallet detected. Install one to continue:</p>
            <div className="flex gap-3 justify-center">
              <a
                href="https://www.okx.com/web3"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border text-xs transition hover:opacity-80"
                style={{ borderColor: `${CYAN}50`, color: CYAN }}
              >
                Get OKX Wallet
              </a>
              <a
                href="https://metamask.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border border-white/20 text-white/50 text-xs transition hover:border-white/40"
              >
                Get MetaMask
              </a>
            </div>
          </div>
        )}

        <p className="text-xs text-white/20 text-center pt-1">
          X-Layer Mainnet (chainId 196)
        </p>
      </div>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function Web3Provider({ children }: { children: ReactNode }) {
  const [address, setAddress]       = useState<string | null>(null);
  const [signer, setSigner]         = useState<ethers.Signer | null>(null);
  const [provider, setProvider]     = useState<ethers.BrowserProvider | null>(null);
  const [chainId, setChainId]       = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Resolve pending picker selection
  const pickerResolveRef = useRef<((type: WalletType) => void) | null>(null);

  /** Show the picker modal and wait for user selection */
  const waitForPick = (): Promise<WalletType> =>
    new Promise(resolve => {
      pickerResolveRef.current = resolve;
      setShowPicker(true);
    });

  const handlePickerSelect = (type: WalletType) => {
    setShowPicker(false);
    pickerResolveRef.current?.(type);
    pickerResolveRef.current = null;
  };

  const handlePickerClose = () => {
    setShowPicker(false);
    pickerResolveRef.current?.(null);
    pickerResolveRef.current = null;
  };

  const connectWith = async (type: WalletType) => {
    const eip1193 = getEip1193(type);
    if (!eip1193) return;
    setIsConnecting(true);
    try {
      const prov = new ethers.BrowserProvider(eip1193 as ethers.Eip1193Provider);
      await prov.send("eth_requestAccounts", []);
      const s = await prov.getSigner();
      const addr = await s.getAddress();
      const network = await prov.getNetwork();
      setProvider(prov);
      setSigner(s);
      setAddress(addr);
      setChainId(Number(network.chainId));
      setWalletType(type);
    } catch (e) {
      console.error("Connect failed", e);
    } finally {
      setIsConnecting(false);
    }
  };

  const connect = async () => {
    if (typeof window === "undefined") return;
    const { hasOkx, hasMeta } = detectWallets();

    // Auto-select if only one wallet available
    if (hasOkx && !hasMeta) return connectWith("okx");
    if (!hasOkx && hasMeta)  return connectWith("metamask");

    // Both present → show picker (OKX is visually prioritized)
    if (hasOkx && hasMeta) {
      const chosen = await waitForPick();
      if (chosen) return connectWith(chosen);
      return;
    }

    // Neither → show picker which will display install links
    const chosen = await waitForPick();
    if (chosen) return connectWith(chosen);
  };

  const disconnect = () => {
    setAddress(null); setSigner(null); setProvider(null);
    setChainId(null); setWalletType(null);
  };

  const switchToXLayer = async () => {
    const eip1193 = getEip1193(walletType);
    if (!eip1193) return;
    try {
      await eip1193.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: XLAYER_CHAIN.chainId }],
      });
    } catch (err: unknown) {
      if ((err as { code: number }).code === 4902) {
        await eip1193.request({
          method: "wallet_addEthereumChain",
          params: [XLAYER_CHAIN],
        });
      }
    }
  };

  // Listen for account / chain changes on the active wallet
  useEffect(() => {
    if (typeof window === "undefined") return;
    const eip1193 = getEip1193(walletType);
    if (!eip1193?.on) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) disconnect();
      else connectWith(walletType);
    };
    const onChainChanged = () => connectWith(walletType);

    eip1193.on("accountsChanged", onAccountsChanged);
    eip1193.on("chainChanged", onChainChanged);

    return () => {
      eip1193.removeListener?.("accountsChanged", onAccountsChanged);
      eip1193.removeListener?.("chainChanged", onChainChanged);
    };
  }, [walletType]);

  const { hasOkx, hasMeta } = detectWallets();

  return (
    <Web3Context.Provider value={{
      address, signer, provider, chainId,
      isConnected: !!address, isConnecting, walletType,
      connect, disconnect,
      switchToXLayer,
      openWalletModal: connect,
    }}>
      {children}
      {showPicker && (
        <WalletPickerModal
          onSelect={handlePickerSelect}
          onClose={handlePickerClose}
          hasOkx={hasOkx}
          hasMeta={hasMeta}
        />
      )}
    </Web3Context.Provider>
  );
}

export const useWeb3 = () => useContext(Web3Context);
