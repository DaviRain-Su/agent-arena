"use client";

import { useState } from "react";
import { useWorkflowStore } from "@/store/workflow";
import { WorkflowSubmit } from "./WorkflowSubmit";
import { Plus, Trash2 } from "lucide-react";

const AGENT_TEMPLATES = [
  { id: "price-monitor", name: "PRICE_MONITOR", desc: "Token price tracking", cost: 0.2 },
  { id: "condition-eval", name: "CONDITION_EVAL", desc: "Logic evaluation", cost: 0.5 },
  { id: "trade-executor", name: "TRADE_EXEC", desc: "DEX execution", cost: 0.5 },
];

const EXEC_MODES = [
  { id: "sequential", name: "SEQUENTIAL", desc: "Step by step execution" },
  { id: "parallel", name: "PARALLEL", desc: "Concurrent execution" },
  { id: "conditional", name: "CONDITIONAL", desc: "Branch on condition" },
];

export function WorkflowBuilder() {
  const { steps, addStep, removeStep, executionMode, setExecutionMode } = useWorkflowStore();
  const [showSubmit, setShowSubmit] = useState(false);

  const handleAddStep = (template: typeof AGENT_TEMPLATES[0]) => {
    addStep({
      agentId: template.id,
      name: template.name,
      description: template.desc,
      config: {},
      dependsOn: steps.length > 0 ? [steps[steps.length - 1].id] : [],
      humanApproval: template.id === "trade-executor",
      timeout: 300,
    });
  };

  const totalCost = steps.reduce((sum, step) => {
    const template = AGENT_TEMPLATES.find((t) => t.id === step.agentId);
    return sum + (template?.cost || 0.5);
  }, 0);

  return (
    <div className="p-4">
      {/* Execution Mode */}
      <div className="mb-6">
        <div className="dim mb-2">EXECUTION_MODE</div>
        <div className="grid grid-cols-3 gap-2">
          {EXEC_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setExecutionMode(mode.id as any)}
              className={`p-3 text-left border ${
                executionMode === mode.id
                  ? "border-[var(--phosphor-main)] bg-[var(--phosphor-main)]/10"
                  : "border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)]"
              }`}
            >
              <div className="font-bold text-sm">{mode.name}</div>
              <div className="text-xs dim">{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Available Agents */}
        <div>
          <div className="dim mb-2">AVAILABLE_AGENTS</div>
          <div className="space-y-2">
            {AGENT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleAddStep(template)}
                className="w-full p-3 border border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)] hover:bg-[var(--phosphor-main)]/5 transition text-left"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold">{template.name}</div>
                    <div className="text-xs dim">{template.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[var(--phosphor-main)]">${template.cost}</div>
                    <Plus className="w-4 h-4 mt-1" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Workflow Steps */}
        <div>
          <div className="dim mb-2">WORKFLOW_STEPS ({steps.length})</div>
          <div className="space-y-2 min-h-[200px] border border-[var(--phosphor-dim)] p-3">
            {steps.length === 0 ? (
              <div className="text-center py-8 dim">
                NO_STEPS_DEFINED
              </div>
            ) : (
              steps.map((step, index) => (
                <div
                  key={step.id}
                  className="p-3 border border-[var(--phosphor-main)]/30 bg-[var(--phosphor-main)]/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 flex items-center justify-center bg-[var(--phosphor-main)] text-[var(--bg-deep)] font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{step.name}</div>
                      {step.humanApproval && (
                        <div className="text-xs text-[var(--phosphor-amber)]">
                          REQUIRES_APPROVAL
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeStep(step.id)}
                      className="p-1 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary */}
          {steps.length > 0 && (
            <div className="mt-4 p-3 border border-[var(--phosphor-dim)]">
              <div className="flex justify-between text-sm mb-2">
                <span className="dim">TOTAL_STEPS:</span>
                <span>{steps.length}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="dim">APPROVALS_NEEDED:</span>
                <span>{steps.filter((s) => s.humanApproval).length}</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="dim">ESTIMATED_COST:</span>
                <span className="text-[var(--phosphor-main)]">${totalCost.toFixed(2)} USDC</span>
              </div>
              <button
                onClick={() => setShowSubmit(true)}
                className="w-full crt-button"
              >
                [ DEPLOY_WORKFLOW ]
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmit && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="crt-panel w-full max-w-lg">
            <div className="crt-header flex justify-between items-center">
              <span>DEPLOY_WORKFLOW</span>
              <button onClick={() => setShowSubmit(false)} className="hover:text-red-500">
                [X]
              </button>
            </div>
            <div className="p-4">
              <WorkflowSubmit onClose={() => setShowSubmit(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
