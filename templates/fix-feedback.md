---
description: Read all open `claude-fix` GitHub issues and work through each one
---

<!--
TEMPLATE — copy this file to `.claude/commands/fix-feedback.md` in your
project, then replace the placeholders below:

  <OWNER>/<REPO>      → your GitHub repo (e.g. acme/widgets)
  <PAGES_BASE_URL>    → your GitHub Pages base URL
                        (e.g. https://acme.github.io/widgets)
  <PAGE_URL_MAPPING>  → adjust the URL → file mapping in Step 2 for the
                        pages this project actually ships
-->

Process the pending dashboard feedback queue for this project.

## Step 1 — List action items

```bash
gh issue list -R <OWNER>/<REPO> \
  --label claude-fix --label comment \
  --state open \
  --json number,title,body,url,createdAt,labels
```

**Both labels required.** Issues from the new dashboard flow always carry both `comment` (every published comment) and `claude-fix` (only when the user ticked "Ask Claude to fix"). Issues with `claude-fix` alone are legacy artifacts from before the toggle existed and should NOT be auto-processed — they need manual review since the user didn't necessarily intend to flag them for action.

If the list is empty, report so and stop.

## Step 2 — Parse each issue body

Bodies follow the dashboard's template:

```
**Where:** <page_url>[#<section_anchor>]

**Quote:**
> <selected text from the page>

**Note:**
<user's request>
```

- `Where` URL tells you which page the comment is about. Map URLs to source files for this project, e.g.:
  - `<PAGES_BASE_URL>/` → `index.html` at repo root (the dashboard)
  - `<PAGES_BASE_URL>/docs/html/spec.html` → `docs/html/spec.html`
  - …add one row per page the dashboard ships.
- Section anchors (`#…`) point to a specific `<section>` / `<h2>` inside the HTML.
- The HTML is often derived from `.md` sources under `docs/`. Use judgement on whether the fix belongs in the HTML directly (e.g. wording, layout) or upstream in the `.md` source (e.g. design rationale, plan changes).
- If `Quote` is empty or the `Note` says "the whole section" / similar, the comment is about a region, not a specific phrase.

## Step 3 — Plan + execute

- Use `TaskCreate` to add one task per issue so the user can see progress.
- Read the relevant source file(s) before editing.
- Apply the smallest change that satisfies the request. Don't refactor surrounding code unless the request specifically asks.
- After edits:
  - Validate (run `node -c` on JS, parse HTML, etc. — whatever the change calls for).
  - Commit on `main` with a clear message referencing the issue: `fix: <one line> (closes #<N>)`.
  - Push to `origin main`.
  - **If `index.html`, `docs/html/*.html`, or `assets/*` changed**, mirror to `gh-pages` per the project's deploy doc (worktree → copy → sed link rewrite → commit → push).
- Close the issue:
  ```bash
  gh issue close <N> -R <OWNER>/<REPO> -c "Fixed in <short-commit-hash>: <one-line summary>"
  ```

## Step 4 — Ambiguity → ask

If an issue is ambiguous, requires a scope decision, or implies changes to in-flight research (e.g. modifying `PLAN.md` or `HANDOFF.md`), **ask the user before acting**. Don't guess.

## Step 5 — Wrap-up

Report:
- Issues closed (with commit hashes and one-line summaries).
- Issues skipped or deferred (and why).
- Any new findings worth surfacing (e.g. a comment revealed a real bug that warrants follow-up issues).

## Don't touch

- Issues with **only** the `comment` label (no `claude-fix`): these are notes / discussion items, not action items. Leave them open.
- Closed issues, even if labeled `claude-fix` — already resolved.
