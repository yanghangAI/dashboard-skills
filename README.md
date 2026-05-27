# dashboard-skills

A small bundle of Claude Code skills for standing up a **human control surface over AI agents' work** — a place to see what the agents are doing, what they decided, where they've drifted from plan, and to flag corrections that the agents act on.

Not a doc-site generator. Markdown-to-HTML conversion is one bootstrap path into this loop, not the product.

## The loop

```
agent does work
   │
   ▼
agent writes structured artifacts          (plan.json, events.jsonl, decisions.jsonl, …)
   │
   ▼
dashboard renders artifacts as HTML        (Status, Timeline, Decisions, Drift, Trust)
   │
   ▼
human reads dashboard, flags issues        (FYI / Fix / Block / Override, anchored to text)
   │
   ▼
issues land in GitHub                       (4 severity tiers, label-encoded — see below)
   │
   ▼
fix-feedback edits the artifacts            (not the HTML — HTML re-renders on next load)
   │                                         Fix     → edit artifact + close
   │                                         Block   → edit artifact + wait for human unblock
   │                                         Override→ append override to decisions.jsonl + close
   │                                         FYI     → no action; human closes on read
   │
   ▼
loop
```

The artifacts are the source of truth. The HTML is a view. The comments are the steering wheel.

## What's in here

```
skills/
  build-html-dashboard/   methodology — 7 phases, from agent discovery to maintenance loop
  html-effectiveness/     required dep — 9 layout primitives the oversight pages are built from
  fix-feedback/           runtime — drains the comment+claude-fix issue queue, edits artifacts
templates/
  fix-feedback.md         per-project slash-command form (fallback when URL→artifact mapping is unusual)
```

### `skills/build-html-dashboard`

The methodology. Seven phases:

1. **Discover** — auth mode (PAT vs OAuth+Worker), inventory the agents, list the overseer's questions.
2. **Artifact contract** — agree on `events.jsonl` / `plan.json` / `claims.json` / `decisions.jsonl` / `risks.json` / `blockers.json` under `docs/agent-state/<agent_id>/` (with `agent_id` on every record).
3. **Page design** — five required oversight pages (Live Status, Activity Timeline, Decision Audit, Drift, Trust Calibration), plus project-specific optionals.
4. **HTML implementation** — one file per page, no build step, **provenance + freshness rendered in the UI** per fact (stale ages green→grey→red).
5. **Comment overlay** — 15 load-bearing patterns: 1–10 (interaction: TextQuoteSelector anchor, multi-text-node walker, optimistic update, …) + 11–15 (render lifecycle + visibility: `dashboard:rendered` event, position-preserving fallback, **subtle** severity-tinted highlight, **click-to-reveal popover**, click capture + unanchored toggle) + **4-tier severity radio** (FYI / Fix / Block / Override). The dashboard surface stays calm; comments are revealed only when the human clicks a highlight.
6. **Deploy** — `gh-pages` worktree mirrors HTML + `assets/` + `docs/agent-state/`.
7. **Maintenance** — install `fix-feedback`; it consumes Fix/Block issues and edits artifacts.

The dashboard's page structure, content, and tone are derived from the project. The five required pages are non-negotiable; everything else is project-specific.

### `skills/html-effectiveness`

Catalog of nine spatial primitives (Comparison Board, Annotated Timeline, Knowledge Explorer, Interactive Report, Decision Matrix, Kanban, Slide Deck, Design Tokens, Code Review Board). The oversight pages in `build-html-dashboard` Phase 3 are built FROM these primitives.

### `skills/fix-feedback`

Runtime half of Phase 7. Reads `state=open` `comment`-labeled issues from the dashboard's overlay, classifies by label set into Fix / Block / Override / FYI, and acts per tier: Fix → edit artifact + close; Block → edit + leave open with resolution comment; Override → append override record to `decisions.jsonl` + close; FYI → skip. Mirrors to `gh-pages` after artifact edits.

Auto-derives `<OWNER>/<REPO>` from `git remote get-url origin`. Asks only when detection fails.

### `templates/fix-feedback.md` (fallback)

Per-project slash-command form, with placeholders for `<OWNER>/<REPO>`, `<PAGES_BASE_URL>`, and the URL→artifact mapping. Use this when the project's URL→artifact mapping isn't a clean strip-prefix (multi-site repos, custom domains, agents writing to non-obvious paths).

## What this costs to adopt

v2 is opinionated and operational, not a doc-site quick-fix. Adoption requires:

- **Artifact discipline.** Every claim on every page traces to a structured artifact under `docs/agent-state/<agent_id>/`. The agent must write these as a side-effect of its work, not as a separate documentation task. If no agent will write them, the dashboard goes stale on day 2.
- **5 required oversight pages** (Live Status, Activity Timeline, Decision Audit, Drift, Trust Calibration) — each ~150–300 lines of hand-authored HTML.
- **Comment overlay** with the 15 load-bearing patterns from `build-html-dashboard` Phase 5 (~400 lines of vanilla JS). Patterns 1–10 cover comment interaction; 11–15 cover render lifecycle + visibility. Public-passthrough mode skips patterns 2 and 7; PAT and OAuth+Worker need all 15.
- **One-time setup:** 4 GitHub labels (`comment`, `claude-fix`, `block`, `override`), Pages enablement, and an artifact-schema decision per agent. ~10 minutes if the agent's outputs are already structured; ~2 hours if you have to retrofit a schema onto unstructured `.md` walls.

**Ongoing cost:** the agent writes artifacts as it works. `fix-feedback` consumes comments and edits artifacts. If those two flows hold, the dashboard stays fresh by itself.

**Smaller slices that still pay.** Don't need the full loop on day 1?
- Just the artifact schema + a single Live Status page → human-readable agent state, no overlay, no fix-feedback. Good first step.
- Schema + pages + overlay, no `fix-feedback` skill → humans file issues, humans fix them. Eliminates the agent-edit step.
- Full v2 → comments become artifact edits become re-renders, closed by the agent.

**Don't use v2 for:** single-document docs (just edit the markdown), marketing pages (use `frontend-design`), or projects without any agent doing autonomous work (no artifacts → nothing for the dashboard to render).

## Install

### Claude Code skills

```bash
git clone https://github.com/yanghangAI/dashboard-skills
cp -r dashboard-skills/skills/build-html-dashboard ~/.claude/skills/
cp -r dashboard-skills/skills/html-effectiveness   ~/.claude/skills/
cp -r dashboard-skills/skills/fix-feedback         ~/.claude/skills/
```

Skills are auto-discovered by Claude Code at session start.

### GitHub labels (one-time, per repo)

```bash
gh label create comment    -R <OWNER>/<REPO> --color 5319e7
gh label create claude-fix -R <OWNER>/<REPO> --color 0e8a16
gh label create block      -R <OWNER>/<REPO> --color b60205
gh label create override   -R <OWNER>/<REPO> --color fbca04
```

### Fallback: per-project slash command

Only needed if the `fix-feedback` skill's auto-detection doesn't fit your project (multi-site, custom URL→artifact mapping).

```bash
mkdir -p <your-project>/.claude/commands
cp dashboard-skills/templates/fix-feedback.md <your-project>/.claude/commands/fix-feedback.md
# edit: replace <OWNER>/<REPO> and <PAGES_BASE_URL>, fill in the URL→artifact mapping
```

## Using it on a new project

In Claude Code, ask:

> Build an oversight dashboard for this project.

The `build-html-dashboard` skill activates and walks you through Phase 1 (auth mode, agent inventory, overseer questions). Don't skip the artifact-contract phase (Phase 2) — it's what makes the loop work.

**Bootstrapping from existing `.md` walls.** If the project already has `HANDOFF.md` / `PLAN.md` / `MODEL_CARD.md` walls, do a one-shot ingest: parse them into the artifact schema once, then archive (`docs/legacy/`) or delete. Two surfaces drifting apart is the failure mode the artifact contract prevents.

## Reference implementations

- **v2 (this repo, dogfood):** [https://yanghangai.github.io/dashboard-skills/](https://yanghangai.github.io/dashboard-skills/) — `docs/index.html` (Live Status) + `docs/{timeline,decisions,drift,trust}.html` + `docs/agent-state/claude/` artifacts + `docs/assets/{shared,feedback}.{css,js}`. Shows the v2 methodology applied to this project itself; the agent is this Claude session, artifacts are the session's plan / events / decisions / claims / risks / blockers. **Public-passthrough auth mode** (the third auth mode in `build-html-dashboard` Phase 1a). Pages serves from `main /docs` — no separate `gh-pages` branch.
- **v1 (pre-reframing):** [`yanghangAI/imagehide`](https://github.com/yanghangAI/imagehide) — `index.html`, `docs/html/{spec,design,plan,ops}.html`, `assets/feedback.{css,js}`. Read for the comment-overlay shape and `gh-pages` worktree deploy. **Don't copy verbatim** — its page structure is the v1 reader-question design, not the v2 oversight-page set.

## See also

- W3C Web Annotation Data Model — TextQuoteSelector: <https://www.w3.org/TR/annotation-model/#text-quote-selector>
