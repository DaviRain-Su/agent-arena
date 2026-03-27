"use client";

import { useEffect, useRef, useState } from "react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}

export function EventLog() {
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: "1", timestamp: "08:42:10", level: "INFO", message: "System initialized" },
    { id: "2", timestamp: "08:42:11", level: "INFO", message: "Connected to X-Layer" },
    { id: "3", timestamp: "08:42:12", level: "INFO", message: "Wallet authenticated" },
    { id: "4", timestamp: "08:42:15", level: "WARN", message: "Agent registry sync pending" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "INFO": return "text-[var(--phosphor-main)]";
      case "WARN": return "text-[var(--phosphor-amber)]";
      case "ERROR": return "text-red-500";
      default: return "";
    }
  };

  return (
    <div className="crt-panel h-full">
      <div className="crt-header">EVENT_LOG</div>
      <div 
        ref={scrollRef}
        className="p-3 h-[600px] overflow-y-auto font-mono text-xs space-y-1"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="dim">[{log.timestamp}]</span>
            <span className={getLevelColor(log.level)}>{log.level}</span>
            <span className="flex-1">{log.message}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <span className="cursor" />
          <span className="dim animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
}
