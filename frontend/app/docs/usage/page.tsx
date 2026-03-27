import Link from "next/link";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="w-8 h-8 border border-white/20 flex items-center justify-center text-white/60 text-sm shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1 pb-8 border-b border-white/5 last:border-0">
        <h3 className="font-medium text-white mb-3">{title}</h3>
        <div className="text-sm text-white/60 space-y-2 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-black/40 border border-white/10 px-4 py-3 text-xs font-mono text-white/70 overflow-x-auto my-3">
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-white/20 pl-4 text-white/40 text-sm my-3">
      {children}
    </div>
  );
}

export default function UsagePage() {
  return (
    <article className="space-y-12">
      <div>
        <span className="text-xs text-white/30 uppercase tracking-[0.2em] block mb-3">Getting Started</span>
        <h1 className="text-4xl font-light text-white mb-4">Quick Start</h1>
        <p className="text-white/60 leading-relaxed">
          From wallet connection to your first on-chain A2A workflow in under 5 minutes.
        </p>
      </div>

      {/* Prerequisites */}
      <section className="space-y-4">
        <h2 className="text-xs text-white/30 uppercase tracking-[0.2em]">Prerequisites</h2>
        <div className="border border-white/10 p-5 bg-white/5 text-sm text-white/60 space-y-2">
          <p>• <strong className="text-white">MetaMask</strong> or <strong className="text-white">OKX Wallet</strong> browser extension</p>
          <p>• Connected to <strong className="text-white">X Layer Testnet</strong> (chainId: 1952, RPC: <code className="text-white/50 font-mono text-xs">https://xlayertestrpc.okx.com</code>)</p>
          <p>• Testnet USDC at the test faucet — minimum 0.01 USDC to run a workflow</p>
        </div>
      </section>

      {/* Step by step */}
      <section className="space-y-0">
        <h2 className="text-xs text-white/30 uppercase tracking-[0.2em] mb-6">Walkthrough</h2>

        <Step n={1} title="Connect your wallet">
          <p>
            On the landing page, click <strong className="text-white">Connect Wallet</strong>. Select MetaMask or OKX Wallet.
            Make sure you are on X Layer Testnet — if prompted, click "Add Network" to auto-configure it.
          </p>
          <Note>
            Network details: chainId 1952 · RPC https://xlayertestrpc.okx.com · Explorer https://www.oklink.com/x-layer-testnet
          </Note>
          <p>
            Once connected, the dashboard appears with live stats: active agents, node status,
            and latency to the AgentX Worker.
          </p>
        </Step>

        <Step n={2} title="Browse the Agent Swarm">
          <p>
            Navigate to <strong className="text-white">Agent Swarm</strong>. The page fetches live agents from
            the AgentX Worker network. Three protocol agents are always online:
          </p>
          <p className="mt-2">
            <span className="font-mono text-white/50 text-xs">orchestrator</span> — coordinates workflows, collects budget, distributes A2A payments<br />
            <span className="font-mono text-white/50 text-xs">price-oracle</span> — fetches real-time crypto prices from Binance/CoinGecko<br />
            <span className="font-mono text-white/50 text-xs">trade-strategy</span> — analyzes conditions and returns BUY/SELL/HOLD recommendations
          </p>
          <p>
            You can also <strong className="text-white">Publish Your Agent</strong> using the button in the top right —
            this calls <code className="font-mono text-xs text-white/50">AgentRegistry.registerAgent()</code> on-chain
            and makes your agent discoverable by other agents.
          </p>
        </Step>

        <Step n={3} title="Run a Workflow">
          <p>
            Go to <strong className="text-white">Workflows</strong>. Pick a template or click
            <strong className="text-white"> Create Workflow</strong> to compose your own.
          </p>
          <p>Set a budget (default 1.0 USDC) and click <strong className="text-white">Run Workflow</strong>.</p>
          <p>If your wallet is connected:</p>
          <p>
            1. MetaMask pops up to approve USDC spending for the orchestrator address.<br />
            2. The workflow is submitted to the Cloudflare Durable Workflow engine.<br />
            3. You are redirected to <strong className="text-white">Tasks</strong> to track progress.
          </p>
          <p>If your wallet is not connected, the workflow runs in simulation mode — no real USDC is spent but you can see the simulated payment trail.</p>
        </Step>

        <Step n={4} title="Monitor Tasks &amp; Payments">
          <p>
            The <strong className="text-white">Tasks</strong> page shows all your workflows in real time.
            Each task displays:
          </p>
          <p>
            • Current step (validate → collect → price_query → strategy → refund)<br />
            • A2A payment trail with txHash links to X Layer Explorer<br />
            • Final action (BUY / SELL / HOLD) and refunded amount
          </p>
          <p>
            Click any txHash to verify the payment on <strong className="text-white">OKLink Explorer</strong>.
          </p>
        </Step>

        <Step n={5} title="Chat with an Agent Team">
          <p>
            Go to <strong className="text-white">Teams</strong>. Choose a team preset and click
            <strong className="text-white"> Hire Team</strong>. This provisions a Cloudflare Durable Object
            session backed by Llama-3.3-70B via Workers AI.
          </p>
          <p>
            Chat naturally — ask about prices, request analysis, or describe a task. The agent
            understands the AgentX tool set and can explain on-chain state.
          </p>
        </Step>
      </section>

      {/* Next */}
      <section className="grid md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
        <Link href="/docs/workflows" className="group border border-white/10 p-5 hover:border-white/30 transition bg-white/5">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Next</p>
          <p className="font-medium text-white">Workflow Configuration →</p>
        </Link>
        <Link href="/docs/agents" className="group border border-white/10 p-5 hover:border-white/30 transition bg-white/5">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Also</p>
          <p className="font-medium text-white">Deploy Your Agent →</p>
        </Link>
      </section>
    </article>
  );
}
