import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const DEFAULT_WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || "https://agentx-worker.davirain-yin.workers.dev";

export const DEFAULT_SETTINGS = {
  rpcEndpoint: "https://rpc.xlayer.tech",
  agentModel: "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  defaultBudgetUsdc: "5",
  workerUrl: DEFAULT_WORKER_URL,
} as const;

interface AppSettingsState {
  rpcEndpoint: string;
  agentModel: string;
  defaultBudgetUsdc: string;
  workerUrl: string;
  setRpcEndpoint: (value: string) => void;
  setAgentModel: (value: string) => void;
  setDefaultBudgetUsdc: (value: string) => void;
  setWorkerUrl: (value: string) => void;
  reset: () => void;
}

const inMemoryStorage = (() => {
  const memory = new Map<string, string>();
  return {
    getItem: (name: string) => memory.get(name) ?? null,
    setItem: (name: string, value: string) => { memory.set(name, value); },
    removeItem: (name: string) => { memory.delete(name); },
  };
})();

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setRpcEndpoint: (value) => set({ rpcEndpoint: value.trim() || DEFAULT_SETTINGS.rpcEndpoint }),
      setAgentModel: (value) => set({ agentModel: value.trim() || DEFAULT_SETTINGS.agentModel }),
      setDefaultBudgetUsdc: (value) => set({ defaultBudgetUsdc: value.trim() || DEFAULT_SETTINGS.defaultBudgetUsdc }),
      setWorkerUrl: (value) => set({ workerUrl: value.trim() || DEFAULT_SETTINGS.workerUrl }),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: "agentx-app-settings-v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : inMemoryStorage)),
      partialize: (state) => ({
        rpcEndpoint: state.rpcEndpoint,
        agentModel: state.agentModel,
        defaultBudgetUsdc: state.defaultBudgetUsdc,
        workerUrl: state.workerUrl,
      }),
    }
  )
);
