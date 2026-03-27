"use client";

import { useState } from "react";
import { Search, Plus, Star, Download, User } from "lucide-react";

// Mock data for agents
const MOCK_AGENTS = [
  {
    id: "1",
    name: "PRICE_ORACLE_V2",
    description: "Real-time price monitoring across 50+ DEXs",
    author: "0x742d...8a3f",
    rating: 4.8,
    downloads: 1284,
    price: 0.1,
    category: "DATA",
    tags: ["price", "oracle", "realtime"],
  },
  {
    id: "2",
    name: "MEV_PROTECTOR",
    description: "Sandwich attack protection for trades",
    author: "0x991a...2b7c",
    rating: 4.9,
    downloads: 892,
    price: 0.5,
    category: "SECURITY",
    tags: ["mev", "protection", "trading"],
  },
  {
    id: "3",
    name: "YIELD_OPTIMIZER",
    description: "Auto-compound and rebalance LP positions",
    author: "0x3f21...9d1e",
    rating: 4.6,
    downloads: 2156,
    price: 0.3,
    category: "DEFI",
    tags: ["yield", "farming", "automation"],
  },
  {
    id: "4",
    name: "SENTIMENT_ANALYZER",
    description: "Social media sentiment for token trends",
    author: "0x8c44...5a2b",
    rating: 4.3,
    downloads: 567,
    price: 0.2,
    category: "AI",
    tags: ["sentiment", "social", "ml"],
  },
];

const CATEGORIES = ["ALL", "DATA", "SECURITY", "DEFI", "AI", "TRADING"];

export function AgentMarket() {
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublish, setShowPublish] = useState(false);

  const filteredAgents = MOCK_AGENTS.filter((agent) => {
    const matchesCategory = activeCategory === "ALL" || agent.category === activeCategory;
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">AGENT_MARKETPLACE</h2>
          <p className="text-sm dim">BROWSE // DEPLOY // PUBLISH</p>
        </div>
        <button 
          onClick={() => setShowPublish(true)}
          className="crt-button flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          PUBLISH_AGENT
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dim" />
          <input
            type="text"
            placeholder="SEARCH_AGENTS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full crt-input pl-10"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-sm border ${
              activeCategory === cat
                ? "border-[var(--phosphor-main)] bg-[var(--phosphor-main)]/10"
                : "border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>

      {/* Publish Modal */}
      {showPublish && (
        <PublishModal onClose={() => setShowPublish(false)} />
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: typeof MOCK_AGENTS[0] }) {
  return (
    <div className="border border-[var(--phosphor-dim)] p-4 hover:border-[var(--phosphor-main)] transition">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold">{agent.name}</h3>
          <p className="text-xs dim mt-1">{agent.description}</p>
        </div>
        <div className="text-right">
          <div className="text-[var(--phosphor-main)] font-bold">${agent.price}</div>
          <div className="text-xs dim">per call</div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {agent.tags.map((tag) => (
          <span key={tag} className="text-xs px-2 py-0.5 bg-[var(--phosphor-main)]/10">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex justify-between items-center text-sm border-t border-[var(--phosphor-dim)] pt-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 dim" />
            <span className="dim">{agent.author}</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-[var(--phosphor-amber)]" />
            <span>{agent.rating}</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="w-3 h-3 dim" />
            <span className="dim">{agent.downloads}</span>
          </div>
        </div>
        <button className="crt-button text-xs">
          DEPLOY
        </button>
      </div>
    </div>
  );
}

function PublishModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="crt-panel w-full max-w-2xl">
        <div className="crt-header flex justify-between items-center">
          <span>PUBLISH_NEW_AGENT</span>
          <button onClick={onClose} className="hover:text-red-500">[X]</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="dim text-sm block mb-2">AGENT_NAME</label>
            <input type="text" className="crt-input" placeholder="MY_AGENT_V1" />
          </div>
          <div>
            <label className="dim text-sm block mb-2">DESCRIPTION</label>
            <textarea className="crt-input h-24" placeholder="What does this agent do..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dim text-sm block mb-2">CATEGORY</label>
              <select className="crt-input">
                <option>DATA</option>
                <option>SECURITY</option>
                <option>DEFI</option>
                <option>AI</option>
                <option>TRADING</option>
              </select>
            </div>
            <div>
              <label className="dim text-sm block mb-2">PRICE (USDC)</label>
              <input type="number" className="crt-input" placeholder="0.1" step="0.01" />
            </div>
          </div>
          <div>
            <label className="dim text-sm block mb-2">AGENT_CODE / ENDPOINT</label>
            <textarea className="crt-input h-32 font-mono text-xs" placeholder="// Agent implementation or API endpoint..." />
          </div>
          <div className="flex gap-4 pt-4">
            <button className="crt-button flex-1">PUBLISH_TO_MARKET</button>
            <button onClick={onClose} className="crt-button flex-1">CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  );
}
