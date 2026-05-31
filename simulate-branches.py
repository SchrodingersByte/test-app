"""
Prism branch simulator — Python

Sends events from 4 fake branches without you needing to git-switch.
Each branch gets a different number of calls to generate realistic spread.

After running, your Prism dashboard → GitHub tab should show:
  main          — 4 calls   (highest cost, widest bar)
  feat/auth     — 3 calls
  feat/search   — 2 calls
  fix/typo      — 1 call    (lowest cost)

Run:
  python simulate-branches.py
"""

import os
import sys
import time
from dotenv import load_dotenv

load_dotenv()

if not os.environ.get("OPENAI_API_KEY") or not os.environ.get("PRISM_API_KEY"):
    print("❌  Set OPENAI_API_KEY and PRISM_API_KEY in .env first.")
    sys.exit(1)

BRANCHES = [
    {
        "name":   "main",
        "commit": "a1b2c3d",
        "calls": [
            "Summarise the CAP theorem in two sentences.",
            "What are the SOLID principles? One line each.",
            "Explain eventual consistency with a real-world analogy.",
            "What is a bloom filter and when would you use one?",
        ],
    },
    {
        "name":   "feat/auth",
        "commit": "e4f5g6h",
        "calls": [
            "Write a short JWT validation function in Python.",
            "What is the difference between OAuth 2.0 and OpenID Connect?",
            "Explain PKCE in one paragraph.",
        ],
    },
    {
        "name":   "feat/search",
        "commit": "i7j8k9l",
        "calls": [
            "What is BM25 and how does it differ from TF-IDF?",
            "Describe how Elasticsearch sharding works in two sentences.",
        ],
    },
    {
        "name":   "fix/typo",
        "commit": "m1n2o3p",
        "calls": [
            "Correct this sentence: 'Their going to the store'.",
        ],
    },
]

print("─" * 60)
print("  Prism Branch Simulator (Python)")
print("─" * 60)
print(f"  Simulating {len(BRANCHES)} branches × their calls")
print("─" * 60)
print()

grand_total = 0.0

for branch in BRANCHES:
    # Override env vars so the SDK picks up this branch's context
    os.environ["GITHUB_REF_NAME"] = branch["name"]
    os.environ["GITHUB_SHA"]      = branch["commit"]

    # Import after setting env so _detect_git_context() picks up the override
    # Re-instantiate per branch so git context is re-read each time
    from prism import OpenAI
    client = OpenAI()

    calls      = branch["calls"]
    branch_cost = 0.0

    print(f"📌 Branch: {branch['name']}  ({len(calls)} calls)")

    for i, prompt in enumerate(calls):
        print(f"   [{i+1}/{len(calls)}] {prompt[:50]}… ", end="", flush=True)

        t0  = time.monotonic()
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
        )
        ms = int((time.monotonic() - t0) * 1000)

        usage    = res.usage
        in_tok   = getattr(usage, "prompt_tokens", 0) or 0
        out_tok  = getattr(usage, "completion_tokens", 0) or 0
        cost     = ((in_tok * 0.15) + (out_tok * 0.60)) / 1_000_000
        branch_cost += cost
        grand_total  += cost

        print(f"done  ({ms}ms · ${cost:.5f})")

    print(f"   └─ Branch total: ${branch_cost:.5f}")
    print()

print("─" * 60)
print(f"  Total cost across all branches: ${grand_total:.5f}")
print("─" * 60)
print()

# Wait for daemon threads to flush before exit
time.sleep(2)

app_url = os.environ.get("PRISM_APP_URL", "https://prism-dip-dey-s-projects.vercel.app")
print("  ✅ All events sent. View in Prism:")
print()
print(f"  {app_url}/dashboard")
print("  → Projects → your project → GitHub tab")
print("  → Branch Activity shows 4 branches with relative cost bars")
print("  → Click any branch in the timeline to see detail")
print()
