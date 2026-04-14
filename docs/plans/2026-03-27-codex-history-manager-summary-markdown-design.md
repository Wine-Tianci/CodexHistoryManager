# Codex History Manager Summary Markdown Design

**Date:** 2026-03-27

**Goal:** Render each dialogue summary card as Markdown and let the user copy the original Markdown source for that specific card.

## Confirmed Changes

1. Keep the current summary-per-card detail layout.
2. Render each summary card body with Markdown instead of plain escaped text.
3. Add a per-card action to copy the card's original Markdown source.
4. Use a third-party Markdown renderer that ships with the app so the page still works offline.

## Recommended Approach

Use a vendored browser Markdown library plus a thin local adapter layer.

- Add a small browser-ready Markdown renderer under `public/vendor/`.
- Move summary-card HTML generation into shared pure helpers so the rendering contract can be tested in Node.
- Keep clipboard behavior in `public/app.js`, where DOM and browser APIs already live.
- Sanitize rendered link and image URLs after Markdown conversion so unsafe protocols are not emitted into the DOM.

## UI Changes

- Keep the existing detail metadata section unchanged.
- Keep each summary item header with role and timestamp.
- Add a `复制 Markdown` button to each summary item header.
- Replace the plain text body block with a Markdown-rendered content block.

## Testing Strategy

- Extend `public/app-model.test.js` with helper-level tests for Markdown rendering and per-card action markup.
- Verify the browser script still parses after the event binding changes.
- Run the existing backend tests to ensure the unrelated parser behavior still remains intact.
