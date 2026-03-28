import vm from "node:vm";
import { randomUUID } from "node:crypto";
/**
 * In-process sandbox using Node.js vm module.
 * Cheap, zero-dependency, JS-only. Good enough for MVP.
 * Replace with Sandbank DaytonaAdapter when multi-language is needed.
 */
class NodeVMSandbox {
    id;
    files = new Map();
    destroyed = false;
    defaultTimeout;
    constructor(opts) {
        this.id = randomUUID();
        this.defaultTimeout = opts?.timeout ?? 5000;
    }
    async writeFile(path, content) {
        this.assertAlive();
        this.files.set(path, content);
    }
    async readFile(path) {
        this.assertAlive();
        const content = this.files.get(path);
        if (content === undefined)
            throw new Error(`File not found: ${path}`);
        return content;
    }
    async exec(command, opts) {
        this.assertAlive();
        const timeout = opts?.timeout ?? this.defaultTimeout;
        // Build a virtual filesystem available to the script via __files
        const stdout = [];
        const stderr = [];
        const context = vm.createContext({
            __files: Object.fromEntries(this.files),
            console: {
                log: (...args) => stdout.push(args.map(String).join(" ")),
                error: (...args) => stderr.push(args.map(String).join(" ")),
                warn: (...args) => stderr.push(args.map(String).join(" ")),
            },
            JSON,
            Array,
            Object,
            Map,
            Set,
            Math,
            Date,
            Error,
            TypeError,
            RangeError,
            parseInt,
            parseFloat,
            isNaN,
            isFinite,
            undefined,
            NaN,
            Infinity,
            RegExp,
            String,
            Number,
            Boolean,
            Symbol,
            Promise,
            setTimeout: undefined,
            setInterval: undefined,
        });
        try {
            const script = new vm.Script(command, { filename: "sandbox.js" });
            script.runInContext(context, { timeout });
            return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), exitCode: 0 };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            stderr.push(msg);
            return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), exitCode: 1 };
        }
    }
    async destroy() {
        this.files.clear();
        this.destroyed = true;
    }
    assertAlive() {
        if (this.destroyed)
            throw new Error(`Sandbox ${this.id} already destroyed`);
    }
}
export class NodeVMProvider {
    sandboxes = new Map();
    async create(opts) {
        const sb = new NodeVMSandbox(opts);
        this.sandboxes.set(sb.id, sb);
        return sb;
    }
    async destroy(id) {
        const sb = this.sandboxes.get(id);
        if (sb) {
            await sb.destroy();
            this.sandboxes.delete(id);
        }
    }
}
