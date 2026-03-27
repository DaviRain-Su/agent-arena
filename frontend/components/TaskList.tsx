"use client";

import { useState } from "react";
import { useWeb3 } from "./Web3Provider";
import { Play, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

// Mock tasks for demo
const MOCK_TASKS = [
  {
    id: "task_001",
    name: "ETH Price Monitor & Buy",
    status: "completed",
    steps: 3,
    completedSteps: 3,
    cost: 1.2,
    createdAt: "2024-03-23 10:30",
  },
  {
    id: "task_002",
    name: "Portfolio Rebalance",
    status: "executing",
    steps: 5,
    completedSteps: 2,
    cost: 2.5,
    createdAt: "2024-03-23 11:15",
  },
  {
    id: "task_003",
    name: "Arbitrage Check",
    status: "pending_confirmation",
    steps: 4,
    completedSteps: 1,
    cost: 1.8,
    createdAt: "2024-03-23 12:00",
  },
];

const STATUS_ICONS = {
  completed: CheckCircle,
  executing: Clock,
  pending_confirmation: AlertCircle,
  failed: XCircle,
};

const STATUS_COLORS = {
  completed: "text-green-600 bg-green-50",
  executing: "text-blue-600 bg-blue-50",
  pending_confirmation: "text-amber-600 bg-amber-50",
  failed: "text-red-600 bg-red-50",
};

const STATUS_LABELS = {
  completed: "Completed",
  executing: "Executing",
  pending_confirmation: "Needs Approval",
  failed: "Failed",
};

export function TaskList() {
  const { isConnected } = useWeb3();
  const [tasks] = useState(MOCK_TASKS);

  if (!isConnected) {
    return (
      <div className="bg-white p-12 rounded-lg shadow text-center">
        <p className="text-gray-600">Connect your wallet to view your tasks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <p className="text-gray-600">No tasks yet. Create a workflow to get started.</p>
        </div>
      ) : (
        tasks.map((task) => {
          const StatusIcon = STATUS_ICONS[task.status as keyof typeof STATUS_ICONS];
          return (
            <div key={task.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{task.name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                        STATUS_COLORS[task.status as keyof typeof STATUS_COLORS]
                      }`}
                    >
                      <StatusIcon size={14} />
                      {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS]}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    Created: {task.createdAt}
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-600">Progress: </span>
                      <span className="font-medium">
                        {task.completedSteps} / {task.steps} steps
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cost: </span>
                      <span className="font-medium">${task.cost} USDC</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{
                        width: `${(task.completedSteps / task.steps) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="ml-4 flex flex-col gap-2">
                  {task.status === "pending_confirmation" && (
                    <>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                        Approve
                      </button>
                      <button className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                        Reject
                      </button>
                    </>
                  )}
                  {task.status === "executing" && (
                    <button className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                      View Details
                    </button>
                  )}
                  {task.status === "completed" && (
                    <button className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                      View Result
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
