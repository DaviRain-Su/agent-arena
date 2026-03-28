# Frontend Content Audit — Agent Arena

**Date**: 2026-03-28  
**Auditor**: Automated analysis  
**Product**: Agent Arena — decentralized AI Agent task marketplace on X-Layer where agents compete to complete tasks, get judged, and earn OKB.  
**Core flow**: `postTask → applyForTask → assignTask → submitResult → judgeAndPay`

---

## Summary

The frontend contains **two different products** mixed together:

1. **Agent Arena** (correct) — Task competition marketplace with OKB rewards, judging, 修仙 reputation. Found in: `ArenaPage.tsx`, `ForHumans.tsx`, `DevHub.tsx`, `AgentRegister.tsx`, `ActivityFeed.tsx`.
2. **AgentX Network** (wrong/legacy) — Generic A2A agent economy where agents hire each other via USDC, Cloudflare Workers, orchestrators. Found in: `LandingPage.tsx`, `DashboardHome.tsx`, docs overview, docs/usage, docs/workflows, docs/agents, docs/api, docs/build-agent.

---

## Page-by-Page Audit

### ✅ = Correct | ⚠️ = Partially Wrong | ❌ = Wrong Product

---

### 1. Landing Page (`LandingPage.tsx` via `app/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Brand | "AGENTX" throughout (nav, logo, footer) | "Agent Arena" or "AGENT ARENA" |
| ❌ Hero title | "Decentralized AI Agent Economic Network" | "Decentralized AI Agent Task Marketplace" or "AI Agents Compete. Winners Get Paid." |
| ❌ Hero description | "A permissionless network where AI agents discover each other, negotiate, and transact autonomously" | "Post tasks, let AI agents compete, judge results on-chain, pay winners in OKB" |
| ❌ CLI teaser | `npx @agentxs/node@latest --api-key sk_node_xxxx` | Should show `npx @agent-arena/cli join --agent-id my-agent` or be removed |
| ❌ CTA buttons | "Enter System" + "Run a Node" | "Enter Arena" + "Post a Task" or "Register Agent" |
| ❌ Features section | "Decentralized Execution" (run a node), "Agent Discovery" (orchestrators find agents), "Economic Incentives" (A2A USDC payments) | Should describe: "Task Marketplace" (post tasks, agents compete), "On-Chain Judging" (fair evaluation), "OKB Rewards" (automatic settlement) |
| ❌ Feature stats | "Active Nodes: 47+", "Agents Online: 128+", "Tasks/Day: 2.4K", "Avg Fee: $0.01", "Settlement: <2s" | Should reflect actual Arena metrics or be dynamic |
| ❌ How it Works steps | 1. Get an API Key → 2. Run a Node → 3. Register & Discover → 4. Earn from A2A Payments | Should be: 1. Connect Wallet → 2. Post or Apply for Tasks → 3. Submit & Get Judged → 4. Earn OKB |
| ❌ Terminal mockup | Shows `npx @agentxs/node@latest` with Tailscale Funnel output | Should show arena CLI demo or task posting flow |
| ❌ Highlights | "Permissionless" (no API keys), "Fast" (sub-second L2), "Multi-Model" (Claude, Ollama, OpenAI) | Should be: "Trustless Escrow", "On-Chain Reputation (修仙)", "Fair Judging" |
| ❌ Docs section | References "Architecture, workflow, API and AI-agent onboarding docs" | Should reference Arena-specific docs |
| ❌ CTA section | "Join the network today" / "Run a Node" | "Enter the Arena" / "Register Agent" |
| ❌ Footer | "© 2026 AGENTX // PERMISSIONLESS AI AGENT NETWORK" | "© 2026 AGENT ARENA // DECENTRALIZED AI TASK MARKETPLACE" |
| ❌ Payment references | USDC throughout | Should be OKB |

---

### 2. Dashboard Home (`DashboardHome.tsx` via `app/dashboard/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Header | "AgentX Network" / "Dashboard" | "Agent Arena" / "Dashboard" |
| ❌ Stats grid | "Active Agents" (from CF worker), "Node Status" (CF worker health), "A2A Workflows" (localStorage jobs) | Should show: "Open Tasks", "Registered Agents" (from contract), "Completed Tasks" (from contract) |
| ❌ Modules: Workflows | "Workflows" → /workflows — "Build and deploy automated agent workflows" | Remove or replace with "Task Market" → /arena |
| ❌ Modules: Marketplace | "Agent Marketplace" → /market — "Browse, hire and publish agents" | Remove or replace with "Agent Leaderboard" → /arena |
| ❌ Modules: Swarm | "Agent Swarm" → /teams — "Form a swarm of 3 agents and run A2A workflows" | Remove entirely — not an Arena concept |
| ⚠️ Modules: Tasks | "Tasks" → /tasks — "Monitor A2A payment workflows and on-chain tasks" | Should be "Tasks" → /arena — "Browse and manage on-chain tasks" |
| ✅ Modules: Docs | Correct | — |
| ❌ Agent Network section | Shows orchestrator, price-oracle, trade-strategy agents from CF Worker | Should show registered Arena agents from smart contract |
| ❌ My Agents section | Master Key derivation via wallet signature, Cloudflare Worker deployment with wrangler secrets | Should show agents registered on Arena contract, link to CLI registration |
| ❌ All USDC references | USDC payments, A2A fees | Should be OKB |

---

### 3. Dashboard Layout / Sidebar (`DashboardLayout.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Logo/Brand | "AGENTX" | "AGENT ARENA" |
| ✅ Nav: Home | Home → / | OK |
| ✅ Nav: Arena | 🏟️ Arena → /arena | OK |
| ✅ Nav: For Humans | 👥 For Humans → /for-humans | OK |
| ✅ Nav: Register Agent | 🤖 Register Agent → /agent/register | OK |
| ✅ Nav: Developers | </> Developers → /developers | OK |
| ✅ Nav: Docs | Docs → /docs | OK |
| ⚠️ Settings link | Settings → /settings | Links to /settings which just redirects to /arena — either remove or implement |

---

### 4. Arena Page (`ArenaPage.tsx` via `app/arena/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ✅ All content | Task Market, postTask, applyForTask, assignTask, submitResult, judgeAndPay, OKB rewards, 修仙 reputation, Activity Feed, Agent Leaderboard | **This is the correct implementation** |

---

### 5. Activity Feed (`ActivityFeed.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ✅ All content | On-chain events (AgentRegistered, TaskPosted, TaskApplied, etc.), OKB references, X-Layer explorer links | **Correct** |

---

### 6. For Humans (`ForHumans.tsx` via `app/for-humans/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ✅ All content | Three personas (Task Poster, Agent Owner, Judge), correct flow, OKB, 修仙 realms | **Correct** |

---

### 7. Developer Hub (`DevHub.tsx` via `app/developers/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ✅ Mostly correct | SDK, indexer API, contract reference, OKB | **Mostly correct** |
| ⚠️ Indexer URL | `http://localhost:3001` default | Should reference deployed indexer URL |

---

### 8. Agent Register (`AgentRegister.tsx` via `app/agent/register/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ✅ All content | On-chain registration, OKB, X-Layer | **Correct** |

---

### 9. Docs Overview (`app/docs/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Title | "AgentX Network" | "Agent Arena" |
| ❌ Description | "A decentralized agent economy on X Layer — where AI agents hire each other, execute tasks, and settle payments on-chain via the A2A payment protocol" | "A decentralized AI task marketplace on X Layer — where agents compete to complete tasks, get judged on-chain, and earn OKB" |
| ❌ Architecture | Describes Orchestrator collecting USDC, paying PriceOracle/TradeStrategy | Should describe postTask → applyForTask → assignTask → submitResult → judgeAndPay with OKB escrow |
| ❌ Payment flow code | `User → approve(orchestrator, budget)` / `Orchestrator → transfer(priceOracle, 0.001 USDC)` etc. | Should show: `Poster → postTask(desc, reward)` / `Agent → applyForTask(taskId)` / `Judge → judgeAndPay(taskId, score, winner)` |
| ❌ Components | agent-sdk (AgentAgentX), CF Workflow (A2APaymentWorkflow), shared-orchestrator | Should describe: Smart Contract (AgentArena.sol), CLI (@agent-arena/cli), SDK (@agent-arena/sdk), Indexer |
| ⚠️ Contract addresses | Lists TaskManager, PaymentHub, AgentRegistry, USDC | PaymentHub and USDC are legacy; Arena uses single AgentArena contract with native OKB |
| ❌ Quick nav | "Run your first workflow", "Build and customize multi-agent workflows", "Ship your own agent" | Should be: "Post your first task", "Register your agent", "Understand judging & rewards" |

---

### 10. Docs: Quick Start (`app/docs/usage/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Description | "From wallet connection to your first on-chain A2A workflow in under 5 minutes" | "From wallet connection to your first task or agent registration in under 5 minutes" |
| ❌ Prerequisites | "Testnet USDC at the test faucet — minimum 0.01 USDC" | "Testnet OKB — get from X Layer faucet" |
| ❌ Step 2 | "Browse the Agent Swarm" — describes orchestrator, price-oracle, trade-strategy | Should be "Enter the Arena" — browse open tasks, see agent leaderboard |
| ❌ Step 3 | "Run a Workflow" — USDC budget, workflow templates | Should be "Post a Task or Apply" — post task with OKB reward, or register agent and apply |
| ❌ Step 4 | "Monitor Tasks & Payments" — workflow steps (validate → collect → price_query → strategy → refund) | Should describe tracking task status (Open → InProgress → Completed/Refunded) |
| ❌ Step 5 | "Chat with an Agent Team" — Cloudflare Durable Object, Llama-3.3-70B | Remove or replace with "Understand Judging" — how judges evaluate and auto-settle |

---

### 11. Docs: Workflows (`app/docs/workflows/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Entire page | Describes Cloudflare Durable Workflows, A2A payment steps, USDC budgets, ETH/BTC trading templates, human-in-the-loop trade approval | **Entire page is wrong product.** Should be replaced with "Task Lifecycle" docs explaining: task creation → agent application → assignment → result submission → judging → payment/refund. Or repurposed to describe the Arena evaluation workflow. |

---

### 12. Docs: Deploy an Agent (`app/docs/agents/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Entire page | Describes AgentX base class, Cloudflare Worker deployment, USDC fee collection, A2A payment routing, revenue splits (70/20/10), ERC-8004 registration | **Wrong product.** Should describe how to build an AI agent for Agent Arena: register via CLI (`arena join`), monitor tasks via SDK, auto-apply for tasks, submit results, build reputation. |

---

### 13. Docs: API Reference (`app/docs/api/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Base URL | AgentX Cloudflare Worker (`agentx-worker.davirain-yin.workers.dev`) | Should reference the Agent Arena Indexer API |
| ❌ Endpoints | `/api/agents` (CF worker agents), `/api/a2a` (start A2A workflow), `/api/deploy` (provision AI session), `/agent/chat` (Llama-3.3-70B chat) | Should document Arena Indexer endpoints: `/tasks`, `/tasks/:id`, `/agents/:address`, `/leaderboard`, `/stats`, `/results/:id` |
| ❌ A2A Workflow endpoints | POST `/api/a2a`, GET `/api/a2a/:jobId`, POST `/api/a2a/simulate` | Remove — not relevant to Agent Arena |
| ❌ Agent Sessions | POST `/api/deploy`, POST `/agent/chat/:sessionId`, GET `/agent/history/:sessionId` | Remove — not relevant to Agent Arena |

---

### 14. Docs: Build a Worker Agent (`app/docs/build-agent/page.tsx`)

| Issue | Current Content | Should Say |
|-------|----------------|------------|
| ❌ Entire page | "Build a Worker Agent" — Cloudflare Worker + AgentConnector SDK + heartbeat cron + node registration | **Wrong product.** Should describe building an Arena-competing agent: setup SDK, register on-chain, auto-apply for tasks, implement task-solving logic, submit results. Reference the actual CLI and SDK. |

---

### 15. Redirect Pages (all redirect to `/arena`)

| Page | Status |
|------|--------|
| `/workflows` → redirects to `/arena` | ⚠️ Referenced by DashboardHome but just redirects |
| `/market` → redirects to `/arena` | ⚠️ Referenced by DashboardHome but just redirects |
| `/teams` → redirects to `/arena` | ⚠️ Referenced by DashboardHome but just redirects |
| `/tasks` → redirects to `/arena` | ⚠️ Referenced by DashboardHome but just redirects |
| `/settings` → redirects to `/arena` | ⚠️ Referenced by DashboardLayout sidebar but just redirects |

---

## Priority Summary

### 🔴 Critical (Wrong Product)
1. **LandingPage.tsx** — Entire page describes AgentX, not Agent Arena. First thing users see.
2. **DashboardHome.tsx** — Dashboard shows AgentX modules/stats, not Arena data.
3. **docs/page.tsx** — Docs overview describes AgentX architecture.
4. **docs/usage/page.tsx** — Quick Start guides users through AgentX workflow, not Arena.
5. **docs/workflows/page.tsx** — Entire page is about A2A workflows (wrong product).
6. **docs/agents/page.tsx** — Describes deploying CF Worker agents (wrong product).
7. **docs/api/page.tsx** — Documents AgentX Worker API, not Arena Indexer API.
8. **docs/build-agent/page.tsx** — Describes building AgentX node (wrong product).

### 🟡 Medium (Branding / Navigation)
9. **DashboardLayout.tsx** — Sidebar logo says "AGENTX" instead of "AGENT ARENA".
10. **DashboardHome modules** — Link to /workflows, /market, /teams, /tasks that all redirect to /arena.
11. **Settings nav item** — Links to non-existent settings page (redirects to /arena).

### 🟢 Correct (No changes needed)
12. **ArenaPage.tsx** — Core page, fully correct.
13. **ActivityFeed.tsx** — Correct on-chain events.
14. **ForHumans.tsx** — Correct personas and flow.
15. **DevHub.tsx** — Mostly correct SDK/API/contract reference.
16. **AgentRegister.tsx** — Correct registration flow.

---

## Key Theme: Two Products in One Codebase

The codebase appears to have evolved from an "AgentX Network" (A2A agent economy with USDC, Cloudflare Workers, orchestrator/oracle/strategy agents) into "Agent Arena" (task competition marketplace with OKB, judging, 修仙 reputation). The core Arena functionality (`ArenaPage`, `ForHumans`, `DevHub`, `AgentRegister`) is correct, but the landing page, dashboard, and all documentation still describe the legacy AgentX product.
