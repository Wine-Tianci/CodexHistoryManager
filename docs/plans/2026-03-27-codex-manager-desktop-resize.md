# CodexManager Desktop Resize Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the desktop CodexManager layout so the session summary pane wraps content instead of showing horizontal overflow and the summary/detail split can be resized by dragging a divider.

**Architecture:** Keep the existing static HTML app, but route split sizing through a small pure helper in `public/app-model.js` so resize math is testable in Node. Use CSS Grid for desktop layout, a dedicated divider element in the DOM, and pointer events in `public/app.js` to set a temporary CSS custom property for the active split width.

**Tech Stack:** Static HTML, browser JavaScript, CSS Grid, Node `assert` tests

---

### Task 1: Add testable split-sizing helpers

**Files:**
- Modify: `public/app-model.js`
- Test: `public/app-model.test.js`

**Step 1: Write the failing test**

Add a helper-level test for clamping pane widths:

```js
run("clampWorkspaceSplit keeps both panes above minimum width", () => {
  const result = clampWorkspaceSplit({
    nextLeftWidth: 220,
    workspaceWidth: 1000,
    dividerWidth: 14,
    minPaneWidth: 320,
  });

  assert.equal(result.leftWidth, 320);
  assert.equal(result.rightWidth, 666);
});
```

**Step 2: Run test to verify it fails**

Run: `node .\public\app-model.test.js`
Expected: FAIL because `clampWorkspaceSplit` does not exist yet.

**Step 3: Write minimal implementation**

Add and export a pure helper that:

- accepts requested left width, workspace width, divider width, and min pane width,
- clamps the left width so both panes remain above the minimum,
- returns `{ leftWidth, rightWidth }`.

**Step 4: Run test to verify it passes**

Run: `node .\public\app-model.test.js`
Expected: PASS for the new helper and all existing front-end helper tests.

### Task 2: Add the desktop resize handle markup and behavior

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

**Step 1: Write the failing test**

Do a manual red check in the browser:

Run: `node .\server.js`
Expected: The desktop page still has no draggable divider between the two panels.

**Step 2: Run check to verify it fails**

Open the desktop page and confirm:

- there is no dedicated divider element,
- the split ratio cannot be changed by dragging.

**Step 3: Write minimal implementation**

- Insert a divider element between `.sessions-panel` and `.detail-panel`.
- Cache the divider and workspace elements in `collectElements()`.
- Bind pointer handlers that:
  - ignore non-desktop layouts,
  - compute the next left pane width from the pointer position,
  - call the clamp helper,
  - set a CSS custom property on the workspace,
  - clean up drag state on pointer end.

**Step 4: Run check to verify it passes**

Run: `node .\server.js`
Expected: On desktop widths, dragging the divider changes the split ratio; on stacked/mobile widths, there is no resize interaction.

### Task 3: Remove session-pane horizontal overflow

**Files:**
- Modify: `public/styles.css`

**Step 1: Write the failing test**

Use a manual red check against the current desktop page with long session IDs or titles.

**Step 2: Run check to verify it fails**

Confirm the `会话概要` pane can show a horizontal scrollbar when content is wide.

**Step 3: Write minimal implementation**

- Change the workspace grid to include the divider rail.
- Add CSS variables for the default split and the active left pane width.
- Give the table a fixed layout and wrapping behavior.
- Allow table cells and buttons to wrap long content.
- Add divider visual states and drag cursor.
- Preserve the current responsive single-column rules under the mobile breakpoint.

**Step 4: Run check to verify it passes**

Run: `node .\server.js`
Expected: The summary pane wraps long content onto additional lines and no longer shows the unwanted horizontal scrollbar during normal desktop use.

### Task 4: Verify the end-to-end result

**Files:**
- Modify: `public/app-model.js`
- Modify: `public/app-model.test.js`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Step 1: Run automated verification**

Run: `node .\public\app-model.test.js`
Expected: PASS

**Step 2: Run manual verification**

Run: `node .\server.js`
Expected:

- desktop divider drag works,
- refresh restores the default ratio,
- mobile layout stays stacked,
- session summary content wraps instead of causing horizontal overflow.
