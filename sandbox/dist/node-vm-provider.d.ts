import type { Sandbox, SandboxProvider } from "./types.js";
export declare class NodeVMProvider implements SandboxProvider {
    private sandboxes;
    create(opts?: {
        image?: string;
        timeout?: number;
    }): Promise<Sandbox>;
    destroy(id: string): Promise<void>;
}
