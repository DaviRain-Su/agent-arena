"use client";

import { useState } from "react";
import { Plus, MessageSquare, Users, X, Send } from "lucide-react";

// Mock data
const MY_AGENTS = [
  { id: "1", name: "PRICE_ORACLE", status: "idle" },
  { id: "2", name: "TRADE_EXEC", status: "busy" },
  { id: "3", name: "SENTIMENT_AI", status: "idle" },
];

const MOCK_TEAMS = [
  {
    id: "team1",
    name: "ALPHA_TRADING_SQUAD",
    members: ["PRICE_ORACLE", "TRADE_EXEC", "RISK_MANAGER"],
    messageCount: 128,
    lastActive: "2m ago",
  },
  {
    id: "team2",
    name: "RESEARCH_POD",
    members: ["SENTIMENT_AI", "DATA_SCRAPER", "ANALYST_GPT"],
    messageCount: 56,
    lastActive: "1h ago",
  },
];

interface Message {
  id: string;
  sender: string;
  senderType: "user" | "agent";
  content: string;
  timestamp: string;
}

export function TeamBuilder() {
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">TEAM_FORMATION</h2>
          <p className="text-sm dim">ASSEMBLE_AGENT_SQUADS // COLLABORATIVE_EXECUTION</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="crt-button flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          CREATE_TEAM
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Team List */}
        <div className="col-span-1">
          <div className="crt-panel h-[600px]">
            <div className="crt-header">ACTIVE_TEAMS</div>
            <div className="p-2 space-y-2">
              {MOCK_TEAMS.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setActiveTeam(team.id)}
                  className={`w-full text-left p-3 border transition ${
                    activeTeam === team.id
                      ? "border-[var(--phosphor-main)] bg-[var(--phosphor-main)]/10"
                      : "border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)]"
                  }`}
                >
                  <div className="font-bold text-sm">{team.name}</div>
                  <div className="text-xs dim mt-1">
                    {team.members.length} AGENTS // {team.messageCount} MSGS
                  </div>
                  <div className="text-xs dim">LAST: {team.lastActive}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="col-span-2">
          {activeTeam ? (
            <TeamChat teamId={activeTeam} />
          ) : (
            <div className="crt-panel h-[600px] flex items-center justify-center">
              <div className="text-center">
                <Users className="w-12 h-12 dim mx-auto mb-4" />
                <p className="dim">SELECT_A_TEAM_TO_VIEW_CHANNEL</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function TeamChat({ teamId }: { teamId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "PRICE_ORACLE",
      senderType: "agent",
      content: "ETH/USDT price updated: $1,847.32 (+2.3%)",
      timestamp: "14:32:10",
    },
    {
      id: "2",
      sender: "RISK_MANAGER",
      senderType: "agent",
      content: "Volatility spike detected. Recommend position sizing adjustment.",
      timestamp: "14:32:15",
    },
    {
      id: "3",
      sender: "USER",
      senderType: "user",
      content: "What's the current sentiment on ETH?",
      timestamp: "14:33:00",
    },
    {
      id: "4",
      sender: "SENTIMENT_AI",
      senderType: "agent",
      content: "Social sentiment: BULLISH (72% positive mentions in last 1h). Twitter volume up 45%.",
      timestamp: "14:33:05",
    },
  ]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: "USER",
      senderType: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
    };
    setMessages([...messages, newMsg]);
    setInput("");

    // Simulate agent response
    setTimeout(() => {
      const agentResponse: Message = {
        id: (Date.now() + 1).toString(),
        sender: "TRADE_EXEC",
        senderType: "agent",
        content: "Acknowledged. Monitoring for execution opportunities.",
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      };
      setMessages((prev) => [...prev, agentResponse]);
    }, 1000);
  };

  return (
    <div className="crt-panel h-[600px] flex flex-col">
      <div className="crt-header flex justify-between items-center">
        <span>#{teamId.toUpperCase()}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-[var(--phosphor-main)] animate-pulse" />
          4 MEMBERS ONLINE
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.senderType === "user" ? "flex-row-reverse" : ""
            }`}
          >
            <div
              className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                msg.senderType === "user"
                  ? "bg-[var(--phosphor-main)] text-black"
                  : "border border-[var(--phosphor-main)]"
              }`}
            >
              {msg.senderType === "user" ? "U" : "A"}
            </div>
            <div className={`flex-1 ${msg.senderType === "user" ? "text-right" : ""}`}>
              <div className="flex items-center gap-2 mb-1 justify-start">
                <span className="font-bold text-sm">{msg.sender}</span>
                <span className="text-xs dim">{msg.timestamp}</span>
              </div>
              <div
                className={`inline-block p-3 text-sm ${
                  msg.senderType === "user"
                    ? "bg-[var(--phosphor-main)]/20 border border-[var(--phosphor-main)]"
                    : "bg-[var(--phosphor-main)]/5 border border-[var(--phosphor-dim)]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--phosphor-dim)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="ENTER_COMMAND..."
            className="flex-1 crt-input"
          />
          <button onClick={sendMessage} className="crt-button px-4">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          {MY_AGENTS.filter((a) => a.status === "idle").map((agent) => (
            <button
              key={agent.id}
              className="text-xs px-2 py-1 border border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)]"
            >
              @{agent.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="crt-panel w-full max-w-lg">
        <div className="crt-header flex justify-between items-center">
          <span>CREATE_NEW_TEAM</span>
          <button onClick={onClose} className="hover:text-red-500">
            [X]
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="dim text-sm block mb-2">TEAM_NAME</label>
            <input type="text" className="crt-input" placeholder="MY_TRADING_SQUAD" />
          </div>

          <div>
            <label className="dim text-sm block mb-2">SELECT_AGENTS</label>
            <div className="space-y-2 border border-[var(--phosphor-dim)] p-3">
              {MY_AGENTS.map((agent) => (
                <label key={agent.id} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[var(--phosphor-main)]" />
                  <span className="flex-1">{agent.name}</span>
                  <span className={`text-xs ${agent.status === "idle" ? "text-[var(--phosphor-main)]" : "dim"}`}>
                    {agent.status.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="dim text-sm block mb-2">EXECUTION_MODE</label>
            <select className="crt-input">
              <option>SEQUENTIAL - One at a time</option>
              <option>PARALLEL - All together</option>
              <option>DEMOCRATIC - Vote on decisions</option>
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button className="crt-button flex-1">CREATE_TEAM</button>
            <button onClick={onClose} className="crt-button flex-1">
              CANCEL
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
