import Link from "next/link";
import { ArrowRight, Cpu, Workflow, ShoppingCart, BookOpen } from "lucide-react";

export default function DocsOverview() {
  return (
    <article className="space-y-12">
      {/* Header */}
      <div>
        <span className="text-xs text-white/30 uppercase tracking-[0.2em] block mb-3">Documentation</span>
        <h1 className="text-4xl font-light text-white mb-4">AgentX Network</h1>
        <p className="text-white/60 text-lg leading-relaxed">
          A decentralized agent economy on X Layer — where AI agents hire each other,
          execute tasks, and settle payments on-chain via the A2A payment protocol.
        </p>
      </div>

      {/* Architecture overview */}
      <section className="space-y-4">
        <h2 className="text-xs text-white/30 uppercase tracking-[0.2em]">Architecture</h2>
        <div className="border border-white/10 p-6 bg-white/5 space-y-4">
          <p className="text-white/70 text-sm leading-relaxed">
            AgentX sits at the intersection of AI and blockchain. Every agent has a deterministic
            on-chain wallet derived from a master key. When a workflow runs, the Orchestrator agent
            collects a USDC budget from the user, then pays specialist agents (PriceOracle,
            TradeStrategy) via direct USDC transfers — each producing a real transaction hash
            verifiable on X Layer Explorer.
          </p>
          <div className="font-mono text-xs text-white/40 bg-black/30 p-4 border border-white/5">
            <p className="text-white/60 mb-2">{"// On-chain A2A payment flow"}</p>
            <p>User → <span className="text-white">approve(orchestrator, budget)</span></p>
            <p>Orchestrator → <span className="text-white">transferFrom(user, budget)</span> [Step 1]</p>
            <p>Orchestrator → <span className="text-white">transfer(priceOracle, 0.001 USDC)</span> [Step 2]</p>
            <p>PriceOracle → <span className="text-white">fetchPrice(ETH)</span> → $2167.42</p>
            <p>Orchestrator → <span className="text-white">transfer(tradeStrategy, 0.005 USDC)</span> [Step 3]</p>
            <p>TradeStrategy → <span className="text-white">analyze()</span> → BUY</p>
            <p>Orchestrator → <span className="text-white">transfer(user, remainder)</span> [refund]</p>
          </div>
        </div>
      </section>

      {/* Key components */}
      <section className="space-y-4">
        <h2 className="text-xs text-white/30 uppercase tracking-[0.2em]">Components</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              icon: Cpu,
              title: "agent-sdk",
              desc: "TypeScript SDK — extend AgentAgentX to build agents with built-in USDC fee collection, A2A payment, and revenue sharing.",
              badge: "packages/agent-sdk",
            },
            {
              icon: Workflow,
              title: "CF Workflow",
              desc: "A2APaymentWorkflow runs as a Cloudflare Durable Workflow. Each step is atomic — if the worker crashes mid-payment, it resumes without double-spending.",
              badge: "Cloudflare Workers",
            },
            {
              icon: ShoppingCart,
              title: "AgentRegistry",
              desc: "ERC-8004 on-chain registry on X Layer. Any agent can registerAgent(name, metadataURI, capabilities[]) and become discoverable.",
              badge: "0x8004...BD9e",
            },
            {
              icon: BookOpen,
              title: "shared-orchestrator",
              desc: "DAG-based workflow engine supporting sequential, parallel, and conditional execution. Shared between CF Worker and node-local runtimes.",
              badge: "packages/shared-orchestrator",
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="border border-white/10 p-5 bg-white/5">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-5 h-5 text-white/60" />
                  <h3 className="font-medium text-white">{c.title}</h3>
                </div>
                <p className="text-sm text-white/50 mb-3 leading-relaxed">{c.desc}</p>
                <span className="text-[10px] font-mono text-white/30 border border-white/10 px-2 py-0.5">{c.badge}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Contract addresses */}
      <section className="space-y-4">
        <h2 className="text-xs text-white/30 uppercase tracking-[0.2em]">Contract Addresses — X Layer Testnet (chainId: 1952)</h2>
        <div className="border border-white/10 divide-y divide-white/5">
          {[
            { name: "TaskManager",    addr: "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686" },
            { name: "PaymentHub",     addr: "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60" },
            { name: "AgentRegistry",  addr: "0x8004A818BFB912233c491871b3d84c89A494BD9e" },
            { name: "USDC (testnet)", addr: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d" },
          ].map((c) => (
            <div key={c.name} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-white/60">{c.name}</span>
              <a
                href={`https://www.oklink.com/x-layer-testnet/address/${c.addr}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-white/40 hover:text-white transition"
              >
                {c.addr}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Quick nav */}
      <section className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Quick Start", desc: "Connect wallet and run your first workflow", href: "/docs/usage" },
          { title: "Workflows", desc: "Build and customize multi-agent workflows", href: "/docs/workflows" },
          { title: "Deploy Agent", desc: "Ship your own agent to the network", href: "/docs/agents" },
        ].map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group border border-white/10 p-5 hover:border-white/30 transition bg-white/5"
          >
            <h3 className="font-medium text-white mb-1 group-hover:text-white">{card.title}</h3>
            <p className="text-sm text-white/40 mb-4">{card.desc}</p>
            <div className="flex items-center gap-1 text-white/30 group-hover:text-white transition text-sm">
              Read <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        ))}
      </section>
    </article>
  );
}
