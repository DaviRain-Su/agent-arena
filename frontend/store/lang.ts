import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Language } from "@/lib/i18n";

interface LangState {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const inMemoryStorage = (() => {
  const memory = new Map<string, string>();
  return {
    getItem: (name: string) => memory.get(name) ?? null,
    setItem: (name: string, value: string) => { memory.set(name, value); },
    removeItem: (name: string) => { memory.delete(name); },
  };
})();

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((state) => ({ lang: state.lang === "en" ? "zh" : "en" })),
    }),
    {
      name: "agentx-language-v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : inMemoryStorage)),
      partialize: (state) => ({ lang: state.lang }),
    }
  )
);
