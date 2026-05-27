---
name: fix-feedback
description: Use when the user explicitly asks to process the dashboard comment queue, classify severity-tiered GitHub issues filed by an AI-oversight dashboard's overlay (Fix / Block / Override / FYI), or close the loop on inline comments. Pairs with the `build-html-dashboard` skill. The skill edits agent artifacts (plan, events, claims, decisions, etc.), not HTML — the HTML re-renders from artifacts. Do NOT use for general GitHub issue triage.
---

# fix-feedback — drain the oversight comment queue

Read open `comment`-labeled issues filed by the project's oversight dashboard, classify each by label set into one of four severity tiers (Fix / Block / Override / FYI), and act per tier: Fix → **edit the underlying artifact** (not the HTML), commit, close; Block → edit + leave open with resolution comment; Override → append a mandatory override record to `decisions.jsonl`, commit, close; FYI → leave for the human. Mirror to `gh-pages` if `docs/agent-state/`, HTML, or `assets/*` changed.

This is the runtime half of `build-html-dashboard` Phase 7. It replaces the older per-project `.claude/commands/fix-feedback.md` slash command (still shipped as a template for projects with non-standard layouts).

## Step 0 — Derive project context

```bash
git remote get-url origin
```

Parse to get `<OWNER>/<REPO>`. Default Pages base URL: `https://<OWNER>.github.io/<REPO>/`.

**Ask the user only if:**
- `git remote get-url origin` fails or isn't a GitHub URL.
- The project uses a custom domain or non-default Pages branch (CNAME file, or a `Where:` URL that doesn't start with the default base).
- The repo doesn't have a `docs/agent-state/` (or equivalent) directory — ask where the agent's artifacts live.

If you ask, ask once and reuse for the session.

## Step 1 — List action items

Fetch all `comment`-labeled open issues, then filter in-memory by label combination (single AND-filter on the CLI would miss `override`-tier issues, which don't carry `claude-fix`):

```bash
gh issue list -R <OWNER>/<REPO> \
  --label comment \
  --state open \
  --json number,title,body,url,createdAt,labels
```

**Tier classification** by the issue's label set (every fetched issue has `comment`, so these four cases are exhaustive):

| Labels present | Tier | Action |
|---|---|---|
| `comment` + `claude-fix` (no `block`) | **Fix** | edit artifact, commit, close |
| `comment` + `claude-fix` + `block` | **Block** | edit artifact, commit, leave open with resolution comment |
| `comment` + `override` (no `claude-fix`) | **Override** | append override record to `decisions.jsonl`, commit, close |
| `comment` only | **FYI** | skip; not an action item |

Legacy pre-tier issues with `claude-fix` but no `comment` are intentionally excluded from this fetch — they need manual review (see "Don't touch"). To audit them separately:

```bash
gh issue list -R <OWNER>/<REPO> --label claude-fix --state open --json number,title,labels \
  | jq '.[] | select((.labels | map(.name)) | index("comment") | not)'
```

If no Fix / Block / Override issues remain after classification, report so and stop.

## Step 2 — Parse each issue body

Bodies follow the dashboard's template:

```
**Severity:** Fix | Block | Override | FYI
**Where:** <page_url>[#<section_anchor>]
**Agent:** <agent_id>                     (when DOM had data-agent-id)
**Artifact:** <docs/agent-state/.../file>  (when DOM had data-artifact)
**Record:** <record-id>                    (when DOM had data-record-id)

**Quote:**
> <selected text>

**Note:**
<user's request>

<!-- fb-ctx: pre="..." suf="..." -->
```

**Resolve the target (in order of preference):**

1. **`Artifact:` field present** — use it directly. This is the fast, unambiguous path; the dashboard's overlay populates `Artifact:` / `Record:` from `data-artifact` / `data-record-id` ancestors of the selected text. **This path also handles unanchored comments** — ones whose quote spans multiple sections or whose page text changed since filing, which appear in the dashboard's unanchored-banner instead of as inline highlights. `fix-feedback` doesn't need the quote location; it only needs the artifact + record id. So unanchored is not unactionable. If `Record:` is also present, locate that record inside the file:
   - **JSONL files** (`events.jsonl`, `decisions.jsonl`): line-grep for `"id": "<value>"`.
   - **Top-level array JSON** (`plan.json` → `steps[]`, `risks.json` → `risks[]`, `blockers.json` → `blockers[]`): use `jq` to find the array element by `id` — e.g. `jq '.steps[] | select(.id == "s2")' plan.json`.
   - **Flat-keyed JSON** (`claims.json`): search at the top level by `id`.
2. **`Artifact:` absent** — fall back to URL-based mapping. Strip `<PAGES_BASE_URL>` from `Where:`:

   | Page (URL remainder) | Reads from artifact(s) |
   |---|---|
   | `` or `/` (Live Status Board) | `docs/agent-state/<agent>/plan.json`, `blockers.json`, latest `events.jsonl` |
   | `timeline.html` | `docs/agent-state/<agent>/events.jsonl` |
   | `decisions.html` | `docs/agent-state/<agent>/decisions.jsonl` |
   | `drift.html` | `docs/agent-state/<agent>/plan.json` + `claims.json` + live sources |
   | `trust.html` | GitHub Issues history (no local artifact — leave as feedback on the trust-calibration logic itself) |
   | `spec.html`, `runbook.html`, project-specific | project-defined; usually `claims.json` |

   When multiple artifacts back one page (e.g. Live Status reads three), use the `Quote:` text to disambiguate — match against the current contents of each candidate file.

3. **`Agent:` field present** — use to select `docs/agent-state/<agent_id>/`. Absent: infer from URL path segments, or if still ambiguous, ask.

**Decide: artifact edit or HTML edit?**

- **Default: edit the artifact.** Wording / data / decisions / plan steps / risks live in artifacts. The HTML re-renders.
- **HTML edit only when** `Artifact:` is empty AND the comment is about presentation (layout, missing column, page-level wording outside any artifact-rendered region). The issue body should make this explicit — if ambiguous, ask the user.

If `Quote` is empty or the `Note` says "the whole section," the comment is about a region/decision, not a phrase — edit the artifact that backs that region.

## Step 3 — Plan + execute

- Use `TaskCreate` to add one task per Fix / Block / Override issue.
- Read the target artifact before editing.
- Apply the smallest change that satisfies the request. For JSONL append-only artifacts (`events.jsonl`, `decisions.jsonl`), prefer *appending a corrective record* (with `supersedes: "<id>"`) over editing history.
- **Override-tier handling is mandatory** (not optional). Append a record to `docs/agent-state/<agent_id>/decisions.jsonl` with this exact shape:

  ```json
  {"id": "dec-override-<issue_number>", "ts": "<now ISO 8601>",
   "agent_id": "<agent_id>", "kind": "override",
   "subject": "<from issue title or Quote>",
   "rationale": "<from issue body Note>",
   "made_by": "human:<github-login of issue author>",
   "issue": <N>}
  ```

  Requires `<agent_id>` resolved from Step 2. **If `Agent:` was absent in the issue body and the URL didn't disambiguate** (e.g. a cross-agent or multi-agent page), do **not** auto-log — report the issue for manual review and skip closure. Writing the override to the wrong agent's history is worse than leaving it uncaptured. Without an `agent_id`, human override decisions go uncaptured and the agent has no record of what risks were knowingly accepted.

- After edits:
  - **Validate the artifact**: `jq . file.json` for JSON, line-by-line `jq` for JSONL. Schema errors mean the dashboard won't render — catch them now.
  - For HTML edits: `node -c` JS / HTML parse / open in headless browser if available.
  - Commit on `main`:
    - Fix: `fix(<agent_id>): <one line> (closes #<N>)`
    - Block: `block-resolved(<agent_id>): <one line> (refs #<N>)`
    - Override: `override(<agent_id>): <one line> (closes #<N>)`
  - Push to `origin main`.
  - **If `docs/agent-state/`, `index.html`, `docs/html/*.html`, or `assets/*` changed**, mirror to `gh-pages` per the project's deploy doc. If no deploy doc exists, ask.
- Close (Fix and Override):
  ```bash
  # Fix
  gh issue close <N> -R <OWNER>/<REPO> -c "Fixed in <short-hash>: <summary>. Artifact: <path>"
  # Override
  gh issue close <N> -R <OWNER>/<REPO> -c "Override logged in <short-hash>: <subject>. decisions.jsonl record: dec-override-<N>"
  ```
- For Block, add a comment instead of closing:
  ```bash
  gh issue comment <N> -R <OWNER>/<REPO> -b "Block-resolved in <short-hash>: <summary>. Artifact: <path>. Close when ready to unblock."
  ```

## Step 4 — Ambiguity → ask

If an issue is ambiguous, implies a scope decision, or wants to modify an in-flight plan/decision in a way that contradicts a prior decision record, **ask before acting**. Don't guess.

For Block-tier issues that require a human decision the dashboard didn't capture (e.g., "should we abandon this approach?"), don't try to resolve — report back to the user and let them decide.

## Step 5 — Wrap-up

Report:
- Fix-tier issues closed: commit hashes, one-line summaries, artifact paths edited.
- Override-tier issues closed: commit hashes + `dec-override-<N>` record ids.
- Block-tier issues block-resolved: same as Fix, awaiting human close.
- Issues skipped (FYI, legacy, ambiguous): reasons.
- Any new findings worth surfacing (e.g. a comment revealed a real bug warranting a follow-up issue, or a contradiction between two artifacts).

## Don't touch

- FYI issues (`comment` only, no `claude-fix`, no `override`): discussion, not action — the human closes when read.
- Closed issues, even if labeled `claude-fix` — already resolved.
- HTML files when the underlying artifact would cover the fix. Default to artifact edits.

## When to prefer the template over this skill

Copy `templates/fix-feedback.md` into `.claude/commands/` when:

- The URL → artifact mapping isn't a clean strip-prefix (e.g. HTML rendered from artifacts in a non-obvious location, multiple Pages sites sharing a repo).
- The project doesn't use `docs/agent-state/` and has a custom layout for its artifacts.
- You want the mapping written down explicitly for collaborators.
- The repo isn't on GitHub Pages (different base URL / different deploy mechanism).

## See also

- `build-html-dashboard` — the methodology. Phase 5 (severity tiers in the comment modal) is what makes the `comment + claude-fix [+ block | override]` filter actually match anything.
- W3C Web Annotation Data Model: https://www.w3.org/TR/annotation-model/#text-quote-selector
