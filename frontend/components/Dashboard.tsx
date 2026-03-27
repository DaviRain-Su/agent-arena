"use client";

import { useState } from "react";
import { WorkflowBuilder } from "./WorkflowBuilder";
import { TaskList } from "./TaskList";
import { AgentMarket } from "./AgentMarket";
import { TeamBuilder } from "./TeamBuilder";
import { SystemStatus } from "./SystemStatus";
import { EventLog } from "./EventLog";
import { useWeb3 } from "./Web3Provider";

const NAV_ITEMS = [
  { id: "workflows", label: "WORKFLOWS", desc: "Build & Deploy" },
  { id: "market", label: "AGENT_SWARM", desc: "Browse & Publish" },
  { id: "teams", label: "TEAM_FORMATION", desc: "Create Squads" },
  { id: "tasks", label: "TASK_MONITOR", desc: "Active Operations" },
];

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("workflows");
  const { address, disconnect } = useWeb3();

  const renderContent = () => {
    switch (activeTab) {
      case "workflows":
        return <WorkflowBuilder />;
      case "market":
        return <AgentMarket />;
      case "teams":
        return <TeamBuilder />;
      case "tasks":
        return <TaskList />;
      default:
        return <WorkflowBuilder />;
    }
  };

  return (
    <div className="crt-screen min-h-screen">
      <div className="scanline" />

      {/* Header */}
      <header className="border-b border-[var(--phosphor-dim)] p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold terminal-text" style={{ color: '#1de1f1' }}>AGENTX</div>
            <div className="dim text-sm">// TERMINAL_SESSION_ACTIVE</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs">
              <span className="dim">OPERATOR: </span>
              <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            </div>
            <button onClick={disconnect} className="crt-button text-xs">
              [ TERMINATE ]
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="grid grid-cols-12 gap-4 p-4">
        {/* Left Sidebar - Navigation */}
        <div className="col-span-2">
          <div className="crt-panel h-full">
            <div className="crt-header">NAVIGATION</div>
            <div className="p-2 space-y-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full text-left p-3 text-sm transition ${
                    activeTab === item.id
                      ? "bg-[var(--phosphor-main)] text-black font-bold"
                      : "hover:bg-[var(--phosphor-main)]/10 border border-transparent hover:border-[var(--phosphor-dim)]"
                  }`}
                >
                  <div>{item.label}</div>
                  <div className="text-xs opacity-70">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Main Content */}
        <div className="col-span-7">
          <div className="crt-panel min-h-[700px]">{renderContent()}</div>
        </div>

        {/* Right Sidebar */}
        <div className="col-span-3 space-y-4">
          <SystemStatus />
          <EventLog />
        </div>
      </div>
    </div>
  );
}
