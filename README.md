# dashboard-skills

A small bundle for turning a project's accumulated `.md` walls into a navigable HTML dashboard with inline commenting backed by GitHub Issues — packaged as Claude Code skills plus a slash-command template.

## What's in here

```
skills/
  build-html-dashboard/   methodology skill — six-phase process for designing the dashboard
  html-effectiveness/     required dep — 9 spatial patterns each page picks from
templates/
  fix-feedback.md         slash-command template for processing comment-issues
```

### `skills/build-html-dashboard`

Methodology (not a template). Phases:

1. Audience analysis + source-of-truth mode (ASK the user: docs-only / free exploration / combine).
2. Page design from first principles — group by **reader question**, not source artifact.
3. HTML implementation (no build step, dual-theme, info-dense).
4. Inline comment system (10 load-bearing patterns, each curing a specific failure mode).
5. Deploy via `gh-pages` worktree with `.md` link rewriting.
6. Maintenance loop using `/fix-feedback` (see template below).

### `skills/html-effectiveness`

Catalog of nine spatial patterns (Comparison Board, Annotated Timeline, Knowledge Explorer, Interactive Report, Decision Matrix, Kanban, Slide Deck, Design Tokens, Code Review Board). Each dashboard page picks exactly one. `build-html-dashboard` declares this as a **REQUIRED** background skill.

### `templates/fix-feedback.md`

Slash-command spec that reads `state=open` issues with both `comment` AND `claude-fix` labels, parses the dashboard's issue-body template (`Where:` / `Quote:` / `Note:`), maps each page URL to its source file, applies the minimum edit, commits, mirrors to `gh-pages` if any HTML/assets changed, and closes the issue.

The template ships with `<OWNER>/<REPO>` and `<PAGES_BASE_URL>` placeholders. Copy it to `.claude/commands/fix-feedback.md` in your project and substitute.

## Install

### Claude Code skills

Drop the skill directories into your skills path:

```bash
git clone https://github.com/yanghangAI/dashboard-skills
cp -r dashboard-skills/skills/build-html-dashboard ~/.claude/skills/
cp -r dashboard-skills/skills/html-effectiveness   ~/.claude/skills/
```

Skills are auto-discovered by Claude Code at session start.

### `/fix-feedback` slash command

```bash
mkdir -p <your-project>/.claude/commands
cp dashboard-skills/templates/fix-feedback.md <your-project>/.claude/commands/fix-feedback.md
# then edit the file: replace <OWNER>/<REPO> and <PAGES_BASE_URL>, and adjust the URL→file mapping in Step 2
```

GitHub labels the maintenance loop expects:

```bash
gh label create comment    -R <OWNER>/<REPO> --color 5319e7
gh label create claude-fix -R <OWNER>/<REPO> --color 0e8a16
```

## Using it on a new project

In Claude Code, ask:

> Build an HTML dashboard for this project.

The `build-html-dashboard` skill activates and walks you through Phase 1 (source-of-truth mode, reader questions, staleness map). Don't skip — the skill explicitly warns against templating the page set, mirroring `.md` 1:1, or auto-generating HTML.

## Reference implementation

A working dashboard built with this methodology lives at [`yanghangAI/imagehide`](https://github.com/yanghangAI/imagehide) — `index.html`, `docs/html/{spec,design,plan,ops}.html`, `assets/feedback.{css,js}`. Read it for shape, but the skill is explicit: **don't copy verbatim**, derive your page structure from Phase 1–2 of your own project.

## See also

- W3C Web Annotation Data Model — TextQuoteSelector: <https://www.w3.org/TR/annotation-model/#text-quote-selector>
