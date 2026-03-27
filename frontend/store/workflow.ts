import { create } from "zustand";

// 本地类型定义
interface WorkflowStep {
  id: string;
  agentId: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  dependsOn: string[];
  humanApproval?: boolean;
  timeout?: number;
}

interface WorkflowState {
  currentWorkflow: { id: string; name: string } | null;
  steps: WorkflowStep[];
  executionMode: "sequential" | "parallel" | "conditional";
  addStep: (step: Omit<WorkflowStep, "id">) => void;
  removeStep: (id: string) => void;
  updateStep: (id: string, updates: Partial<WorkflowStep>) => void;
  setExecutionMode: (mode: "sequential" | "parallel" | "conditional") => void;
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  currentWorkflow: null,
  steps: [],
  executionMode: "sequential",

  addStep: (step) =>
    set((state) => {
      const newStep: WorkflowStep = {
        ...step,
        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      return { steps: [...state.steps, newStep] };
    }),

  removeStep: (id) =>
    set((state) => ({
      steps: state.steps.filter((s) => s.id !== id),
    })),

  updateStep: (id, updates) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  setExecutionMode: (mode) =>
    set({ executionMode: mode }),

  reset: () => set({ currentWorkflow: null, steps: [], executionMode: "sequential" }),
}));
