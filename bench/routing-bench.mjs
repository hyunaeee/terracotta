// Offline routing-policy benchmark — no live API calls.
//
// Mirrors the routing policy in lib/terracotta-router.ts (task classification,
// preference ordering, research → Perplexity) and prices every decision with
// the same official price seeds the model registry ships with. The point is to
// quantify what the router's policy buys you against single-model baselines:
// same task set, same price table, only the policy changes.
//
//   node bench/routing-bench.mjs
//
// Quality proxy (documented rubric, not a model eval):
//   research  — needs fresh citations: perplexity 1.0, frontier LLMs 0.6
//   creative  — long-form Korean nuance: anthropic 1.0, openai 0.9, perplexity 0.5
//   general   — either frontier 1.0, perplexity 0.7

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tasks = JSON.parse(readFileSync(join(here, "tasks.json"), "utf8"));

// price seeds from lib/terracotta-router.ts (micros per 1M tokens)
const MODELS = {
  "gpt-5.6": { provider: "openai", input: 5, output: 30 },        // $/1M tokens
  "claude-fable-5": { provider: "anthropic", input: 10, output: 50 },
  "claude-sonnet-5": { provider: "anthropic", input: 3, output: 15 },
  "sonar-pro": { provider: "perplexity", input: 3, output: 15 },
};
const FRONTIER = { openai: "gpt-5.6", anthropic: "claude-fable-5" };

const QUALITY = {
  research: { perplexity: 1.0, openai: 0.6, anthropic: 0.6 },
  creative: { anthropic: 1.0, openai: 0.9, perplexity: 0.5 },
  general: { openai: 1.0, anthropic: 1.0, perplexity: 0.7 },
};

// lib/terracotta-router.ts: research → perplexity; otherwise preference order
function route(policy, task) {
  if (policy.detectResearch && task.kind === "research") return "sonar-pro";
  return policy.model ?? FRONTIER[policy.order[0]];
}

function costUsd(modelId, task) {
  const m = MODELS[modelId];
  return (task.inTokens * m.input + task.outTokens * m.output) / 1_000_000;
}

const POLICIES = [
  { name: "terracotta auto (latest-first)", order: ["openai"], detectResearch: true },
  { name: "terracotta claude-first", order: ["anthropic"], detectResearch: true },
  { name: "baseline: always GPT-5.6", model: "gpt-5.6", detectResearch: false },
  { name: "baseline: always Claude Fable 5", model: "claude-fable-5", detectResearch: false },
  { name: "baseline: always Sonnet 5 (cheap)", model: "claude-sonnet-5", detectResearch: false },
];

const rows = POLICIES.map((policy) => {
  let cost = 0, quality = 0;
  const picks = {};
  for (const task of tasks) {
    const modelId = route(policy, task);
    const provider = MODELS[modelId].provider;
    cost += costUsd(modelId, task);
    quality += QUALITY[task.kind][provider];
    picks[modelId] = (picks[modelId] ?? 0) + 1;
  }
  return {
    policy: policy.name,
    avgQuality: +(quality / tasks.length).toFixed(3),
    totalCostUsd: +cost.toFixed(4),
    costPerTask: +(cost / tasks.length).toFixed(5),
    picks,
  };
});

const pad = (s, n) => String(s).padEnd(n);
console.log(`routing-policy benchmark · ${tasks.length} tasks (offline, price seeds from model registry)\n`);
console.log(pad("policy", 36) + pad("avg quality", 13) + pad("total cost", 12) + "cost/task");
for (const r of rows) {
  console.log(pad(r.policy, 36) + pad(r.avgQuality, 13) + pad("$" + r.totalCostUsd, 12) + "$" + r.costPerTask);
}
const auto = rows[0];
for (const base of rows.slice(2)) {
  const dCost = ((auto.totalCostUsd - base.totalCostUsd) / base.totalCostUsd) * 100;
  const dQual = ((auto.avgQuality - base.avgQuality) / base.avgQuality) * 100;
  console.log(`\nauto vs "${base.policy}": cost ${dCost >= 0 ? "+" : ""}${dCost.toFixed(1)}% · quality ${dQual >= 0 ? "+" : ""}${dQual.toFixed(1)}%`);
}
writeFileSync(join(here, "results.json"), JSON.stringify(rows, null, 2));
console.log("\nsaved → bench/results.json");
