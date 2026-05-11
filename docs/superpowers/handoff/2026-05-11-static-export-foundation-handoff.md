# Handoff: Static-Export Foundation (Sub-Project 1 of 6)

> **For the next agent:** This document is a self-contained handoff. You can pick up the work without reading conversation history. Start by reading this file end-to-end, then the spec, then the plan.

**Date written:** 2026-05-11
**Status:** Spec approved · Plan approved · Awaiting human review before execution

---

## 1. Why this exists

The user (`f21457777@gmail.com`, repo `zifanzhou1024/market-atlas`) wants to improve their personal market dashboard. They provided extensive analysis identifying ~17 distinct issues across 5 layers (correctness/infra, charts, IA/visual, statistical depth, maintainability).

That analysis was decomposed into **6 sub-projects** in dependency order:

| # | Sub-project | Status |
|---|---|---|
| 1 | **Static-Export Foundation** | Spec + plan complete; awaiting human review before execution |
| 2 | Chart-layer replacement | Not started |
| 3 | IA & home redesign | Not started |
| 4 | Interaction polish (URL state, keyboard, downloads) | Not started |
| 5 | SPX weekday statistical depth | Not started |
| 6 | Maintainability & CI (CSS split, Playwright, Lighthouse) | Not started |

Each sub-project gets its own brainstorm → spec → plan → execute cycle. Do **not** combine sub-projects.

---

## 2. What's done

### Brainstorm
- 9 architectural decisions converged through option-by-option Q&A
- Captured directly in the spec's `## Approved Direction` section
- No separate brainstorm doc — the spec is the durable artifact

### Spec
- **Path:** `docs/superpowers/specs/2026-05-11-static-export-foundation-design.md`
- **Length:** ~640 lines
- **Status:** Approved by spec-document-reviewer after 2 rounds of fixes
- **Commits:** `4879c49` (initial), `ecbede2` (round 1 fixes), `a883303` (round 2 fixes)

### Plan
- **Path:** `docs/superpowers/plans/2026-05-11-static-export-foundation.md`
- **Length:** ~3260 lines
- **Status:** Approved by plan-document-reviewer after 1 round of fixes (Chunk 3 had Task 6/7 swap + grep corrections; Chunks 1/2/4 were approved on first pass with minor advisories applied)
- **Commits:** `35ff28c` (initial), `9b5c52f` (cross-chunk fixes), `e67d65c` (final Chunk 3 grep + reference fixes)

### Branch
- **Branch:** `docs/static-export-foundation` (pushed to origin)
- **PR-creation URL:** https://github.com/zifanzhou1024/market-atlas/pull/new/docs/static-export-foundation
- **Direct push to main is blocked** by a workflow rule. All commits must land via PR.

### Local state at handoff
- Working tree has the in-flight **Forward-PE feature** uncommitted (this is intentional — see §4 Pre-Work):
  - `lib/forward-pe.ts` (new)
  - `tests/forward-pe.test.ts` (new)
  - `app/chart/detailed-chart.tsx` (modified, ~290 LOC added)
  - `app/globals.css` (modified)
  - `README.md` (modified, one bullet added)
  - `next-env.d.ts` (modified, Next 16 dev-path drift; regenerates on `next dev`)
- Local `main` is 6 commits ahead of `origin/main` (same 6 commits as the branch). Will catch up when the PR merges.

---

## 3. What sub-project 1 actually does

Read the spec for the full picture. The 60-second summary:

1. **Unify dev/prod around static JSON.** Delete `app/api/*` routes. Both `npm run dev` and the production GitHub Pages deploy read from `public/data/*.json`.
2. **Track `public/data/` in git.** Currently `.gitignore`'d. CI auto-commits refreshed JSON back to `main` on scheduled runs (`[skip ci]` to avoid re-trigger).
3. **Zod L3 validation** of all generated JSON (schema + sanity bounds: positive numbers, monotonic dates, minimum row counts). Validation failure → preserve prior committed file, mark `stale` in manifest. Whole build only fails if *all* sources fail.
4. **Manifest** at `public/data/manifest.json` capturing per-source status, last-fetch timestamps, source URLs, error messages. Single source of truth for "is the data fresh?"
5. **New `/data` route** rendering the manifest as a status table with downloads.
6. **Remove SQLite cache layer.** `lib/market-data/*` and `lib/spx-weekday-service.ts` are gone; the orchestrator is now `lib/generate-static-data.ts`.
7. **Smoke test** (`scripts/test-static-export.ts`) runs after `next build`, verifies routes/files/manifest schema/no-`/api/`-leak.
8. **CI workflow** updated: `contents: write` permission, new generate/test/smoke/auto-commit steps, retain the dual-cron + Chicago-19:30 guard.

---

## 4. Pre-Work (must run before sub-project 1 starts)

Commit the in-flight Forward-PE feature **on its own commit** before any sub-project (1) work. The feature is complete and tested; it'll get migrated to the new chart library in sub-project (2) like everything else.

```bash
git add lib/forward-pe.ts tests/forward-pe.test.ts \
        app/chart/detailed-chart.tsx app/globals.css \
        next-env.d.ts README.md
git commit -m "Add realized one-year-ahead Forward PE comparison chart"
```

This commit lands **before** the sub-project (1) PR diff so the (1) PR stays clean.

---

## 5. Execution sequence (13 tasks, 4 chunks)

| Chunk | Tasks | Lines | Cumulative outcome |
|---|---|---|---|
| **1: Bootstrap and schemas** | 1, 2, 3 | 831 | `.gitignore` updated, `public/data/` tracked, formatters lifted, Zod schemas in place |
| **2: Generator orchestrator** | 4, 5 | 793 | `lib/generate-static-data.ts` written + tested; first `manifest.json` committed |
| **3: Demolition and rewiring** | 6, 7, 8, 9 | 949 | Consumers rewired, legacy code deleted, nav updated, `/data` route live |
| **4: Verification and shipping** | 10, 11, 12, 13 | 529 | Smoke test, CI workflow, README, final QA |

**Critical ordering inside Chunk 3:**
- **Task 6 is "Collapse data-loading abstractions"** (was Task 7 in the original plan, swapped during review).
- **Task 7 is "Demolish app/api/, lib/market-data/, …"** (was Task 6).
- This order keeps the build green between commits — consumers must be rewired *before* their dependencies are deleted.

Each task uses RED → GREEN → commit TDD pattern (see existing plan style in `docs/superpowers/plans/2026-04-26-spx-weekday-performance.md`).

---

## 6. How to execute

**Recommended:** subagent-driven-development (`superpowers:subagent-driven-development`). 13 tasks × fresh subagent per task with two-stage review keeps each task's context tight. This is the same pattern the existing plans in this repo were built with.

**Alternative:** in-session execution via `superpowers:executing-plans` with checkpoints between chunks.

**Branch policy (important):**
- **Do NOT push directly to `main`** — the repo has a workflow rule that blocks it.
- Use a feature branch (e.g., `feat/static-export-foundation`) and open a PR.
- The current docs branch is `docs/static-export-foundation`. You can either:
  - Add implementation commits to the same branch (so the PR includes spec + plan + implementation), **or**
  - Open a separate branch for implementation (cleaner separation).
- **Recommended:** separate branches — keeps the docs PR mergeable on its own and the implementation PR atomic.

**Pre-flight checklist:**
- [ ] Read the spec (`docs/superpowers/specs/2026-05-11-static-export-foundation-design.md`) end-to-end
- [ ] Read the plan (`docs/superpowers/plans/2026-05-11-static-export-foundation.md`) end-to-end
- [ ] Confirm the user has reviewed both and approved execution
- [ ] Confirm the target branch (new branch from `main`)
- [ ] Run the Pre-Work commit on `main` first, push, then branch off

---

## 7. Constraints to maintain

These came up during brainstorming and the user explicitly chose them. Don't drift.

| Constraint | Source |
|---|---|
| GitHub Pages is the only deploy target. No runtime API, no database, no live fetch from the deployed site. | Spec §"Goal" and §"Runtime (Browser)" |
| Direct push to `main` is blocked. Everything goes through PR. | Discovered during push; honored by docs branch |
| Auto-commit on scheduled CI runs uses `[skip ci]` to prevent re-trigger. | Spec §"CI Workflow" |
| Validation tier is **L3** (schema + sanity bounds). L4 freshness gates are explicitly deferred. | Spec §"Validation (L3, Zod)" |
| `app/api/*` is gone. All page-level error states link to `/data`, never `/api/*`. | Spec §"Components And Module Boundaries", §"Error Handling" |
| `public/data/` is **git-tracked** under the new model. The first task of the PR removes the `.gitignore` line and `git add`s the existing JSON files. | Spec §"Bootstrap" |
| Forward-PE commits **separately, before sub-project (1)**. Don't mix into the (1) PR. | Plan §"Pre-Work" |
| Task order inside Chunk 3 is Task 6 (collapse) → Task 7 (demolish). Do NOT swap. | Plan reviewer fixed this during review |
| Auto mode is active in the user's session. Reasonable assumptions on low-risk work; explicit confirmation for destructive or high-blast-radius actions. | User session config |

---

## 8. Open decisions for the next session

When the user says "ready to execute," confirm:

1. **Execute now or later?** — they may want more spec review time.
2. **Same branch or new branch?** — `docs/static-export-foundation` (carries docs forward) vs new `feat/static-export-foundation` (cleaner separation). Spec/plan are already on the docs branch; implementation on a new branch lets the docs PR merge first.
3. **Subagent-driven or in-session?** — recommend subagent-driven for 13 tasks.

After sub-project (1) merges, the user will likely want to start sub-project (2) — chart-layer replacement. That's a fresh brainstorm → spec → plan cycle. Don't preemptively start it.

---

## 9. Useful references

**Git:**
- Current docs branch: `docs/static-export-foundation` (pushed)
- Spec + plan commits: `4879c49`, `ecbede2`, `a883303`, `35ff28c`, `9b5c52f`, `e67d65c`
- PR creation: https://github.com/zifanzhou1024/market-atlas/pull/new/docs/static-export-foundation

**Files:**
- Spec: `docs/superpowers/specs/2026-05-11-static-export-foundation-design.md`
- Plan: `docs/superpowers/plans/2026-05-11-static-export-foundation.md`
- This handoff: `docs/superpowers/handoff/2026-05-11-static-export-foundation-handoff.md`
- Reference plan style: `docs/superpowers/plans/2026-04-26-spx-weekday-performance.md`

**Codebase entry points to read first:**
- `lib/pages-data.ts` (current dev/prod switch — going away)
- `scripts/build-pages.mjs` (current rename hack — going away)
- `scripts/generate-pages-data.mjs` (current generation script — becomes thin entry)
- `lib/spx-weekday-service.ts` (SQLite orchestrator — going away entirely)
- `app/api/*/route.ts` (going away)
- `.github/workflows/deploy-pages.yml` (current workflow — extended)
- `.gitignore` (line 5 `public/data/` — must be removed)

**Reviewer prompts** (used during brainstorm and writing-plans):
- `~/.claude/skills/brainstorming/spec-document-reviewer-prompt.md`
- `~/.claude/skills/writing-plans/plan-document-reviewer-prompt.md`

---

## 10. Sanity checks before execution

If you (the next agent) are about to execute, run these first:

```bash
# Confirm spec and plan are present
ls -la docs/superpowers/specs/2026-05-11-static-export-foundation-design.md
ls -la docs/superpowers/plans/2026-05-11-static-export-foundation.md

# Confirm the in-flight Forward-PE feature is still uncommitted
git status --short

# Confirm the current branch isn't main (we never push to main)
git branch --show-current

# Confirm the schemas-friendly committed data exists (sub-project 1's fallback)
ls public/data/shiller.json public/data/buffett.json
ls public/data/spx-weekdays/ | wc -l   # expect 18

# Confirm the current generation script works
npm run generate:pages-data
```

If any of those fail unexpectedly, **stop and re-read this handoff** — the world has diverged from what's documented here.
