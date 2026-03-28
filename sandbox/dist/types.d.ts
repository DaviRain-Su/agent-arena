/**
 * Sandbox abstraction — matches Sandbank SDK surface.
 * V1: Node.js vm (process-local, JS only)
 * V2: swap to Sandbank DaytonaAdapter / FlyAdapter for real container isolation
 */
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface Sandbox {
    id: string;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exec(command: string, opts?: {
        timeout?: number;
    }): Promise<ExecResult>;
    destroy(): Promise<void>;
}
export interface SandboxProvider {
    create(opts?: {
        image?: string;
        timeout?: number;
    }): Promise<Sandbox>;
    destroy(id: string): Promise<void>;
}
export interface TestCase {
    input: unknown[];
    expected: unknown;
    desc?: string;
}
export interface TestResult {
    desc: string;
    passed: boolean;
    got?: unknown;
    expected: unknown;
    error?: string;
}
