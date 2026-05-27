---
description: Drain the oversight dashboard's comment queue — edits agent artifacts, not HTML
---

<!--
TEMPLATE — copy this file to `.claude/commands/fix-feedback.md` in your
project, then replace the placeholders below:

  <OWNER>/<REPO>          → your GitHub repo (e.g. acme/widgets)
  <PAGES_BASE_URL>        → your GitHub Pages base URL
                            (e.g. https://acme.github.io/widgets)
  <URL_TO_ARTIFACT_MAP>   → adjust the URL → artifact mapping in Step 2 for
                            the pages and artifact layout this project uses

This is the fallback per-project form. Prefer the `fix-feedback` skill
unless your project's URL → artifact mapping is unusual (multi-site,
custom domain, non-standard `agent-state/` layout).
-->

Process the pending oversight dashboard comment queue for this project.

## Step 1 — List action items

Fetch all `comment`-labeled open issues, then classify in-memory (single AND-filter on the CLI would miss Override, which doesn't carry `claude-fix`):

```bash
gh issue list -R <OWNER>/<REPO> \
  --label comment \
  --state open \
  --json number,title,body,url,createdAt,labels
```

**Tier classification** by label set (every fetched issue has `comment`, so these four cases are exhaustive):

| Labels present | Tier | Action |
|---|---|---|
| `comment` + `claude-fix` (no `block`) | **Fix** | edit artifact, commit, close |
| `comment` + `claude-fix` + `block` | **Block** | edit artifact, commit, leave open with resolution comment |
| `comment` + `override` (no `claude-fix`) | **Override** | append override record to `decisions.jsonl`, commit, close |
| `comment` only | **FYI** | skip; not an action item |

Legacy pre-tier issues with `claude-fix` but no `comment` are excluded from this fetch — they need manual review separately.

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

1. **`Artifact:` field present** — use it directly. Preferred path; the overlay populated it from `data-artifact` / `data-record-id` ancestors. If `Record:` is also present, locate that record inside the file:
   - **JSONL** (`events.jsonl`, `decisions.jsonl`): line-grep `"id": "<value>"`.
   - **Top-level array JSON** (`plan.json` → `steps[]`, `risks.json` → `risks[]`, `blockers.json` → `blockers[]`): `jq '.steps[] | select(.id == "s2")' plan.json`.
   - **Flat-keyed JSON** (`claims.json`): search top level by `id`.
2. **`Artifact:` absent** — fall back to URL-based mapping. Strip `<PAGES_BASE_URL>` from `Where:`. Project-specific mapping (edit for your layout):

   - `<PAGES_BASE_URL>/` → `docs/agent-state/<agent>/plan.json` + `blockers.json` + latest `events.jsonl` (Live Status page)
   - `<PAGES_BASE_URL>/timeline.html` → `docs/agent-state/<agent>/events.jsonl`
   - `<PAGES_BASE_URL>/decisions.html` → `docs/agent-state/<agent>/decisions.jsonl`
   - `<PAGES_BASE_URL>/drift.html` → `docs/agent-state/<agent>/plan.json` + `claims.json` + live source checks
   - `<PAGES_BASE_URL>/trust.html` → GitHub Issues history (no local artifact — leave as feedback on the trust-calibration logic itself)
   - `<PAGES_BASE_URL>/spec.html` → `docs/agent-state/<agent>/claims.json`
   - …add one row per page this project's dashboard ships.

   When multiple artifacts back one page, use `Quote:` to disambiguate against the current contents of each candidate file.

3. **`Agent:` field present** — selects `docs/agent-state/<agent_id>/`. Absent: infer from URL or ask.

**Default: edit the artifact, not the HTML.** The HTML re-renders. Only edit HTML when `Artifact:` is empty AND the comment is about presentation (layout, page-level wording outside any artifact-rendered region) and the issue body makes that explicit. When ambiguous, ask.

For JSONL append-only artifacts, prefer *appending a corrective record* (with `supersedes: "<id>"`) over editing history.

If `Quote` is empty or the `Note` says "the whole section," the comment is about a region/decision — edit the artifact backing it.

## Step 3 — Plan + execute

- Use `TaskCreate` to add one task per Fix / Block / Override issue.
- Read the target artifact before editing.
- Apply the smallest change that satisfies the request.
- **Override-tier handling is mandatory.** Append to `docs/agent-state/<agent_id>/decisions.jsonl`:

  ```json
  {"id": "dec-override-<issue_number>", "ts": "<now ISO 8601>",
   "agent_id": "<agent_id>", "kind": "override",
   "subject": "<from issue title or Quote>",
   "rationale": "<from issue body Note>",
   "made_by": "human:<github-login of issue author>",
   "issue": <N>}
  ```

  Requires `<agent_id>` resolved from Step 2. If `Agent:` was absent and the URL didn't disambiguate, **do not auto-log** — report for manual review and skip closure.

- After edits:
  - **Validate artifacts**: `jq . file.json` / line-by-line `jq` for JSONL. Schema errors break the dashboard render.
  - For HTML edits: `node -c` JS / parse HTML.
  - Commit on `main`:
    - Fix: `fix(<agent_id>): <one line> (closes #<N>)`
    - Block: `block-resolved(<agent_id>): <one line> (refs #<N>)`
    - Override: `override(<agent_id>): <one line> (closes #<N>)`
  - Push to `origin main`.
  - **If `docs/agent-state/`, `index.html`, `docs/html/*.html`, or `assets/*` changed**, mirror to `gh-pages` (worktree → copy → commit → push).
- Close (Fix and Override):
  ```bash
  # Fix
  gh issue close <N> -R <OWNER>/<REPO> -c "Fixed in <short-hash>: <summary>. Artifact: <path>"
  # Override
  gh issue close <N> -R <OWNER>/<REPO> -c "Override logged in <short-hash>: <subject>. decisions.jsonl record: dec-override-<N>"
  ```
- For Block, comment instead:
  ```bash
  gh issue comment <N> -R <OWNER>/<REPO> -b "Block-resolved in <short-hash>: <summary>. Artifact: <path>. Close when ready to unblock."
  ```

## Step 4 — Ambiguity → ask

If an issue is ambiguous, implies a scope decision, or wants to modify an in-flight plan in a way that contradicts a prior decision record, ask before acting.

For Block-tier issues requiring a human decision the dashboard didn't capture, don't try to resolve — report back to the user.

## Step 5 — Wrap-up

Report:
- Fix-tier closed: commit hashes + one-line summaries + artifact paths.
- Override-tier closed: commit hashes + `dec-override-<N>` record ids.
- Block-tier block-resolved (awaiting human close).
- Issues skipped (FYI, legacy, ambiguous) and why.
- New findings worth surfacing (real bugs, contradictions between artifacts).

## Don't touch

- `comment`-only issues (FYI): discussion, not action — human closes when read.
- Closed issues, even if labeled `claude-fix`.
- HTML files when the underlying artifact would cover the fix.
