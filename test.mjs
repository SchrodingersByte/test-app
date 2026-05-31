/**
 * Prism end-to-end test — SDK + branch tracking + cost
 *
 * What this proves:
 *   1. The SDK intercepts OpenAI calls transparently
 *   2. Git branch + commit are auto-detected (from env or git subprocess)
 *   3. Cost is calculated locally and shipped to Prism
 *   4. Check your Prism dashboard → project → GitHub tab after running
 *
 * Run from inside a git repo on any branch:
 *   npm install
 *   node --env-file=.env test.mjs
 *
 * Override branch for testing without git-switching:
 *   GITHUB_REF_NAME=feat/my-branch node --env-file=.env test.mjs
 */

import { OpenAI } from "@prism-llm-labs/sdk";
import { execSync } from "child_process";

// ── 1. Detect git context (mirrors what the SDK does internally) ───────────
function getGitInfo() {
  const branch =
    process.env.GITHUB_REF_NAME ||
    process.env.GIT_BRANCH ||
    (() => {
      try {
        return execSync("git rev-parse --abbrev-ref HEAD", {
          stdio: ["pipe", "pipe", "pipe"],
        })
          .toString()
          .trim();
      } catch {
        return null;
      }
    })();

  const commit =
    process.env.GITHUB_SHA?.slice(0, 7) ||
    (() => {
      try {
        return execSync("git rev-parse --short HEAD", {
          stdio: ["pipe", "pipe", "pipe"],
        })
          .toString()
          .trim();
      } catch {
        return null;
      }
    })();

  return { branch: branch || "unknown", commit: commit || "unknown" };
}

const git = getGitInfo();

console.log("─".repeat(60));
console.log("  Prism SDK — End-to-End Test");
console.log("─".repeat(60));
console.log(`  Branch : ${git.branch}`);
console.log(`  Commit : ${git.commit}`);
console.log(`  Project: ${process.env.PRISM_PROJECT || "(from API key)"}`);
console.log("─".repeat(60));
console.log();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌  OPENAI_API_KEY is not set. Add it to your .env file.");
  process.exit(1);
}
if (!process.env.PRISM_API_KEY) {
  console.error("❌  PRISM_API_KEY is not set. Add it to your .env file.");
  process.exit(1);
}
if (!process.env.PRISM_APP_URL) {
  console.error("❌  PRISM_APP_URL is not set. Add it to your .env file.");
  console.error("    e.g. PRISM_APP_URL=https://prism-dip-dey-s-projects.vercel.app");
  process.exit(1);
}

// ── Sanity-check: verify the ingest endpoint is reachable ─────────────────
const ingestUrl = `${process.env.PRISM_APP_URL}/api/ingest`;
console.log(`  Ingest URL: ${ingestUrl}`);
{
  const probe = await fetch(ingestUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PRISM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ events: [] }),
  }).catch(e => ({ ok: false, status: 0, _err: e.message }));
  const status = probe.status;
  // 400 = reached the server (empty batch validation error) — that's fine
  // 401 = bad key, 404 = wrong URL, 0 = network failure
  if (status === 0) {
    console.error(`❌  Cannot reach ${ingestUrl} — check PRISM_APP_URL.`);
    process.exit(1);
  }
  if (status === 401) {
    console.error(`❌  API key rejected by Prism (401). Check PRISM_API_KEY.`);
    process.exit(1);
  }
  if (status === 404) {
    console.error(`❌  Ingest route not found (404). Check PRISM_APP_URL.`);
    process.exit(1);
  }
  console.log(`  Ingest check: ${status === 400 ? "✓ reachable" : `status ${status}`}`);
}
console.log();

// ── 2. Initialise SDK client ───────────────────────────────────────────────
// Drop-in replacement for `new OpenAI()`.
// Reads PRISM_API_KEY, PRISM_PROJECT, PRISM_TEAM from env.
// Git context (branch + commit) is auto-detected and attached to every event.
const client = new OpenAI();

// ── 3. Run test calls ──────────────────────────────────────────────────────
const CASES = [
  {
    label: "Short answer",
    model: "gpt-4o-mini",
    prompt: "What is the CAP theorem? Answer in exactly one sentence.",
    max_tokens: 80,
  },
  {
    label: "Code generation",
    model: "gpt-4o-mini",
    prompt: "Write a Python function that reverses a linked list. Just the code, no explanation.",
    max_tokens: 200,
  },
  {
    label: "Longer output",
    model: "gpt-4o-mini",
    prompt: "List 5 design patterns with a one-line description each.",
    max_tokens: 300,
  },
];

let totalCost = 0;

for (const [i, tc] of CASES.entries()) {
  process.stdout.write(`  [${i + 1}/${CASES.length}] ${tc.label}… `);

  const t0  = Date.now();
  const res = await client.chat.completions.create({
    model:      tc.model,
    messages:   [{ role: "user", content: tc.prompt }],
    max_tokens: tc.max_tokens,
  });
  const ms = Date.now() - t0;

  const usage    = res.usage;
  const inTok    = usage?.prompt_tokens     ?? 0;
  const outTok   = usage?.completion_tokens ?? 0;
  // Cost estimate (mirrors SDK internal calculation)
  const costUsd  = ((inTok * 0.15) + (outTok * 0.60)) / 1_000_000;
  totalCost     += costUsd;

  console.log(`done  (${ms}ms · ${inTok}+${outTok} tok · $${costUsd.toFixed(5)})`);
}

console.log();
console.log("─".repeat(60));
console.log(`  Requests sent : ${CASES.length}`);
console.log(`  Approx cost   : $${totalCost.toFixed(5)}`);
console.log(`  Branch tagged : ${git.branch}`);
console.log(`  Commit tagged : ${git.commit}`);
console.log("─".repeat(60));
console.log();
console.log("  Events are being shipped to Prism in the background.");
console.log("  Open your dashboard in ~5 seconds:");
console.log();
console.log(`  ${process.env.PRISM_APP_URL ?? "https://prism-dip-dey-s-projects.vercel.app"}/dashboard`);
console.log();
console.log("  → Projects → your project → GitHub tab");
console.log(`  → Look for branch: ${git.branch}`);
console.log();
