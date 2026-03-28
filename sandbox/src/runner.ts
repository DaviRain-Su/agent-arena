import type { SandboxProvider, TestCase, TestResult } from "./types.js";

/**
 * High-level test runner — executes test cases against submitted code.
 * Works with any SandboxProvider (NodeVM now, Sandbank in V2).
 */
export async function runTests(
  provider: SandboxProvider,
  code: string,
  functionName: string,
  testCases: TestCase[],
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const tc of testCases) {
    const sandbox = await provider.create({ timeout: 5000 });
    try {
      const args = tc.input.map(a => JSON.stringify(a)).join(", ");
      const script = `
        ${code}
        var __result = ${functionName}(${args});
        console.log(JSON.stringify(__result));
      `;

      const { stdout, stderr, exitCode } = await sandbox.exec(script, { timeout: 3000 });

      if (exitCode !== 0) {
        results.push({
          desc: tc.desc ?? "test",
          passed: false,
          expected: tc.expected,
          error: stderr || "Non-zero exit code",
        });
        continue;
      }

      const lastLine = stdout.trim().split("\n").pop() ?? "";
      let got: unknown;
      try {
        got = JSON.parse(lastLine);
      } catch {
        results.push({
          desc: tc.desc ?? "test",
          passed: false,
          expected: tc.expected,
          got: lastLine,
          error: "Failed to parse output as JSON",
        });
        continue;
      }

      const passed = JSON.stringify(got) === JSON.stringify(tc.expected);
      results.push({ desc: tc.desc ?? "test", passed, got, expected: tc.expected });
    } catch (e: unknown) {
      results.push({
        desc: tc.desc ?? "test",
        passed: false,
        expected: tc.expected,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await provider.destroy(sandbox.id);
    }
  }

  return results;
}

export function calcScore(results: TestResult[], maxPoints: number): number {
  if (results.length === 0) return 0;
  const passed = results.filter(r => r.passed).length;
  return Math.round((passed / results.length) * maxPoints);
}
