---
name: fix-feedback
description: Use when the user explicitly asks to process the dashboard comment/feedback queue, work through `claude-fix` GitHub issues, or close the loop on inline comments filed by an HTML dashboard's overlay. Pairs with the `build-html-dashboard` skill. Do NOT use for general GitHub issue triage.
---

# fix-feedback — process the dashboard comment queue

Read open issues filed by the project's HTML dashboard (issues carrying both `comment` and `claude-fix` labels), parse each, apply the minimum edit, mirror to `gh-pages` if HTML/assets changed, close the issue.

This skill is the runtime half of the methodology in `build-html-dashboard` — Phase 6 of that skill. It replaces the older per-project `.claude/commands/fix-feedback.md` slash command (which still ships as a template for projects with non-standard page layouts that need the URL→file mapping spelled out by hand).

## Step 0 — Derive project context (don't ask if you can detect)

```bash
git remote get-url origin
```

Parse the result to get `<OWNER>/<REPO>`. Both `https://github.com/<OWNER>/<REPO>.git` and `git@github.com:<OWNER>/<REPO>.git` forms work.

Default GitHub Pages base URL: `https://<OWNER>.github.io/<REPO>/`.

**Ask the user only if:**
- `git remote get-url origin` fails or isn't a GitHub URL, OR
- The project uses a custom domain or non-default Pages branch (signaled by a `CNAME` file at the repo root or a stray `Where:` URL in a comment that doesn't start with the default base URL).

If you ask, ask once and reuse for the rest of the session.

## Step 1 — List action items

```bash
gh issue list -R <OWNER>/<REPO> \
  --label claude-fix --label comment \
  --state open \
  --json number,title,body,url,createdAt,labels
```

**Both labels required.** Issues from the new dashboard flow always carry both `comment` (every published comment) and `claude-fix` (only when the user ticked "Ask Claude to fix"). Issues with `claude-fix` alone are legacy pre-toggle artifacts and should NOT be auto-processed — they need manual review since the user didn't necessarily intend to flag them for action.

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

**Auto-derive URL → file mapping.** Strip `<PAGES_BASE_URL>` from the `Where:` URL. Treat the remainder as a path under the repo root:

| URL remainder | Maps to |
|---|---|
| `` (empty) or `/` | `index.html` at repo root |
| `docs/html/spec.html` | `docs/html/spec.html` |
| `subdir/page` (no extension) | `subdir/page/index.html` if it exists, else `subdir/page.html` |

Verify the file exists before editing. If the mapping doesn't resolve, ask the user.

- Section anchors (`#…`) point to a specific `<section>` / `<h2>` / `<h3>` inside the HTML.
- The HTML is often derived from `.md` sources under `docs/`. Use judgement on whether the fix belongs in the HTML directly (wording, layout) or upstream in the `.md` source (design rationale, plan changes).
- If `Quote` is empty or the `Note` says "the whole section" / similar, the comment is about a region, not a specific phrase.

## Step 3 — Plan + execute

- Use `TaskCreate` to add one task per issue so the user can see progress.
- Read the relevant source file(s) before editing.
- Apply the smallest change that satisfies the request. Don't refactor surrounding code unless the request specifically asks.
- After edits:
  - Validate (run `node -c` on JS, parse HTML, etc. — whatever the change calls for).
  - Commit on `main` with a clear message referencing the issue: `fix: <one line> (closes #<N>)`.
  - Push to `origin main`.
  - **If `index.html`, `docs/html/*.html`, or `assets/*` changed**, mirror to `gh-pages` per the project's deploy doc (worktree → copy → sed link rewrite → commit → push). If no deploy doc exists, ask the user how the project mirrors HTML to `gh-pages`.
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

- Issues with **only** the `comment` label (no `claude-fix`): notes / discussion items, not action items. Leave them open.
- Closed issues, even if labeled `claude-fix` — already resolved.

## When to prefer the template over this skill

Copy `templates/fix-feedback.md` into the project's `.claude/commands/` when:
- The project's URL→file mapping isn't a clean strip-prefix (e.g. an HTML page is generated from a `.md` two directories away, or multiple Pages sites share a repo).
- You want the mapping written down explicitly for collaborators to read.
- The repo isn't hosted on GitHub Pages (different base URL, different deploy mechanism).

## See also

- `build-html-dashboard` — the methodology this skill closes the loop for. Phase 4 pattern 10 (the `claude-fix` opt-in checkbox in the comment modal) is what makes the `comment AND claude-fix` filter actually match anything.
