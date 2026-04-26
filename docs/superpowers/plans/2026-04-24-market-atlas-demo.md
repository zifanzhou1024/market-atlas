# Market Atlas Demo Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Investor Dashboard demo that loads live/public Shiller CAPE data and presents Shiller PE by date with supporting market context.

**Architecture:** Create a small Next.js app with server-side data fetching from Robert Shiller's public Excel workbook. Keep parsing and derived metrics in focused TypeScript modules, expose a JSON API route, and render a client dashboard with date selection and interactive chart state.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, SheetJS `xlsx`, CSS modules/global CSS.

---

## File Structure

- `package.json`: scripts and dependencies.
- `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`: project configuration.
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`: homepage and styling.
- `app/api/shiller/route.ts`: server JSON endpoint for Shiller data.
- `lib/shiller.ts`: fetch and parse workbook data.
- `lib/market-metrics.ts`: date filtering and valuation summary helpers.
- `lib/sample-workbook.ts`: test workbook fixture builder.
- `tests/shiller.test.ts`, `tests/market-metrics.test.ts`: focused parser and metrics tests.

## Chunk 1: Data Layer

- [ ] Write failing tests for workbook parsing and valuation metrics.
- [ ] Run tests and confirm they fail because implementation is missing.
- [ ] Implement `parseShillerWorkbook`, `fetchShillerData`, and metric helpers.
- [ ] Run tests and confirm they pass.

## Chunk 2: App Surface

- [ ] Create the Next.js app shell and API route.
- [ ] Build the Investor Dashboard homepage with server-fetched initial data.
- [ ] Add client-side date selection, range controls, and chart interactions.
- [ ] Add responsive styling and source/error states.

## Chunk 3: Verification

- [ ] Install dependencies only after action-time confirmation.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the dev server.
- [ ] Verify the homepage in the in-app browser on desktop and mobile-sized viewports.
