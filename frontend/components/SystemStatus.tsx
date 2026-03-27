"use client";

import { useWeb3 } from "./Web3Provider";
import { useEffect, useState } from "react";

export function SystemStatus() {
  const { address } = useWeb3();
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toISOString().replace("T", " ").slice(0, 19));
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="crt-panel h-full">
      <div className="crt-header">SYSTEM_STATUS</div>
      <div className="p-4 space-y-4 text-sm">
        {/* Connection Status */}
        <div>
          <div className="dim mb-1">CONNECTION</div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--phosphor-main)] animate-pulse" />
            <span className="status-online">ONLINE</span>
          </div>
        </div>

        {/* Wallet Address */}
        <div>
          <div className="dim mb-1">WALLET_ID</div>
          <div className="font-mono text-xs break-all">
            {address?.slice(0, 8)}...{address?.slice(-8)}
          </div>
        </div>

        {/* System Time */}
        <div>
          <div className="dim mb-1">SYSTEM_TIME</div>
          <div className="font-mono">{time}</div>
        </div>

        {/* Resource Usage */}
        <div>
          <div className="dim mb-1">MEMORY_USAGE</div>
          <div className="crt-progress">
            <div className="crt-progress-fill" style={{ width: "42%" }} />
          </div>
          <div className="text-right text-xs mt-1">42%</div>
        </div>

        <div>
          <div className="dim mb-1">CPU_LOAD</div>
          <div className="crt-progress">
            <div className="crt-progress-fill" style={{ width: "28%" }} />
          </div>
          <div className="text-right text-xs mt-1">28%</div>
        </div>

        {/* Active Agents */}
        <div>
          <div className="dim mb-1">ACTIVE_AGENTS</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Price_Monitor</span>
              <span className="status-online">●</span>
            </div>
            <div className="flex justify-between">
              <span>Condition_Eval</span>
              <span className="status-online">●</span>
            </div>
            <div className="flex justify-between">
              <span>Trade_Exec</span>
              <span className="dim">○</span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="pt-4 border-t border-[var(--phosphor-dim)]">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 bg-[var(--phosphor-main)]/5">
              <div className="text-lg font-bold">0</div>
              <div className="text-xs dim">TASKS</div>
            </div>
            <div className="p-2 bg-[var(--phosphor-main)]/5">
              <div className="text-lg font-bold">0</div>
              <div className="text-xs dim">WORKFLOWS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
