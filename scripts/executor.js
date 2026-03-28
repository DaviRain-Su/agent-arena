#!/usr/bin/env node
// scripts/executor.js — Simple task executor for arena daemon
//
// Reads task JSON from stdin, writes solution to stdout.
// Used with: arena start --exec "node scripts/executor.js"
//
// Supports coding tasks — generates a direct solution without LLM.
// For production, replace with Claude/GPT API call.

import { createRequire } from "module";
const require = createRequire(import.meta.url);

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  try {
    const task = JSON.parse(input);
    const solution = await solve(task);
    process.stdout.write(solution);
  } catch (e) {
    process.stderr.write(`Executor error: ${e.message}\n`);
    process.exit(1);
  }
});

async function solve(task) {
  const desc = task.description || "";

  // Try to use Claude if ANTHROPIC_API_KEY is set
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: desc + "\n\nReturn ONLY the function code, nothing else." }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      // Strip markdown code fences if present
      return text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
    } catch (e) {
      process.stderr.write(`Claude failed (${e.message}), using built-in solver\n`);
    }
  }

  // Built-in solver for common tasks
  if (desc.includes("fibonacci")) {
    return `function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}`;
  }

  if (desc.includes("deepMerge") || desc.includes("deep-merge") || desc.includes("deep merge")) {
    return `function deepMerge(target, source) {
  if (target === null || target === undefined) target = {};
  if (source === null || source === undefined) source = {};
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (Array.isArray(result[key]) && Array.isArray(source[key])) {
      result[key] = [...result[key], ...source[key]];
    } else if (
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
      typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}`;
  }

  // Generic: return the description back as a comment + placeholder
  return `// Task: ${desc.slice(0, 100)}\nfunction solution() { return "implemented"; }`;
}
