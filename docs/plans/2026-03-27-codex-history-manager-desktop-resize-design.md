# Codex History Manager Desktop Resize Design

**Date:** 2026-03-27

**Goal:** Remove horizontal overflow from the session summary pane and let desktop users drag the divider between `会话概要` and `对话摘要`, while keeping the current default proportion and preserving the mobile stacked layout.

## Confirmed Changes

1. The session summary pane must not show a horizontal scrollbar just because table content is long.
2. When content does not fit, the summary table should wrap to additional lines instead of widening the pane.
3. The default split ratio should stay visually aligned with the current layout.
4. Desktop users can drag the divider left and right to change the pane ratio during the current page session only.
5. Mobile and narrow layouts remain stacked and non-resizable.

## Recommended Approach

Keep the current two-panel layout and add a narrow resize handle between the panels.

- Continue using the existing desktop `grid` workspace.
- Replace the fixed two-column grid with a grid that includes a center resize rail.
- Drive the left pane width through a CSS custom property set by client-side pointer events.
- Leave the initial CSS variable unset so the current desktop ratio remains the default.
- Reset to the current stacked mobile layout inside the existing responsive breakpoint and hide the resize rail there.

## Session Summary Changes

- Constrain the table to the available pane width rather than letting long values push the panel wider.
- Use a fixed table layout on desktop so the browser distributes width across columns inside the pane.
- Allow long `sessionId`, timestamps, and titles to wrap with `overflow-wrap: anywhere`.
- Keep vertical scrolling on the list pane and avoid introducing a horizontal scrollbar in normal desktop use.

## Split Resize Changes

- Insert a dedicated divider element between the left and right panels in `public/index.html`.
- Add pointer-driven resize behavior in `public/app.js`.
- Apply minimum widths to both panes so neither side can be dragged into an unusable state.
- Add resize cursor, hover/drag states, and temporary user-select suppression while dragging.
- Do not persist the customized width; a page refresh returns to the default ratio.

## Testing Strategy

- Add pure helper tests for pane-width clamping so the drag math is covered without needing a browser test harness.
- Run the front-end helper tests after adding the new resize helper.
- Run the browser-facing script test command already used in this repo.
- Manually verify:
  - desktop dragging updates both pane widths,
  - refresh restores the default ratio,
  - narrow/mobile layout stays stacked without a divider,
  - the session summary pane no longer shows the unwanted horizontal scrollbar.
