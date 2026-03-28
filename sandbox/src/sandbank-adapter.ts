/**
 * Sandbank Adapter — V2 placeholder
 *
 * Swap NodeVMProvider → SandbankProvider for real container isolation.
 * Enables Python, Go, Rust execution in addition to JS.
 *
 * Install: npm install @sandbank.dev/core @sandbank.dev/daytona
 *
 * Usage (V2):
 *
 *   import { createProvider } from '@sandbank.dev/core'
 *   import { DaytonaAdapter } from '@sandbank.dev/daytona'
 *   import { runTests } from '@agent-arena/sandbox'
 *
 *   const provider = createProvider(new DaytonaAdapter({ apiKey: process.env.DAYTONA_KEY }))
 *   const results  = await runTests(provider, code, 'deepMerge', testCases)
 *   await provider.destroyAll()
 *
 * The SandboxProvider interface is designed to match Sandbank's surface:
 *   provider.create({ image: 'node:22' })  → Sandbox { writeFile, readFile, exec, destroy }
 *   provider.destroy(id)
 *
 * No changes needed in Judge, demo.js, or any consumer — just swap the provider.
 *
 * ┌─────────────────────┬──────────────────────┬─────────────────────┐
 * │                     │  V1 (NodeVMProvider)  │  V2 (Sandbank)      │
 * ├─────────────────────┼──────────────────────┼─────────────────────┤
 * │ Container isolation │  ❌ in-process vm     │  ✅ real container   │
 * │ Multi-language      │  ❌ JS only           │  ✅ any language     │
 * │ Dependencies        │  ❌ none              │  ✅ npm/pip/cargo    │
 * │ Cost                │  free                 │  pay-per-use        │
 * │ Setup               │  zero                 │  API key needed     │
 * └─────────────────────┴──────────────────────┴─────────────────────┘
 */

import type { Sandbox, SandboxProvider, ExecResult } from "./types.js";

export class SandbankProvider implements SandboxProvider {
  private adapter: unknown;

  constructor(_opts: { apiKey: string; defaultImage?: string }) {
    throw new Error(
      "SandbankProvider is a V2 placeholder. " +
      "Install @sandbank.dev/core and @sandbank.dev/daytona, then implement this class."
    );
  }

  async create(_opts?: { image?: string; timeout?: number }): Promise<Sandbox> {
    // V2: return adapter.createSandbox(opts)
    throw new Error("Not implemented — V2");
  }

  async destroy(_id: string): Promise<void> {
    // V2: return adapter.destroySandbox(id)
    throw new Error("Not implemented — V2");
  }
}
