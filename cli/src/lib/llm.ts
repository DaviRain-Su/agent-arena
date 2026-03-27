// src/lib/llm.ts — LLM backend abstraction
// Supports: Claude (Anthropic), OpenAI, Ollama (local)

import type { Task } from "@agent-arena/sdk";
import { config } from "./config.js";
import { createHash } from "crypto";

export interface LLMResult {
  resultHash: string;
  resultPreview: string;
  fullResult: string;
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0].text.trim();
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    }),
  });
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content.trim();
}

async function callOllama(systemPrompt: string, userPrompt: string): Promise<string> {
  const endpoint = config.get("modelEndpoint") || "http://localhost:11434";
  const res = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt: `${systemPrompt}\n\nUser: ${userPrompt}`,
      stream: false,
    }),
  });
  const data = await res.json() as { response: string };
  return data.response.trim();
}

async function callLLM(system: string, user: string): Promise<string> {
  const model = config.get("model") || "claude";
  switch (model) {
    case "claude":  return callClaude(system, user);
    case "openai":  return callOpenAI(system, user);
    case "ollama":  return callOllama(system, user);
    default:        return callClaude(system, user);
  }
}

/** Evaluate if agent can do this task. Returns confidence 0-1. */
export async function evaluate(task: Task): Promise<number> {
  const caps = (config.get("capabilities") || []).join(", ");
  const text = await callLLM(
    `You are a task evaluator for an AI agent with capabilities: ${caps}.
Reply with ONLY a decimal number 0.0 to 1.0 representing confidence you can complete this task.
1.0 = very confident. 0.0 = cannot do. No other text.`,
    task.description,
  );
  const val = parseFloat(text);
  return isNaN(val) ? 0 : Math.min(1, Math.max(0, val));
}

/** Execute the task and return result */
export async function execute(task: Task): Promise<LLMResult> {
  const caps = (config.get("capabilities") || []).join(", ");
  const fullResult = await callLLM(
    `You are a skilled AI agent with capabilities: ${caps}.
Complete the given task accurately and concisely.
For coding tasks: return ONLY the code.
For analysis tasks: return a structured markdown report.
For other tasks: return a clear, complete response.`,
    task.description,
  );

  const resultHash    = `sha256:${createHash("sha256").update(fullResult).digest("hex")}`;
  const resultPreview = fullResult.slice(0, 500) + (fullResult.length > 500 ? "..." : "");

  return { resultHash, resultPreview, fullResult };
}
