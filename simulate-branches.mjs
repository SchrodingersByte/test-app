/**
 * Prism branch simulator
 *
 * Sends events from 4 fake branches without you needing to git-switch.
 * Each branch gets a different number of calls to generate realistic spread.
 *
 * After running, your Prism dashboard → GitHub tab should show:
 *   main          — 4 calls   (highest cost, widest bar)
 *   feat/auth     — 3 calls
 *   feat/search   — 2 calls
 *   fix/typo      — 1 call    (lowest cost)
 *
 * Run:
 *   node --env-file=.env simulate-branches.mjs
 */

import { OpenAI } from "@prism-llm-labs/sdk";
import { execSync } from "child_process";

if (!process.env.OPENAI_API_KEY || !process.env.PRISM_API_KEY) {
  console.error("❌  Set OPENAI_API_KEY and PRISM_API_KEY in .env first.");
  process.exit(1);
}

const BRANCHES = [
  {
    name:   "main",
    commit: "a1b2c3d",
    calls: [
      "Summarise the CAP theorem in two sentences.",
      "What are the SOLID principles? One line each.",
      "Explain eventual consistency with a real-world analogy.",
      "What is a bloom filter and when would you use one?",
    ],
  },
  {
    name:   "feat/auth",
    commit: "e4f5g6h",
    calls: [
      "Write a short JWT validation function in TypeScript.",
      "What is the difference between OAuth 2.0 and OpenID Connect?",
      "Explain PKCE in one paragraph.",
    ],
  },
  {
    name:   "feat/search",
    commit: "i7j8k9l",
    calls: [
      "What is BM25 and how does it differ from TF-IDF?",
      "Describe how Elasticsearch sharding works in two sentences.",
    ],
  },
  {
    name:   "fix/typo",
    commit: "m1n2o3p",
    calls: [
      "Correct this sentence: 'Their going to the store'.",
    ],
  },
];

console.log("─".repeat(60));
console.log("  Prism Branch Simulator");
console.log("─".repeat(60));
console.log(`  Simulating ${BRANCHES.length} branches × their calls`);
console.log("─".repeat(60));
console.log();

let grandTotal = 0;

for (const branch of BRANCHES) {
  // Override env vars so the SDK picks up this branch's context
  process.env.GITHUB_REF_NAME = branch.name;
  process.env.GITHUB_SHA      = branch.commit;

  // Create a fresh client per branch so git context is re-read
  const client = new OpenAI();

  console.log(`📌 Branch: ${branch.name}  (${branch.calls.length} calls)`);

  let branchCost = 0;

  for (const [i, prompt] of branch.calls.entries()) {
    process.stdout.write(`   [${i + 1}/${branch.calls.length}] ${prompt.slice(0, 50)}… `);

    const t0  = Date.now();
    const res = await client.chat.completions.create({
      model:      "gpt-4o-mini",
      messages:   [{ role: "user", content: prompt }],
      max_tokens: 150,
    });
    const ms = Date.now() - t0;

    const usage   = res.usage;
    const inTok   = usage?.prompt_tokens     ?? 0;
    const outTok  = usage?.completion_tokens ?? 0;
    const cost    = ((inTok * 0.15) + (outTok * 0.60)) / 1_000_000;
    branchCost   += cost;
    grandTotal   += cost;

    console.log(`done  (${ms}ms · $${cost.toFixed(5)})`);
  }

  console.log(`   └─ Branch total: $${branchCost.toFixed(5)}`);
  console.log();
}

console.log("─".repeat(60));
console.log(`  Total cost across all branches: $${grandTotal.toFixed(5)}`);
console.log("─".repeat(60));
console.log();

// Small delay to let background fetch threads complete before exit
await new Promise(r => setTimeout(r, 2000));

const appUrl = process.env.PRISM_APP_URL ?? "https://prism-dip-dey-s-projects.vercel.app";
console.log("  ✅ All events sent. View in Prism:");
console.log();
console.log(`  ${appUrl}/dashboard`);
console.log("  → Projects → your project → GitHub tab");
console.log("  → Branch Activity shows 4 branches with relative cost bars");
console.log("  → Click any branch in the timeline to see detail");
console.log();
