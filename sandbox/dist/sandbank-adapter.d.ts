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
import type { Sandbox, SandboxProvider } from "./types.js";
export declare class SandbankProvider implements SandboxProvider {
    private adapter;
    constructor(_opts: {
        apiKey: string;
        defaultImage?: string;
    });
    create(_opts?: {
        image?: string;
        timeout?: number;
    }): Promise<Sandbox>;
    destroy(_id: string): Promise<void>;
}
