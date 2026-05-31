"""
Prism end-to-end test — Python SDK + branch tracking + cost

What this proves:
  1. The SDK intercepts OpenAI calls transparently
  2. Git branch + commit are auto-detected (from env or git subprocess)
  3. Cost is calculated locally and shipped to Prism
  4. Check your Prism dashboard → project → GitHub tab after running

Run from inside a git repo on any branch:
  pip install -r requirements.txt
  python test.py

Override branch for testing without git-switching:
  GITHUB_REF_NAME=feat/my-branch python test.py
"""

import os
import subprocess
import sys
import time
from dotenv import load_dotenv

load_dotenv()

# ── 1. Detect git context (mirrors what the SDK does internally) ────────────
def get_git_info():
    branch = (
        os.environ.get("GITHUB_REF_NAME")
        or os.environ.get("GIT_BRANCH")
        or os.environ.get("BRANCH_NAME")
    )
    commit = (os.environ.get("GITHUB_SHA") or "")[:7]

    if not branch:
        try:
            branch = subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                stderr=subprocess.DEVNULL, timeout=1,
            ).decode().strip()
        except Exception:
            branch = "unknown"

    if not commit:
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                stderr=subprocess.DEVNULL, timeout=1,
            ).decode().strip()
        except Exception:
            commit = "unknown"

    return branch or "unknown", commit or "unknown"


branch, commit = get_git_info()

print("─" * 60)
print("  Prism SDK — End-to-End Test (Python)")
print("─" * 60)
print(f"  Branch : {branch}")
print(f"  Commit : {commit}")
print(f"  Project: {os.environ.get('PRISM_PROJECT', '(from API key)')}")
print("─" * 60)
print()

if not os.environ.get("OPENAI_API_KEY"):
    print("❌  OPENAI_API_KEY is not set. Add it to your .env file.")
    sys.exit(1)
if not os.environ.get("PRISM_API_KEY"):
    print("❌  PRISM_API_KEY is not set. Add it to your .env file.")
    sys.exit(1)

# ── 2. Initialise SDK client ─────────────────────────────────────────────────
# Drop-in replacement for openai.OpenAI().
# Reads PRISM_API_KEY, PRISM_PROJECT, PRISM_TEAM from env.
# Git context (branch + commit) is auto-detected and attached to every event.
from prism import OpenAI

client = OpenAI()

# ── 3. Run test calls ─────────────────────────────────────────────────────────
CASES = [
    {
        "label":      "Short answer",
        "model":      "gpt-4o-mini",
        "prompt":     "What is the CAP theorem? Answer in exactly one sentence.",
        "max_tokens": 80,
    },
    {
        "label":      "Code generation",
        "model":      "gpt-4o-mini",
        "prompt":     "Write a Python function that reverses a linked list. Just the code, no explanation.",
        "max_tokens": 200,
    },
    {
        "label":      "Longer output",
        "model":      "gpt-4o-mini",
        "prompt":     "List 5 design patterns with a one-line description each.",
        "max_tokens": 300,
    },
]

total_cost = 0.0

for i, tc in enumerate(CASES):
    print(f"  [{i+1}/{len(CASES)}] {tc['label']}… ", end="", flush=True)

    t0 = time.monotonic()
    res = client.chat.completions.create(
        model=tc["model"],
        messages=[{"role": "user", "content": tc["prompt"]}],
        max_tokens=tc["max_tokens"],
    )
    ms = int((time.monotonic() - t0) * 1000)

    usage    = res.usage
    in_tok   = getattr(usage, "prompt_tokens", 0) or 0
    out_tok  = getattr(usage, "completion_tokens", 0) or 0
    cost_usd = ((in_tok * 0.15) + (out_tok * 0.60)) / 1_000_000
    total_cost += cost_usd

    print(f"done  ({ms}ms · {in_tok}+{out_tok} tok · ${cost_usd:.5f})")

print()
print("─" * 60)
print(f"  Requests sent : {len(CASES)}")
print(f"  Approx cost   : ${total_cost:.5f}")
print(f"  Branch tagged : {branch}")
print(f"  Commit tagged : {commit}")
print("─" * 60)
print()

# Wait for background threads to flush before process exits
time.sleep(1.5)

app_url = os.environ.get("PRISM_APP_URL", "https://prism-dip-dey-s-projects.vercel.app")
print("  Events shipped to Prism. Open your dashboard:")
print()
print(f"  {app_url}/dashboard")
print()
print("  → Projects → your project → GitHub tab")
print(f"  → Look for branch: {branch}")
print()
