---
name: build-html-dashboard
description: Use when you need a human control surface over AI agents' work — a place to see what they're doing, what they decided, where they've drifted from plan, and to flag corrections that the agents act on. Renders the agents' structured work artifacts (plan, events, claims, decisions, risks) as a navigable HTML dashboard with anchored inline comments backed by GitHub Issues. The dashboard is for the human overseer; agents write artifacts, not pages. Symptoms — "I can't tell what the agent did", "where did the plan diverge", "give me one place to flag the agent's mistakes", "we need oversight on this run". NOT a doc-site generator.
---

# Build an AI-oversight dashboard

## What this is

A methodology for standing up a **human control surface over AI agents' work**:

- Agents emit **structured artifacts** as they work (plan, events, claims, decisions, risks, blockers).
- The dashboard is a small set of HTML pages that **render those artifacts** for a human overseer.
- The human flags issues via an **anchored comment overlay**, with a severity tier per comment.
- The maintenance skill (`fix-feedback`) consumes the comments and **edits the artifacts** (not the HTML). The dashboard re-renders.

This is a control loop, not a doc site. Markdown-to-HTML conversion is one *bootstrap path* into this loop, not the product.

## When to use

- One or more agents are doing real work in a repo and a human needs to oversee it.
- The audience is the human overseer (insiders with GitHub accounts). Not the public.
- You're willing to commit to a small artifact schema the agents write into.
- You have a static-site deploy target (GitHub Pages, Netlify, plain HTTP) and optionally a Cloudflare Worker.

**Don't use when:**
- You want a public docs site. Use `frontend-design` or a static-site generator.
- The project has no agents doing autonomous or semi-autonomous work — just edit the markdown.
- You want anonymous commenting. Both auth modes here tie every comment to a GitHub user.

## REQUIRED background skill

- `html-effectiveness` — its 9 patterns are *primitives*. Oversight pages below are built FROM those primitives; this skill defines which pages an oversight dashboard MUST and MAY have. Do not pick pages directly from the 9-pattern catalog without going through the oversight page list below.

## The methodology — seven phases

### Phase 1 — Discover the agents and the overseer's questions

Don't open an editor.

**1a. ASK — auth mode.** Use `AskUserQuestion`. Affects Phase 5 (comments) and Phase 6 (deploy).

- **PAT**: each viewer pastes a fine-grained PAT (Issues r/w on this repo only) into the dashboard's Sign-in modal; stored in `localStorage`. Static site only. ~2 min per collaborator. Good for solo / tiny technical teams. Works for public + private repos.
- **OAuth + Worker**: one-click "Sign in with GitHub". A Cloudflare Worker holds the OAuth App's client secret and HMAC-signs sessions. Static site + Worker + OAuth App. Good for non-technical collaborators or polished UX. Works for public + private repos.
- **Public-passthrough**: zero client auth. Selecting text + clicking submit redirects to `github.com/<owner>/<repo>/issues/new?...` (prefilled body) in a new tab — the viewer's existing github.com session authenticates the issue creation. Read uses unauthenticated GitHub API (60 req/hour per IP — fine for low-traffic oversight, breaks for many concurrent viewers). Static site only. No tokens, no Worker. **Public repos only** (unauthenticated read requires public visibility). Good fit: small public projects where the audience is anyone with a github.com account.

(Auth-mode table at the bottom of this skill compares all three.)

**1b. ASK — which agents are at work?** Multi-agent is the default assumption. Common splits: training agent, eval agent, deploy agent, doc agent, researcher. For each:

- What does it produce? (commits, configs, model artifacts, decisions, plan updates)
- Where does it run? (locally, CI, scheduled cron, on-demand)
- What artifacts file/path layout does it already use?

If the answer is "one agent doing everything," fine — but ask before assuming.

**When to split agents vs. collapse.** Don't make every functional role a separate agent. Split when there's an independent stream of decisions worth surveying separately (training vs. eval; doc-bot vs. main agent). Collapse when one persona does multiple kinds of work in sequence — a `claude` agent that drafts, reviews, and deploys is still one agent. Each split costs a full 6-file artifact set; pay it only when the human will benefit from agent-level filtering.

**Cross-agent rendering.** With N>1 agents, the Live Status Board and Activity Timeline pages can be:
- **Per-agent sections** (one column or stacked block per agent) — clearer ownership, longer pages.
- **Unified streams** filtered by `agent_id` — compact but requires filter UI.

Default: per-agent for ≤3 agents, unified above that. Decision Audit and Drift always show `agent_id` per record. Trust Calibration is *always* per-agent — the `override-rate` metric is per-decision-maker by definition.

**1c. List the overseer's questions.** The dashboard exists to answer these, fast:

- *What is each agent doing right now?* (live status)
- *What just happened?* (recent events)
- *What did the agent decide, and why?* (decision audit)
- *Where has actual diverged from plan?* (drift)
- *What's stuck or needs my decision?* (blockers)
- *Should I trust the agent here?* (calibration over time)
- Plus project-specific questions: *what's the deployed checkpoint? how do I run X? what does this project do?* These are secondary — reference, not oversight.

**Output of Phase 1:** chosen auth mode + agent inventory + oversight question list.

### Phase 2 — Agree on the artifact contract

This is the load-bearing phase. Without an artifact contract, the dashboard becomes a hand-curated doc site again and goes stale the moment the agent moves.

**Minimum schema** (per agent, or shared across agents — the schema MUST carry an `agent_id` field either way):

| Artifact | Format | Purpose |
|---|---|---|
| `events.jsonl` | append-only JSONL | every action: commit, job start/end, decision logged, artifact produced, error |
| `plan.json` | structured | the agent's current intended sequence (steps + status) |
| `claims.json` | structured | current facts about the world, each with `source`, `verified_at`, `confidence` |
| `decisions.jsonl` | append-only JSONL | choices made, with rationale + linked evidence |
| `risks.json` | structured | known unresolved risks + severity |
| `blockers.json` | structured | what's stuck, who/what unblocks |

Location: `docs/agent-state/<agent_id>/`. Living under `docs/` means it ships in the same tree the dashboard reads from (and `gh-pages` mirrors), keeps the repo root uncluttered, and signals "this is project-state, alongside project-docs." JSON over YAML — easier for both agents and dashboards to parse without errors.

**An event record minimum looks like:**

```json
{"id": "evt-1748275931-a1b2", "ts": "2026-05-26T14:32:11Z",
 "agent_id": "trainer", "kind": "commit",
 "ref": "a1b2c3", "summary": "switched optimizer to AdamW",
 "evidence": ["train_args.txt"], "severity": "info"}
```

`id` format: `evt-<unix-seconds>-<4-char-suffix>`. Every event must be addressable so the dashboard can render it with `data-record-id` and `fix-feedback` can locate it.

**Required event kinds** (extend per project; don't omit any that the agent produces):

| `kind` | Meaning | Required extra fields |
|---|---|---|
| `commit` | git commit made | `ref` |
| `job-start` / `job-end` | long-running job kicked off / finished | `job_id`, `summary` |
| `decision` | logged a decision (cross-refs `decisions.jsonl`) | `decision_id` |
| `claim-update` | rewrote a claim | `claim_id` |
| `plan-update` | plan step changed status | `step_id`, `from_status`, `to_status` |
| `risk-flagged` | surfaced a new risk | `risk_id` |
| `blocker-raised` / `blocker-resolved` | reported stuck / unstuck | `blocker_id` |
| `artifact-produced` | wrote a non-tracked artifact (checkpoint, eval json) | `path` |
| `error` | agent encountered an error | `summary` |

**A claim record minimum:**

```json
{"id": "deployed_checkpoint", "value": "ckpt-step-48000",
 "source": "configs/deploy.yaml:12", "verified_at": "2026-05-26T14:30:00Z",
 "confidence": "high", "evidence_kind": "source-file"}
```

`evidence_kind`: `command-output` (e.g. `squeue`), `source-file` (e.g. `train_args.txt`), `model-inference` (the agent reasoned, didn't observe), `human-assertion` (a human told the agent), `unverified` (assumption pending check). Distinguish these — the human reads a claim differently if it's grep-ed from a config file vs. inferred from a model's reasoning.

**A plan (`plan.json`):**

```json
{"agent_id": "trainer", "updated_at": "2026-05-26T14:30:00Z",
 "steps": [
   {"id": "s1", "summary": "Prepare dataset", "status": "verified",
    "evidence": ["data/train.jsonl"], "ts_completed": "2026-05-26T10:00:00Z"},
   {"id": "s2", "summary": "Train baseline", "status": "running",
    "evidence": ["jobs/123.log"], "ts_started": "2026-05-26T12:00:00Z"},
   {"id": "s3", "summary": "Eval on benchmark", "status": "proposed"}
 ]}
```

**A decision record (one JSONL line in `decisions.jsonl`):**

```json
{"id": "dec-001", "ts": "2026-05-26T13:00:00Z", "agent_id": "trainer",
 "kind": "choice", "subject": "optimizer", "chosen": "AdamW",
 "alternatives": ["Adam", "SGD"], "rationale": "stability on small batch",
 "evidence": ["train_args.txt"], "made_by": "agent"}
```

`id` format: `dec-<seq>` for agent-authored, `dec-override-<issue_number>` for human-override (written by `fix-feedback`). `kind`: `choice` (agent picked one option), `override` (human overruled), `revision` (agent revised an earlier decision; add `supersedes: "dec-..."`). `made_by`: `agent` or `human:<github-login>`.

**A risk file (`risks.json`):**

```json
{"agent_id": "trainer", "updated_at": "2026-05-26T14:00:00Z",
 "risks": [
   {"id": "r1", "summary": "Training data may contain leaked eval labels",
    "severity": "high", "mitigation": "audit a subset before training",
    "status": "open"}
 ]}
```

`severity`: `low` | `medium` | `high`. `status`: `open` | `accepted` (human OK'd the risk) | `resolved`.

**A blocker file (`blockers.json`):**

```json
{"agent_id": "trainer", "updated_at": "2026-05-26T14:00:00Z",
 "blockers": [
   {"id": "b1", "summary": "Waiting on labeled validation set",
    "kind": "human-decision", "needs": "Annotator delivers 200 samples",
    "ts_started": "2026-05-25T09:00:00Z"}
 ]}
```

`kind`: `human-decision` | `external-dependency` | `tooling`.

**Plan step state machine** (allowed `steps[].status` values + transitions):

| Status | Meaning | Transitions to |
|---|---|---|
| `proposed` | planned, not started | `running`, `superseded` |
| `running` | in progress | `verified`, `blocked`, `reverted` |
| `blocked` | stopped waiting on something | `running`, `superseded`, `reverted` |
| `verified` | completed and confirmed against evidence | `reverted` (rare; only if later finding invalidates it) |
| `superseded` | replaced by a different step (add `superseded_by: "s..."` ) | terminal |
| `reverted` | undone deliberately | terminal |

The point is **not** to design the perfect schema upfront — it's to commit to *some* schema so the dashboard renders structured data, not hand-written narrative. Iterate the schema as the project evolves; keep JSONL files append-safe (treat history as immutable; corrections become new records that supersede).

If existing `.md` files already encode the agent's plan / decisions / status, use them as *bootstrap data* — write a one-shot ingest that produces the artifacts from the `.md` once, then either archive the `.md` (`docs/legacy/`) or stop maintaining them. Two surfaces drifting apart is the failure mode this phase prevents.

### Phase 3 — Page design (oversight-native)

**Required pages** (every oversight dashboard ships these):

| Page | Primitive (from `html-effectiveness`) | Source artifact |
|---|---|---|
| **Live Status Board** | Interactive Report (live status) | `plan.json` + `blockers.json` + latest `events.jsonl` |
| **Activity Timeline** | Annotated Timeline | `events.jsonl` reverse-chronological |
| **Decision Audit Log** | Knowledge Explorer (collapsibles) | `decisions.jsonl` |
| **Drift / Expected vs Actual** | Comparison Board (two columns) | `plan.json` vs `claims.json` + live source checks |
| **Trust Calibration** | Interactive Report (charts + counts) | GitHub Issues history — see metrics below |

**Trust Calibration metrics** (all derivable from `gh issue list` + label combinations + closure comments):

| Metric | Definition |
|---|---|
| `accepted` (n) | FYI issues closed by the human — pages read and approved without action |
| `fixed` (n) | Fix issues closed by `fix-feedback` (commit prefix `fix(<agent>)`) — agent output corrected by human direction |
| `overridden` (n) | Override issues closed (`dec-override-N` records in `decisions.jsonl`) — human knowingly accepted a flagged risk |
| `blocked-open` (n) | Block issues currently open or in block-resolved waiting state |
| `override-rate` (%) | `overridden / (fixed + overridden)` per agent — how often the agent's first action gets reversed |
| `mean-time-to-fix` | median age at close of Fix issues per agent |

Render as 7-day and 30-day rolling counts, broken down by `agent_id`. The **override-rate** is the headline trust signal — a high rate means the agent's defaults disagree with the human in this area, a low rate means agent and human are aligned. A high `blocked-open` count means the agent is stuck waiting on human input — possibly an under-scoped permission boundary.

**Optional pages** (add when the project needs them):

- **Spec / reference** — what the project *is* (model card, architecture). Built from `claims.json` plus live source verification.
- **Runbook** — how to operate, debug, redeploy. Static-ish, refreshed manually.
- **Code Review Board** — when humans review PRs the agent opens.

**Target 5–7 pages total.** More than that and the spine is gone. The required five are non-negotiable for oversight; everything else is the project's choice.

### Phase 4 — HTML implementation with provenance in the UI

- One file per page. No JS framework. No build step (see freshness modes below for the optional CI step).
- Each page reads its source artifacts at load time (`fetch('docs/agent-state/.../events.jsonl')` etc.) and renders.
- **Every rendered fact carries provenance + freshness in the DOM**: `data-source="train_args.txt"` + `data-fresh-at="2026-05-26T14:30:00Z"`. Surface these in the UI — a small `🟢 12 min ago` next to the value, greying out past 30 min, red past 6 h. *Stale data on an oversight dashboard misleads the human about agent state. Freshness is a safety feature, not a polish item.*
- **Every rendered element backed by an artifact record MUST declare its binding in the DOM:**
  - `data-artifact="docs/agent-state/<agent>/<file>"` — which artifact the value came from
  - `data-record-id="<id>"` — which record inside it (event id, decision id, step id, risk id, blocker id), when rendering one
  - `data-agent-id="<agent>"` — useful for cross-agent pages and filtering

  These bindings make the comment overlay's anchor resolution unambiguous: when a user selects text, the overlay walks up to the nearest `[data-artifact]` and includes that path (and record id, if present) in the issue body. Without them, `fix-feedback` is back to guessing which artifact a comment refers to.

- **Freshness modes** (project picks one; the choice affects Phase 6 deploy):
  - **Agent-write-time (default).** The agent sets `verified_at` when it writes a claim. The dashboard renders that timestamp as the freshness signal. No extra infrastructure. Acceptable when the agent is active enough that staleness == "agent stalled," which is itself a signal worth surfacing.
  - **Build-time.** A CI step on each push to `main` re-runs verification (re-reads `train_args.txt`, parses configs, queries live state) and rewrites `claims.json` before deploying. Keeps the dashboard fresh relative to repo state even when the agent is idle. Add a `scripts/verify-claims.py` (or similar) and run it in the deploy workflow before the `gh-pages` mirror.
  - **Worker-time (out of scope for v1).** OAuth-mode Worker proxies live checks per view. Most accurate; requires Worker; not included here.

  Pick **agent-write-time** unless the project has verified it actually needs build-time refresh.
- CSS custom properties at top (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--ok`, `--warn`, `--bad`, `--stale`, `--radius`).
- Light + dark themes via `@media (prefers-color-scheme: dark)`.
- Monospace for paths, params, command lines, artifact IDs.
- Information density > aesthetics. No hero blocks. Compact tables.

### Phase 5 — Comment overlay (the steering loop)

The overlay is the human's only contribution surface. They never edit HTML or artifacts by hand. Each page loads `assets/feedback.css` + `assets/feedback.js`. Selection → 💬 → modal → publish. Comments become GitHub Issues.

**Severity tiers (the modal's primary control):**

| Tier | Label set | Meaning | `fix-feedback` behavior |
|---|---|---|---|
| FYI | `comment` | note only; no action expected | does not touch; human closes when read |
| Fix | `comment` + `claude-fix` | correct this | edits artifact, commits, closes |
| Block | `comment` + `claude-fix` + `block` | stop work in this area until resolved | edits artifact, commits, comments resolution, leaves open for human to unblock |
| Override | `comment` + `override` (NO `claude-fix`) | human accepts the flagged risk; record and continue | appends `kind: "override"` record to `decisions.jsonl`, commits, closes |

The single binary "Let Claude fix this" checkbox of the v1 dashboard becomes a 4-way radio (default: FYI). The 4 tiers are the minimum that captures real oversight verbs; don't add a fifth until you've shipped these.

**Override is durable decision capture, not a no-op.** When a human chooses Override, the dashboard is recording a deliberate human decision that may diverge from the agent's planned action. That record must land in `decisions.jsonl` so the agent (and future humans) can see "this risk was knowingly accepted at this time by this person." `fix-feedback` enforces this.

**Issue body template** (the modal writes this; `fix-feedback` parses it):

```
**Severity:** Fix | Block | Override | FYI
**Where:** <page_url>[#<section_anchor>]
**Agent:** <agent_id>                     (when DOM has data-agent-id)
**Artifact:** <docs/agent-state/.../file>  (when DOM has data-artifact)
**Record:** <record-id>                    (when DOM has data-record-id)

**Quote:**
> <selected text>

**Note:**
<user's request>

<!-- fb-ctx: pre="..." suf="..." -->
```

**Required GitHub setup (one-time):**

```bash
gh label create comment    -R owner/repo --color 5319e7
gh label create claude-fix -R owner/repo --color 0e8a16
gh label create block      -R owner/repo --color b60205
gh label create override   -R owner/repo --color fbca04
```

**The 10 load-bearing patterns from the v1 dashboard remain unchanged.** Each cures a real failure mode and was discovered the hard way. Summarized:

1. Static `<button>` in HTML for Sign-in / View (no JS injection).
2. GitHub identity = comment author (PAT or HMAC session).
3. TextQuoteSelector context anchor (`pre`/`suf` of ~32 chars in the issue body).
4. Multi-text-node walker for selections crossing `<code>` / `<b>`.
5. Whitespace-normalized + case-insensitive fallbacks.
6. Uppercase-container heuristic for all-caps headers.
7. Optimistic local update on publish.
8. Cache-bust the read (`cache: "no-store"` + `&_t=<ts>`).
9. Query `state=open`.
10. **Severity tier control in the modal** (4-way radio: FYI / Fix / Block / Override; default FYI). The modal sets the issue's labels per the tier table above. Without this control, the modal can't distinguish actionable from notes-only and `fix-feedback`'s Fix/Block filter never matches anything actionable. The DOM-binding fields (`data-artifact`, `data-record-id`, `data-agent-id`) the overlay walks up to find when capturing the selection are populated into the issue body's `Artifact:` / `Record:` / `Agent:` lines so `fix-feedback` can resolve the target without URL guessing.

**Pass-through-mode caveats** (only differs from PAT / OAuth in these patterns):
- Pattern 2 (GitHub identity = comment author) still holds, but authentication happens on github.com at submission time, not in the dashboard.
- Pattern 7 (optimistic local update) is **N/A** — submit redirects to github.com, not an in-place POST. Re-fetch on `visibilitychange` (when the user returns to the tab) instead.
- The modal's "submit" button opens `github.com/<owner>/<repo>/issues/new` in a new tab with `title`, `body`, and `labels` query params prefilled. Total URL length stays under ~8 KB; long notes get truncated by some browsers.

**Patterns 11–15: render lifecycle + visibility.** The original ten assume a single static document. Real v2 dashboards render content asynchronously from artifacts across multiple pages, with backgrounds that compete with highlights. These five emerged from this skill's own dogfood — without them, the overlay silently does nothing visible. Each cures a specific failure mode the spec did not catch on its own.

11. **Decouple the overlay walk from the page's render lifecycle.** `loadComments` walks the DOM looking for quote anchors. If the page renders content via `await fetchJSON(...); page.innerHTML = ...`, the IIFE may finish *after* `DOMContentLoaded`, so a naive `loadComments()` at boot walks a near-empty body and anchors nothing. Two acceptable patterns:
    - **Preferred (custom event):** each page dispatches `document.dispatchEvent(new Event("dashboard:rendered"))` after its IIFE sets `page.innerHTML`. The overlay listens and re-runs `loadComments()` + `renderFreshness()`. Also re-run on `visibilitychange` (catches new GitHub-side comments when the user returns to the tab).
    - **Fallback (MutationObserver):** if you can't modify the pages, observe `document.body` child-list changes with a ~150 ms debounce and re-run on quiet.

    Either way, `loadComments` MUST call `unwrapExistingAnchors()` first (un-wrap existing `.fb-anchor` spans, then `document.body.normalize()` to merge fragmented text nodes) so re-renders don't double-wrap.

12. **Position-preserving whitespace-flexible match.** Pattern 5 (whitespace-normalized fallback) must keep positions in the *original* text — `wrapRange` indexes walk nodes by original-text offsets. The naive implementation (`text.replace(/\s+/g, " ").indexOf(quote)`) returns offsets in the *normalized* text and silently mis-wraps. Correct shape:

    ```js
    const wsFlex = escapeRegex(quote).replace(/\s+/g, "\\s+");
    const m = text.match(new RegExp(wsFlex)); // m.index is in ORIGINAL text
    ```

    Same shape for the case-insensitive fallback (`new RegExp(wsFlex, "i")`).

13. **Subtle severity-tinted highlight, not visually dominant.** Highlights are *indicators* ("comment here"), not *content*. Use a low-alpha tint (~0.10) + thin (1 px) dashed `border-bottom` with ~0.65 alpha. On hover, lift to ~0.22 alpha + solid border. Severity-distinct hues: blue (Fix), red (Block), amber (Override), **indigo (FYI)** — indigo specifically so the *default* severity stands out from accent-blue Fix *and* from neutral greys. Subtle by default avoids turning a busy oversight surface into a heat map.

14. **Click-to-reveal popover; content stays hidden until asked for.** Don't bake comment content into the page (no inline notes, no large marker pills, no auto-expanded badges). On click of a `.fb-anchor`, open a small floating popover (~360 px) near the anchor containing: severity badge, issue number, **note text**, "filed by @user · 2 h ago", and a small link to the full GitHub issue. Popover dismisses on outside click and `Escape`. Position auto-flips above the anchor when it would otherwise fall below the viewport. *Reason:* the dashboard's spatial layout is the product; comments are metadata about the spatial layout, not part of it. They should be findable in one click, but invisible until then.

15. **Click capture with `preventDefault` inside wrapped links + unanchored fallback toggle.** Two related cases:
    - When the wrapped span sits inside an `<a>` (e.g. nav link), a click on the highlight must not also follow the parent link. Use a body-level **capture-phase** click handler matching `.fb-anchor` and call `e.preventDefault()` + `e.stopPropagation()` before `showPopover(anchor)`.
    - Some quotes can't be located on the page (cross-content selections; text that changed since filing). Don't drop them silently — show a small collapsed pill bottom-right (*"2 floating"*) that expands to a list of unanchored issues on click. Each list item reuses the popover (no new tab); the badge + title + #N is enough metadata to triage. They're still actionable via `fix-feedback`'s `Artifact:` / `Record:` fields; the human just doesn't get an inline anchor.

### Phase 6 — Deploy

GitHub Pages from `gh-pages` is the default. On each main push:

1. **If using build-time freshness** (Phase 4): the CI deploy job runs `python scripts/verify-claims.py` (or equivalent); it rewrites `docs/agent-state/<agent>/claims.json` in place, **commits the result back to `main`** with author `claims-bot <noreply@github.com>` and message prefix `[bot] refresh claims at <ISO>`, then continues to deploy. Committing back (vs. only writing into `gh-pages`) keeps `claims.json` reproducible from `main`'s history. Agent-write-time mode skips this entirely. **The two freshness modes are mutually exclusive** — running both produces write conflicts on `claims.json`. Pick one per project.
2. Mirror HTML + `assets/` into a `gh-pages` worktree.
3. **Mirror `docs/agent-state/` too** — the dashboard fetches artifacts from same-origin; either include them in `gh-pages` or serve them from a Worker. Same-origin fetch is the simpler default. Static GitHub Pages cannot run live checks at viewer-load time; freshness is always one of the three modes from Phase 4.
4. Commit, push.

**OAuth mode adds:** deploy the Worker (`cd worker/feedback && npx wrangler deploy`), mirror `oauth-return.html` to the `gh-pages` root (must match the OAuth App's callback URL exactly), set `GH_CLIENT_SECRET` + `SESSION_SECRET` via `wrangler secret put`.

**Pass-through mode** skips the Worker deploy entirely — there's nothing server-side. For projects already on `main` with a `docs/` subtree (like this skill's dogfood), Pages can serve from `main /docs` directly without a separate `gh-pages` branch:

```bash
gh api -X POST /repos/<owner>/<repo>/pages \
  --input - <<< '{"source":{"branch":"main","path":"/docs"}}'
```

The artifact paths in the dashboard's JS then resolve relative to the page (no `/docs/` prefix on the served URL).

The repo-internal `.md`-link rewriting from v1 is gone — there's no internal `.md` to link to. If the project's spec page wants to link to source files, link directly to `https://github.com/owner/repo/blob/main/path` URLs.

### Phase 7 — The maintenance loop (fix-feedback, reframed)

Install the `fix-feedback` skill. Behavior per severity tier:

- **Fix** (`comment` + `claude-fix`, no `block`): read the linked artifact (prefer the issue body's `Artifact:` / `Record:` fields; fall back to URL + section anchor), apply the minimum edit *to the artifact*, commit, close with `Fixed in <hash>: <summary>. Artifact: <path>`.
- **Block** (`comment` + `claude-fix` + `block`): same edit, but comment instead of close — the issue waits for a human to unblock (close manually or strip `block` label).
- **Override** (`comment` + `override`): **mandatory** — append a `kind: "override"` record to `docs/agent-state/<agent>/decisions.jsonl`, commit, close with `Override logged in <hash>: <subject>. decisions.jsonl record: dec-override-<N>`. This is how the dashboard durably captures human risk acceptance.
- **FYI** (`comment` only): not touched. The human closes when they've read it.

HTML pages themselves are edited only when the comment is about presentation (wording, layout) and the issue body makes that explicit — `Artifact:` empty or pointing at the HTML file. Default to artifact edits.

## What changed from v1

- **Reframed:** from "convert .md walls to HTML" to "render agent artifacts for human oversight." `.md` ingest is a bootstrap path, not the steady-state input.
- **New Phase 2:** artifact schema is now a load-bearing decision, not implicit.
- **Page set:** five required oversight pages (Status, Timeline, Decisions, Drift, Trust) replace the v1 "design pages from reader questions" without constraint.
- **Freshness/provenance:** moved from a build-time check to a rendered-in-UI safety feature.
- **Severity tiers:** comment modal goes from binary `claude-fix` checkbox to 4-tier radio (FYI / Fix / Block / Override).
- **`fix-feedback`:** now edits artifacts, not HTML. HTML is downstream of artifacts.
- **Multi-agent default:** Phase 1b asks about agents (plural), and `agent_id` is required in every artifact.

The 10 comment-overlay patterns are preserved. The auth modes (PAT / OAuth+Worker) are preserved. The `gh-pages` worktree deploy is preserved.

## Anti-patterns

- ❌ Hand-curating HTML pages from `.md` and expecting them to stay current. (The v1 failure mode.)
- ❌ Skipping Phase 2's artifact contract because "the agent doesn't produce structured data yet." Then have the agent produce structured data. The contract is the product.
- ❌ One unified "comment" tier. Without severity, oversight collapses to "everything is a TODO."
- ❌ Rendering claims without provenance. The human can't tell stale from fresh.
- ❌ Auto-generating the dashboard from artifacts with no curation at all. The page selection (which artifacts go on which page) is human judgement.
- ❌ Templating the page set across projects. Required-5 are required; everything else is per-project.
- ❌ Hero blocks, decorative gradients, marketing aesthetics. Info density. The audience is an overseer, not a visitor.

## Auth modes (detail)

| Aspect | PAT | OAuth + Worker | Public-passthrough |
|---|---|---|---|
| Per-viewer setup | ~2 min: paste PAT once | one click | none (existing github.com session) |
| Infra | static site only | static site + Worker + OAuth App | static site only |
| Server-side secrets | none | `GH_CLIENT_SECRET`, `SESSION_SECRET` | none |
| Client-side storage | raw PAT in `localStorage` | HMAC-signed session in `localStorage` | none |
| Read | authenticated GET (5 k/hr) | authenticated via Worker | unauthenticated GET (60/hr per IP) |
| Write | direct API POST | API POST via Worker | redirect to github.com/issues/new with prefilled body |
| If client token leaks | full Issues r/w on the repo | only the Worker's exposed routes | n/a (no client tokens) |
| Repo visibility | private + public | private + public | **public only** |
| Good fit | solo / tiny technical teams | non-technical collaborators, polished UX | small public projects, any audience |

## Common failure modes

| Symptom | Phase | Cause / fix |
|---|---|---|
| Dashboard shows old state; human acts on it | 4 | Freshness/provenance not surfaced in UI. Add `data-fresh-at` rendering. |
| Agent produces no artifacts; dashboard is hand-edited | 2 | No artifact contract committed to. Re-do Phase 2 — agree on the minimum schema and have the agent write into it. |
| `/fix-feedback` matches nothing | 5, 7 | Severity radio missing or defaults to FYI. Default to Fix when the human selects text from a known-mutable region; FYI otherwise. |
| Comments edit HTML, then artifacts regenerate the HTML and overwrite | 7 | `fix-feedback` edited HTML instead of the underlying artifact. Default to artifact edits. |
| Plan/actual diverge silently | 3 | No Drift page. Add it; pull from `plan.json` vs `claims.json`. |
| Multiple agents, no idea which did what | 1b, 2 | Missing `agent_id` in artifacts. Add it everywhere. |
| Collaborators won't paste a PAT | 1a, 5 | Switch to OAuth + Worker. |
| `redirect_uri_mismatch` on sign-in | 1a, 6 | OAuth App callback URL doesn't match deployed `oauth-return.html`. |
| Section header doesn't highlight | 5 | Pattern 6 (uppercase-container heuristic) missing. |
| Selection across `<code>` fails | 5 | Pattern 4 (multi-text-node walker) missing. |
| **Filed a comment, the highlight never appears on the page** | 5 | Pattern 11 missing — `loadComments` ran before the page's async IIFE finished. Dispatch `dashboard:rendered` after each page renders; overlay listens and re-walks. |
| **Highlight lands a few chars off from the actual quote** | 5 | Pattern 12 missing — normalized fallback returned wrong-coordinate-space indexes. Use whitespace-flexible regex against the original text. |
| **FYI comments are wrapped but invisible on the rendered page** | 5 | Pattern 13 missing — grey-on-grey on `.active` nav links or `--surface-alt` cards. Use indigo for FYI (distinguishes from greys); subtle but never zero contrast. |
| **Dashboard looks like a heat map of saturated highlights** | 5 | Pattern 13 mis-tuned in the other direction — alpha too high or border too thick. Drop background alpha to ~0.10 and use a thin dashed border-bottom. Highlights are *indicators*, not content. |
| **Comment count in nav non-zero but no way to discover what the comments say** | 5 | Pattern 14 missing — no click-to-reveal popover. Add a floating popover with note text + author + GitHub link, opened by clicking any `.fb-anchor`. |
| **Click on highlight follows the parent link instead of opening the issue** | 5 | Pattern 15 missing — capture-phase click handler must `preventDefault` + `stopPropagation` on `.fb-anchor` before `showPopover()`. |
| **Cross-section / multi-event selections submit but never render** | 5 | Pattern 15 fallback missing — render the unanchored-comments toggle so they're not invisible. `fix-feedback` still handles them via Artifact + Record fields. |
| **Double-wrapped or fragmented text after re-renders** | 5 | `unwrapExistingAnchors()` + `document.body.normalize()` missing before each `loadComments` re-walk. |

## Dogfood before publishing

The original 10 patterns came from imagehide's real use; patterns 11–15 came from this skill's own dogfood. **Spec review (including a strong Codex pass) does not catch implementation race conditions, coordinate-space bugs, or visibility-against-real-backgrounds issues.** Before declaring this methodology "done" on a new project:

1. Build the dashboard end-to-end (artifacts → pages → overlay → deploy).
2. File at least one comment of each severity tier from a real browser session.
3. Verify each highlight is visible-but-subtle (no heat map), and clicking opens an in-page popover with the note text — not a tab redirect.
4. Press Escape / click outside — popover closes.
5. File a comment whose quote spans two sections — verify the bottom-right *"N floating"* toggle appears and expands to a list of unanchored issues; clicking any item opens the same popover.
6. Refresh and navigate between pages — verify `dashboard:rendered` re-walks correctly (no double-wraps; old anchors get unwrapped first).

If any step silently fails, that's a missing pattern. Add it back here so the next project doesn't repeat the same discovery.

## See also

- `html-effectiveness` (required) — the 9 layout primitives the oversight pages are built from.
- `fix-feedback` — the runtime loop for the Fix/Block tiers; edits artifacts, not HTML.
- W3C Web Annotation Data Model: https://www.w3.org/TR/annotation-model/#text-quote-selector

