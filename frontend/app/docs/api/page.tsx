function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs text-white/30 uppercase tracking-[0.2em] mt-10 mb-4 first:mt-0">{children}</h2>;
}

function Endpoint({
  method, path, desc, body, response,
}: {
  method: "GET" | "POST";
  path: string;
  desc: string;
  body?: string;
  response?: string;
}) {
  return (
    <div className="border border-white/10 bg-white/5 mb-4">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
          method === "GET" ? "bg-white/10 text-white/60" : "bg-white text-black"
        }`}>
          {method}
        </span>
        <code className="font-mono text-sm text-white">{path}</code>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-white/60">{desc}</p>
        {body && (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Request body</p>
            <pre className="text-xs font-mono text-white/50 bg-black/30 border border-white/5 p-3 overflow-x-auto">{body}</pre>
          </div>
        )}
        {response && (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Response</p>
            <pre className="text-xs font-mono text-white/50 bg-black/30 border border-white/5 p-3 overflow-x-auto">{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function APIReferencePage() {
  const BASE = "https://agentx-worker.davirain-yin.workers.dev";

  return (
    <article className="space-y-2">
      <div>
        <span className="text-xs text-white/30 uppercase tracking-[0.2em] block mb-3">Reference</span>
        <h1 className="text-4xl font-light text-white mb-4">API Reference</h1>
        <p className="text-white/60 leading-relaxed">
          All endpoints are on the AgentX Cloudflare Worker. Base URL:{" "}
          <code className="font-mono text-xs text-white/50">{BASE}</code>
        </p>
        <p className="text-sm text-white/40 mt-2">All endpoints return JSON. CORS is open (*).</p>
      </div>

      <H2>Health</H2>
      <Endpoint
        method="GET"
        path="/health"
        desc="Returns worker health, version, and X Layer RPC gateway URL."
        response={`{ "status": "ok", "version": "0.1.0", "gateway": "https://xlayertestrpc.okx.com" }`}
      />

      <H2>Agents</H2>
      <Endpoint
        method="GET"
        path="/api/agents"
        desc="Returns live agent wallet addresses, fees, and capabilities. Derived from NODE_PRIVATE_KEY via agent-sdk."
        response={`{
  "orchestrator":   { "address": "0x...", "fee": "0.002 USDC", "capabilities": ["a2a_payment", "hire_agent", ...] },
  "price-oracle":   { "address": "0x...", "fee": "0.001 USDC", "capabilities": ["fetch_price", ...] },
  "trade-strategy": { "address": "0x...", "fee": "0.005 USDC", "capabilities": ["analyze_strategy", ...] }
}`}
      />

      <H2>A2A Workflow</H2>
      <Endpoint
        method="POST"
        path="/api/a2a"
        desc="Start a durable A2A payment workflow. Caller must have approved USDC for the orchestrator address first. Returns a jobId for polling."
        body={`{
  "symbol":        "ETH",           // token to analyze
  "budget":        1.0,             // USDC budget (number)
  "callerAddress": "0x...",         // user wallet (must have approved USDC)
  "type":          "price_only",    // "price_only" | "price_alert" | "auto_trade"
  "threshold":     0,               // price threshold (0 = always proceed)
  "riskLevel":     "medium"         // "low" | "medium" | "high"
}`}
        response={`{ "jobId": "abc123", "status": "running" }`}
      />
      <Endpoint
        method="GET"
        path="/api/a2a/:jobId"
        desc="Poll workflow status. Returns the full result once completed, including all A2A payment records."
        response={`{
  "status": "completed",
  "symbol": "ETH",
  "currentPrice": 2167.42,
  "priceSource": "binance",
  "action": "BUY",
  "totalSpent": "0.0060",
  "refunded": "0.994",
  "payments": [
    { "step": "User → Orchestrator: budget deposit",        "txHash": "0x...", "amount": "1.0 USDC" },
    { "step": "Orchestrator → PriceOracleAgent: A2A payment","txHash": "0x...", "amount": "0.001 USDC" },
    { "step": "Orchestrator → TradeStrategyAgent: A2A payment","txHash": "0x...","amount": "0.005 USDC"},
    { "step": "Orchestrator → User: refund unspent budget", "txHash": "0x...", "amount": "0.994 USDC" }
  ]
}`}
      />
      <Endpoint
        method="POST"
        path="/api/a2a/simulate"
        desc="Run workflow in simulation mode — no real USDC transfers. Useful for demos and testing."
        body={`{ "symbol": "ETH", "budget": 1.0, "type": "price_only", "threshold": 0 }`}
        response={`{
  "status": "simulated",
  "symbol": "ETH",
  "currentPrice": 2167.42,
  "action": "BUY",
  "simulatedPayments": [
    { "step": "User → Orchestrator", "amount": "1.0" },
    { "step": "Orchestrator → PriceOracleAgent", "amount": "0.001" }
  ]
}`}
      />

      <H2>Agent Sessions (AI Chat)</H2>
      <Endpoint
        method="POST"
        path="/api/deploy"
        desc="Provision a new AI agent session backed by a Cloudflare Durable Object. Returns a sessionId."
        body={`{ "template": "orchestrator", "config": { "name": "My Agent" } }`}
        response={`{ "agentId": "uuid", "sessionId": "uuid", "status": "ready" }`}
      />
      <Endpoint
        method="POST"
        path="/agent/chat/:sessionId"
        desc="Send a message to an agent session. Returns the AI response (Llama-3.3-70B via Workers AI)."
        body={`{ "message": "What is the current ETH price?" }`}
        response={`{ "reply": "The current ETH price is $2,167.42 (Binance, 30s ago)." }`}
      />
      <Endpoint
        method="GET"
        path="/agent/history/:sessionId"
        desc="Returns the message history for an agent session."
        response={`{ "messages": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }] }`}
      />

      <H2>Tasks (Human-in-the-loop)</H2>
      <Endpoint
        method="POST"
        path="/tasks/:taskId/confirm"
        desc="Confirm a pending human-approval step for a workflow task."
        body={`{ "approved": true }`}
        response={`{ "status": "confirmed", "taskId": "123" }`}
      />
    </article>
  );
}
