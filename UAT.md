# Prism — UAT Scenario Checklist

Manual end-to-end test scenarios. Run in order on a fresh environment.
Check each box only after you have verified the expected outcome matches.

---

## Setup

Before running any scenario, ensure:
- [ ] You have a fresh Prism account (or a test account with no projects)
- [ ] You have a valid OpenAI API key
- [ ] `PRISM_APP_URL` is set to your deployed Prism instance
- [ ] You are running `node --env-file=.env test.mjs` from this directory

---

## Scenario A — New User Onboarding Flow

**Goal:** Verify that new sign-ups land on `/onboarding` and can complete all steps.

| # | Step | Expected |
|---|------|----------|
| A1 | Sign up with a new email | Redirected to `/onboarding` (not `/dashboard`) |
| A2 | Observe Step 1: Create project | Form visible, required field marked with * |
| A3 | Enter project name "Test Project", click Create | Advances to Step 2 automatically |
| A4 | Observe Step 2: Analytics key | Description explains SDK tracking, no provider key needed |
| A5 | Click "Create analytics key" | Key created, advances to Step 3 |
| A6 | Observe Step 3: Gateway key | Skip button visible |
| A7 | Click "Skip for now" | Advances to Step 4 |
| A8 | Step 4: SDK setup — copy Python install snippet | Snippet starts with `pip install prism-llm` |
| A9 | Click "Continue" | Advances to Step 5 |
| A10 | Step 5: Invite team — click "Skip for now" | Advances to Step 6 |
| A11 | Step 6: Connect GitHub — click "Skip for now" | Advances to Step 7 |
| A12 | Step 7: Done screen | Shows analytics key, "Go to dashboard" button visible |
| A13 | Click "Go to dashboard" | Lands on `/dashboard` with project visible in sidebar |

**Pass criteria:** All 13 steps complete without errors. Dashboard shows the project from Step 3.

---

## Scenario B — Analytics Key SDK Integration Test

**Goal:** Verify events from an analytics key reach the dashboard.

| # | Step | Expected |
|---|------|----------|
| B1 | Set `PRISM_API_KEY=<analytics key from A5>` in `.env` | Key accepted |
| B2 | Run `node --env-file=.env test.mjs` | Connectivity probe shows `✓ reachable` |
| B3 | All 3 test cases complete | Shows latency + token counts per call |
| B4 | Wait 10 seconds, open `/dashboard` | Total spend increases |
| B5 | Navigate to project → GitHub tab | "Analytics" sub-tab shows branch data |
| B6 | "Gateway" sub-tab | Shows empty state "No gateway key events yet" |

**Pass criteria:** Events appear under Analytics sub-tab only. Gateway tab is empty.

---

## Scenario C — Gateway Key Proxy Test

**Goal:** Verify that gateway key routes calls through Prism and events appear in Gateway sub-tab.

| # | Step | Expected |
|---|------|----------|
| C1 | Create a gateway key in Settings → API Keys | Requires provider key to be added first |
| C2 | Note the gateway key value (starts with `prism_live_`) | Key visible in reveal dialog |
| C3 | Set `PRISM_GATEWAY_KEY=<gateway key>` in test env | — |
| C4 | Make an OpenAI call via Prism gateway: `POST ${PRISM_APP_URL}/api/gateway/openai` with `Authorization: Bearer <gateway key>` and OpenAI-compatible JSON body | Response streams back; latency slightly higher |
| C5 | Wait 10 seconds, open project → GitHub tab → Gateway sub-tab | Event appears with provider attribution |
| C6 | Check Analytics sub-tab | No new events from gateway call |

**Pass criteria:** Gateway events isolated in Gateway sub-tab. Provider key is NOT visible to caller.

---

## Scenario D — Hard Cap Enforcement

**Goal:** Verify that a gateway key with a hard cap blocks calls when budget is exceeded.

| # | Step | Expected |
|---|------|----------|
| D1 | Create a gateway key with `cost_hard_cap_usd = 0.001` ($0.001) | Key created |
| D2 | Make a single OpenAI call through the gateway | Succeeds (first call) |
| D3 | Make additional calls until total exceeds $0.001 | Returns 402 with `{"error":"key_budget_exceeded"}` |
| D4 | Check ingest log in Settings → API Keys | Shows `budget_exceeded` status for blocked calls |

**Pass criteria:** Calls blocked at cap threshold. Error code is `key_budget_exceeded`.

---

## Scenario E — Member Key Assignment (Creation Time)

**Goal:** Verify that owners can assign analytics keys to specific developers at creation time.

| # | Step | Expected |
|---|------|----------|
| E1 | Invite a team member (developer role) | Invite sent |
| E2 | Team member accepts invite and logs in | Sees Settings → API Keys page |
| E3 | Owner: Create an analytics key, assign to the developer member | Key created with `assigned_user_id` set |
| E4 | Developer refreshes Settings → API Keys | Sees only the assigned key |
| E5 | Developer cannot see other org keys | All other keys hidden |

**Pass criteria:** Developer sees exactly one key — the assigned one.

---

## Scenario F — Member Key Reassignment (Post-Creation)

**Goal:** Verify that owners can reassign keys after creation using the Assign Member dialog.

| # | Step | Expected |
|---|------|----------|
| F1 | Owner: navigate to Settings → API Keys | Key list visible |
| F2 | Find an assigned key, click the person+ icon (Assign member) | Dialog opens with current assignee pre-selected |
| F3 | Change assignment to a different member | PATCH request succeeds |
| F4 | Previous assignee refreshes API Keys page | Key is no longer visible |
| F5 | New assignee refreshes API Keys page | Key now visible |
| F6 | Owner: open Assign dialog, select "Unassigned" | PATCH sets `assigned_user_id = null` |
| F7 | Key no longer appears in any developer's view | Unassigned keys visible to owners only |

**Pass criteria:** Reassignment works bi-directionally. Unassign hides key from all developers.

---

## Scenario G — GitHub Branch Tracking

**Goal:** Verify that SDK events are tagged with git branch and appear in the branch timeline.

| # | Step | Expected |
|---|------|----------|
| G1 | Set `GITHUB_REF_NAME=feat/test-uat` in terminal | SDK reads this env var |
| G2 | Run `GITHUB_REF_NAME=feat/test-uat node --env-file=.env test.mjs` | Output shows `Branch: feat/test-uat` |
| G3 | Wait 10 seconds, open project → GitHub tab → Analytics | Branch `feat/test-uat` appears in timeline |
| G4 | Hover over branch in timeline | Tooltip shows cost + tokens |
| G5 | Run `node --env-file=.env simulate-branches.mjs` | 4 branches × their calls |
| G6 | Wait 15 seconds, open GitHub tab | Timeline shows 4 branches with relative cost bars |

**Pass criteria:** Branches appear in the animated timeline. Relative cost bars match the simulated proportions.

---

## Scenario H — GitHub Dual-Tab Bifurcation

**Goal:** Verify that analytics and gateway events are separated into their respective sub-tabs.

| # | Step | Expected |
|---|------|----------|
| H1 | Ensure both an analytics key AND a gateway key exist for the same project | — |
| H2 | Send events via analytics key (run `test.mjs`) | Events arrive |
| H3 | Send events via gateway key (direct HTTP call) | Events arrive |
| H4 | Open project → GitHub tab | Two sub-tabs visible: "Analytics" and "Gateway" |
| H5 | Click "Analytics" sub-tab | Shows only SDK-sourced branch data |
| H6 | Click "Gateway" sub-tab | Shows only proxied branch data |
| H7 | Cost totals differ between tabs | Analytics total ≠ Gateway total |

**Pass criteria:** Sub-tabs show disjoint data. Switching tabs shows informational banners explaining the difference.

---

## Scenario I — Zero-Project Gate

**Goal:** Verify that users without any projects cannot access the dashboard.

| # | Step | Expected |
|---|------|----------|
| I1 | Sign in as an existing user with at least 1 project | Dashboard loads normally |
| I2 | Delete all projects via API (or Supabase dashboard) | — |
| I3 | Refresh `/dashboard` | Full-screen `OnboardingRequired` overlay appears |
| I4 | Overlay is not dismissible | No close button, no backdrop click dismissal |
| I5 | Click "Set up your workspace →" | Redirected to `/onboarding` |
| I6 | Navigate directly to `/dashboard/projects` | Same overlay shown |

**Pass criteria:** `OnboardingRequired` overlay blocks all dashboard content.

---

## Scenario J — Key Creation Without Project

**Goal:** Verify that the API enforces `project_id` on key creation.

| # | Step | Expected |
|---|------|----------|
| J1 | `POST /api/keys` with `{name: "test", environment: "production"}` (no project_id) | Returns 400 `{"error":"project_id is required"}` |
| J2 | Analytics Key modal with no project selected | "Please select a project" validation error shown, form does not submit |
| J3 | Gateway key with `provider_key_id` set (inherits project from provider key) | Key created — project_id inherited, no 400 |

**Pass criteria:** J1 and J2 blocked; J3 succeeds via project inheritance from provider key.

---

## Running the Automated Test Suite

```bash
# From apps/web
pnpm test
# or
pnpm test:watch

# Component tests only
pnpm vitest run components/charts/

# API route tests only
pnpm vitest run app/api/
```

All tests should pass before merging any PR that touches the scenarios above.
