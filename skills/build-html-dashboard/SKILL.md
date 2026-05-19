---
name: build-html-dashboard
description: Use when a project has accumulated .md walls (HANDOFF, PLAN, MODEL_CARD, scripts, datasets, etc.) and the reader experience is bad. Produces an HTML-first internal dashboard with inline commenting backed by GitHub Issues. The dashboard's page structure, content, and tone are derived from the project — this skill is the methodology, not a template. Symptoms — "convert these docs to HTML", "make this project navigable", "add commenting to our docs site", "reorganize the .md walls".
---

# Build an HTML dashboard for a project

## Overview

A methodology for replacing a project's `.md` documentation walls with a small set of task-oriented HTML pages, plus an in-page commenting overlay backed by GitHub Issues. The dashboard's specific layout, page count, and content come from the target project — not from a template. The .md sources stay as the editable source of truth; the HTML is a curated work surface for the project's actual readers.

**Core principle:** group by reader question, not by source artifact. A `MODEL_CARD.md` + `HANDOFF.md` + `PLAN.md` triple doesn't automatically map to three HTML pages — it maps to whatever set of pages answers the questions the readers actually ask.

## When to use

- A project has 5+ `.md` files and people skip reading them
- The audience is project insiders (collaborators with GitHub accounts)
- You want comments anchored to specific text, persisting across sessions, tracking action items
- A static-site deploy target exists (GitHub Pages, Netlify, plain HTTP)

**Don't use when:**
- The audience is the public / paper reviewers → use `frontend-design` for marketing pages
- The project has 1–2 docs → just edit the markdown
- You want anonymous commenting → use giscus or a Worker-backed system

## REQUIRED background skills

- `html-effectiveness` — the 9 spatial patterns (Comparison Board, Annotated Timeline, Knowledge Explorer, Interactive Report, Decision Matrix, Kanban, Slide Deck, Design Tokens, Code Review Board). Each page picks one.

## The methodology — six phases

### Phase 1 — Audience analysis (the questions)

Don't open an editor yet.

**1a. First, ASK the user — source-of-truth mode.** This is an explicit
decision, not an assumption. Use `AskUserQuestion` with three options:

- **Docs-only**: build strictly from existing `.md` files (HANDOFF, PLAN,
  model card, scripts, datasets, etc.). Faster, lower risk of speculation,
  but stale `.md` will produce a stale dashboard.
- **Free exploration**: ignore the `.md` files; read the code, configs,
  result JSONs, `train_args.txt`, `git log`, `squeue`, etc. directly.
  Higher fidelity to *what's actually deployed*, but the agent has to
  reverse-engineer intent.
- **Combine (recommended for most projects)**: `.md` files for *intent
  and narrative*, live sources for *current state*. Treat `.md` as
  potentially stale and verify the load-bearing numbers (deployed
  checkpoint path, headline metrics, in-flight jobs) against the actual
  artifacts before quoting them.

Whatever the user picks, commit to it explicitly — and if "Combine", be
upfront about which page sections come from `.md` (intent / decisions /
rejected alternatives) vs from live sources (running jobs / latest eval
numbers / current deployed checkpoint).

**1b. Then answer:**

1. **Who reads this?** (Insiders / paper readers / external collaborators / future-you on a fresh checkout)
2. **What questions do they arrive with?** Common: *Where is the project right now? What does this thing do? Why these design choices? What's the plan? How do I run it?* — but the actual set is project-specific.
3. **What's already documented?** Inventory: `.md` files, `HANDOFF`, `PLAN`, model cards, scripts, datasets, results dirs.
4. **What's stale?** Anything not touched in months is suspect — verify against `git log`, running jobs, actual deployed checkpoints (read `train_args.txt`, config files; don't trust .md defaults).
5. **What's the audience tone?** Insiders want information density; outsiders want context. Pick one and commit.

Output: a chosen source-mode + a list of 4–7 reader questions + a freshness map of the source material.

### Phase 2 — Page design (from first principles)

Map each reader question to one page. Match each page to one pattern from `html-effectiveness`:

| Typical reader question | Likely pattern | Source material |
|---|---|---|
| "Where am I right now?" | Interactive Report (live status) | HANDOFF + git log + running jobs |
| "What is this? How does it work?" | Interactive Report (reference tables) | model card + spec docs |
| "Why these choices?" | Knowledge Explorer (collapsibles) | design-rationale docs |
| "What's planned? What was decided?" | Annotated Timeline | plan + decision log |
| "How do I run / deploy / debug?" | Interactive Report (filterable tables) | scripts + datasets + runbooks |

**Target 4–6 pages.** More than that = the dashboard has no spine. **Do not mirror `.md` files 1:1** — the whole point is reorganization. Merge, split, drop as needed.

### Phase 3 — HTML implementation

- One file per page. No JS framework. No build step.
- Each page declares CSS custom properties at top (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`, `--accent-bg`, `--ok`, `--warn`, `--bad`, `--radius`).
- Light + dark themes via `@media (prefers-color-scheme: dark)`.
- Monospace for paths, params, command lines.
- Information density > aesthetics for insider audiences. Compact tables, tight padding, no hero blocks.
- Verify deployed state: read `train_args.txt`, eval JSONs, etc. — don't quote .md defaults that may be stale.

### Phase 4 — Inline comment system

Each page loads a small overlay (`assets/feedback.css` + `assets/feedback.js`) that adds: highlight → 💬 → modal → publish. Comments are stored as GitHub Issues in the project's repo. **Configure per project; do not template.**

Required GitHub setup (one-time):
```bash
gh label create comment    -R owner/repo --color 5319e7
gh label create claude-fix -R owner/repo --color 0e8a16
```

Per-viewer setup (one-time, ~2 min per collaborator): fine-grained PAT, *Issues r/w on this repo only*, paste into the Sign-in modal — stored in their browser's localStorage.

The load-bearing patterns the overlay must implement (each cures a specific failure mode):

1. **Static `<button>` in HTML for Sign-in / View** — survives cache misses; do not JS-inject.
2. **Per-viewer PAT, no shared backend** — GitHub identity = comment author; works for private repos.
3. **TextQuoteSelector context anchor** (W3C Web Annotations): capture ~32 chars before + after the selection; embed in the issue body as `<!-- fb-ctx: pre="..." suf="..." -->`. Disambiguates duplicate text.
4. **Multi-text-node walker** — selections cross `<code>`, `<b>`, line breaks. Build a flat concatenated text + position map by walking text nodes; wrap each text node touched.
5. **Whitespace-normalized + case-insensitive fallbacks** — handles selections across line breaks and `text-transform: uppercase` section headers.
6. **Uppercase-container heuristic** — for all-caps needles with multiple matches, prefer the one whose ancestor has computed `text-transform: uppercase`.
7. **Optimistic local update on publish** — GitHub's GET is eventually consistent; don't wait. Build the comment object from the POST response + the data you already had, prepend locally, re-render inline highlights synchronously.
8. **Cache-bust the read** — `cache: "no-store"` + `&_t=<ts>` query param.
9. **Query `state=open`** — hide resolved comments.
10. **`claude-fix` opt-in checkbox in the comment modal** — the modal must include a checkbox like *"Let Claude fix this"*. When checked, the `POST /issues` call sends `labels: ["comment", "claude-fix"]`; otherwise just `["comment"]`. Without this checkbox, the dashboard creates `comment`-only issues, and the `/fix-feedback` filter (`comment AND claude-fix`, Phase 6) can never match — the user must round-trip to github.com to add `claude-fix` manually. The point of the dashboard is *not* having to leave it; the checkbox closes that loop.

These ten are non-obvious. Each was discovered the hard way; don't skip any.

### Phase 5 — Deploy

Most projects: GitHub Pages from a `gh-pages` branch. On each main-branch push, mirror the HTML + `assets/` into a `gh-pages` worktree, **rewrite repo-internal `.md` and source links** to `https://github.com/owner/repo/blob/main/...` URLs (the gh-pages branch only carries HTML, so `.md` links 404 otherwise), commit, push.

### Phase 6 — Maintenance loop

Install the `fix-feedback` skill (preferred — auto-derives `<OWNER>/<REPO>` from `git remote`, no per-project config), or drop the `fix-feedback.md` template into `.claude/commands/` when the project's URL→file mapping isn't a clean strip-prefix (multi-site repo, custom domain, HTML rendered from `.md` in a non-obvious location). Filter is the **intersection** `--label comment --label claude-fix` (legacy issues with only `claude-fix` are pre-toggle artifacts — exclude). The `claude-fix` label is set at issue-creation time by the modal checkbox (Phase 4, pattern 10) — *never* require collaborators to add it manually on github.com after the fact. Behavior: list, parse each body for URL anchor + quote + note, map URL → source file, apply minimal edit, mirror, close with `Fixed in <hash>: <summary>`.

## Common failure modes

| Symptom | Phase | Cause / fix |
|---|---|---|
| Dashboard built from stale .md, doesn't match deployed state | 1 | Source-mode was *docs-only* when the project moved on. Re-do as *combine* — verify live sources for load-bearing numbers. |
| Agent invented a page structure the user didn't want | 1 | Source-mode never asked. Always run 1a before proposing pages. |
| Pages mirror .md 1:1; reader still confused | 2 | Reorganize by reader question, not source artifact |
| Spec page wrong | 1, 3 | Verify against `train_args.txt` / live config — don't trust .md defaults |
| Comment shows only after refresh | 4 | Optimistic update (pattern 7) |
| Highlight lands on wrong duplicate | 4 | TextQuoteSelector context anchor (pattern 3) |
| Section header doesn't highlight | 4 | Case-insensitive + uppercase-container heuristic (pattern 6) |
| Selection across `<code>` fails | 4 | Multi-text-node walker (pattern 4) |
| Sign-in button missing | 4 | Static `<button>` in HTML (pattern 1) |
| Live page didn't update | 5 | Forgot to mirror to `gh-pages` |
| Closed comments cluttering | 4 | Query `state=open` |
| `/fix-feedback` matches nothing despite many dashboard comments | 4, 6 | Modal didn't ship pattern 10 (`claude-fix` opt-in checkbox), so issues are `comment`-only and never satisfy the `comment AND claude-fix` filter. Add the checkbox; tell collaborators to tick it for actionable comments. |

## Anti-patterns

- ❌ Auto-generating HTML from .md. Curation matters.
- ❌ Mirroring source-doc structure into pages. Group by reader question.
- ❌ Hero blocks, gradients, decorative emoji for insider audiences. Info density.
- ❌ Shipping a backend / Worker just for comments. PAT-in-localStorage is sufficient.
- ❌ Templating the page set. Every project gets a different page count and structure.

## Reference implementation

A working implementation lives at `yanghangAI/imagehide` (`index.html`, `docs/html/{spec,design,plan,ops}.html`, `assets/feedback.{css,js}`). When adapting to a new project, read those files as a reference, **don't copy them verbatim** — the page structure and content must come from Phase 1–2 analysis of the new project.

## See also

- `html-effectiveness` (required) — the 9 spatial patterns
- `fix-feedback` — the runtime half of Phase 6; processes the `comment AND claude-fix` issue queue
- W3C Web Annotation Data Model: https://www.w3.org/TR/annotation-model/#text-quote-selector
