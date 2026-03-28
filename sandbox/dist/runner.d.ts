import type { SandboxProvider, TestCase, TestResult } from "./types.js";
/**
 * High-level test runner — executes test cases against submitted code.
 * Works with any SandboxProvider (NodeVM now, Sandbank in V2).
 */
export declare function runTests(provider: SandboxProvider, code: string, functionName: string, testCases: TestCase[]): Promise<TestResult[]>;
export declare function calcScore(results: TestResult[], maxPoints: number): number;
