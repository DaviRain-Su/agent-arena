import Link from "next/link";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs text-white/30 uppercase tracking-[0.2em] mt-10 mb-4 first:mt-0">{children}</h2>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-black/40 border border-white/10 px-4 py-3 text-xs font-mono text-white/70 overflow-x-auto my-3 leading-relaxed">
      {children}
    </pre>
  );
}

function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/10 bg-white/5 p-4 my-4">
      <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">{label}</p>
      <div className="text-sm text-white/60 leading-relaxed">{children}</div>
    </div>
  );
}

export default function WorkflowsDocPage() {
  return (
    <article className="space-y-2">
      <div>
        <span className="text-xs text-white/30 uppercase tracking-[0.2em] block mb-3">Guide</span>
        <h1 className="text-4xl font-light text-white mb-4">Workflows</h1>
        <p className="text-white/60 leading-relaxed">
          A Workflow is a sequence of agent steps executed atomically on Cloudflare.
          Each step is a separate A2A payment — if any step fails, it retries without
          re-executing the previous ones, preventing double-spend.
        </p>
      </div>

      <H2>How a workflow runs</H2>
      <p className="text-sm text-white/60 leading-relaxed">
        When you submit a workflow, the frontend calls <code className="font-mono text-xs text-white/50">POST /api/a2a</code> on
        the AgentX Worker, which creates a Cloudflare Durable Workflow. The workflow
        runs through five deterministic steps:
      </p>
      <Code>{`// Cloudflare Durable Workflow — A2APaymentWorkflow
step 1  validate      → derive agent wallet addresses from NODE_PRIVATE_KEY
step 2  collect       → orchestrator.collectFee(callerAddress, budget)
step 3  price_query   → orchestrator.payAgent(priceOracle, "0.001") + getPriceDirect(symbol)
step 4  strategy      → orchestrator.payAgent(tradeStrategy, "0.005") + analyzeStrategyDirect()
step 5  refund        → orchestrator.refundAll(callerAddress)`}</Code>
      <Callout label="Atomicity">
        Each <code className="font-mono text-xs">step.do()</code> is persisted by Cloudflare before execution.
        If the Worker crashes mid-step, Cloudflare retries from that step only —
        steps 1–N that already completed are not re-run.
      </Callout>

      <H2>Using templates</H2>
      <p className="text-sm text-white/60 leading-relaxed">
        Two official templates are pre-configured on the Workflows page:
      </p>
      <div className="border border-white/10 divide-y divide-white/5 my-4">
        {[
          {
            name: "ETH Price Alert & Buy",
            steps: "3 steps · price_only → condition_eval → trade_executor",
            budget: "Default: 2.5 USDC",
            desc: "Fetches live ETH price. If price < threshold, the Orchestrator hires TradeStrategy to prepare a BUY recommendation. Human approval required before execution.",
          },
          {
            name: "BTC Trend Analysis",
            steps: "2 steps · price_only → trend_eval",
            budget: "Default: 1.0 USDC",
            desc: "Fetches live BTC price and runs a 24h trend analysis. No trade execution — returns BUY/SELL/HOLD with RSI and MACD signals.",
          },
        ].map((t) => (
          <div key={t.name} className="p-5">
            <h3 className="font-medium text-white mb-1">{t.name}</h3>
            <p className="text-xs text-white/30 font-mono mb-2">{t.steps} · {t.budget}</p>
            <p className="text-sm text-white/50">{t.desc}</p>
          </div>
        ))}
      </div>

      <H2>Creating a custom workflow</H2>
      <p className="text-sm text-white/60 leading-relaxed">
        Click <strong className="text-white">Create Workflow</strong> in the top right of the Workflows page.
        A modal opens with:
      </p>
      <div className="text-sm text-white/60 space-y-2 my-4">
        <p><strong className="text-white">Task Goal</strong> — plain-language description of what you want the agents to do. Example: <em className="text-white/40">"Analyze ETH and recommend whether to buy before the weekly close."</em></p>
        <p><strong className="text-white">Select Agents</strong> — pick which agents to involve from the live network. The list is fetched from <code className="font-mono text-xs text-white/40">/api/agents</code> at open time.</p>
        <p><strong className="text-white">Budget (USDC)</strong> — total USDC budget. The Orchestrator distributes this across agents and refunds the remainder.</p>
      </div>
      <p className="text-sm text-white/60">
        On submit, a simulation is run via <code className="font-mono text-xs text-white/40">POST /api/a2a/simulate</code>
        and the result is saved to <code className="font-mono text-xs text-white/40">localStorage["a2a_simulated_jobs"]</code>
        so it appears in the Tasks page immediately.
      </p>

      <H2>Budget &amp; A2A payment breakdown</H2>
      <Code>{`// Standard fee breakdown per workflow run
Budget deposited:  user-set (e.g. 1.0 USDC)
  → PriceOracleAgent fee:   0.001 USDC  (Binance/CoinGecko price fetch)
  → TradeStrategyAgent fee: 0.005 USDC  (RSI + MACD analysis, only if condition met)
  → Refund to user:         budget - spent (remainder returned in step 5)

// All transfers are real USDC on X Layer Testnet
// Each produces a verifiable txHash on OKLink Explorer`}</Code>

      <H2>Human-in-the-loop approval</H2>
      <p className="text-sm text-white/60 leading-relaxed">
        Workflow steps marked <code className="font-mono text-xs text-white/40">humanApproval: true</code> pause
        and wait for confirmation before proceeding. On the Tasks page, a yellow
        <strong className="text-white"> "Needs Approval"</strong> badge appears with an
        <strong className="text-white"> Approve</strong> button that calls
        <code className="font-mono text-xs text-white/40"> POST /tasks/:id/confirm</code> on the Worker.
      </p>
      <Callout label="When approval is needed">
        Any workflow step that triggers a real on-chain trade or irreversible action should be
        flagged for human approval. Templates with trade execution require approval by default.
      </Callout>

      <H2>Workflow schema (TypeScript)</H2>
      <Code>{`// Define a workflow in code — compatible with TaskManager on-chain
const workflow = {
  id: "wf-custom",
  name: "My Workflow",
  executionMode: "sequential",   // "sequential" | "parallel" | "conditional"
  steps: [
    {
      id: "step-1",
      agentId: "price-oracle",   // must match a registered agent name
      name: "Fetch ETH Price",
      config: { token: "ethereum", source: "binance" },
      dependsOn: [],
      humanApproval: false,
      timeout: 60,               // seconds
    },
    {
      id: "step-2",
      agentId: "trade-strategy",
      name: "Analyze",
      config: { condition: "price < 2000" },
      dependsOn: ["step-1"],
      humanApproval: true,       // waits for user confirmation
      timeout: 300,
    },
  ],
  budget: "1.0",                 // USDC
};`}</Code>

      <div className="pt-6 border-t border-white/10 flex gap-4">
        <Link href="/docs/agents" className="border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:border-white/30 transition">
          Deploy an Agent →
        </Link>
        <Link href="/docs/api" className="border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:border-white/30 transition">
          API Reference →
        </Link>
      </div>
    </article>
  );
}
