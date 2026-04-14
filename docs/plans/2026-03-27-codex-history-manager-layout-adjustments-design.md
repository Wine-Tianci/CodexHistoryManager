# Codex History Manager Layout Adjustments Design

**Date:** 2026-03-27

**Goal:** Tighten the history manager layout and simplify the detail view so the page header stays fixed, each pane scrolls independently, and the detail panel only shows concise user and assistant summaries.

## Confirmed Changes

1. Stop scrolling the whole page. Keep the top area fixed and let the session list and detail panel scroll independently.
2. Reduce the detail summary to entries currently classified as `user` and `assistant`.
3. Increase the default page width usage.
4. Remove the raw-record view entirely.

## Recommended Approach

Use a focused front-end and parser adjustment rather than a broader redesign.

- Keep the current split-pane structure.
- Convert the app shell to a `100vh` layout with a fixed top section and a scrollable workspace.
- Make each card use internal scrolling so the table and detail stream move independently.
- Simplify the detail panel to a single summary stream.
- Filter summary items in the backend so the API only returns user and assistant dialogue items.

## Layout Changes

- Set the shell to use nearly full-width desktop layout.
- Make `body` non-scrolling on desktop and let `.sessions-panel` and `.detail-panel` own scrolling.
- Keep the hero and toolbar visible while the user scrolls inside either pane.
- Preserve the mobile stacked layout, but allow natural page scrolling there.

## Detail Changes

- Remove the summary/raw tabs.
- Remove raw-event count, raw-event payload rendering, and load-more behavior.
- Keep a compact metadata section with `Session ID`, `Source`, `Title`, `Updated`, and `CWD`.
- Show only dialogue summary cards labeled `user` and `assistant`.

## Backend Changes

- Keep full event parsing in place for session resolution and metadata extraction.
- Restrict `timeline` output to normalized user and assistant items only.
- Keep `rawEvents` in the API response temporarily only if needed by existing code paths; the UI will no longer render it. Prefer removing it if the front-end no longer depends on it.

## Verification

- Update parser tests to verify non-dialogue events are excluded from the timeline.
- Run existing session-store tests.
- Run front-end model tests.
- Run a live server check against `/` and `/api/sessions/:id` to confirm the summary-only detail contract.
