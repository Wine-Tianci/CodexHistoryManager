# Codex History Manager Layout Adjustments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the history manager so the header stays fixed, the list and detail panes scroll independently, the detail view only shows user and assistant summaries, and the raw-record view is removed.

**Architecture:** Keep the zero-dependency Node server and static front-end. Tighten the layout with CSS and DOM simplification, and change the backend event summarizer so the detail API only emits concise dialogue summaries.

**Tech Stack:** Node.js, plain HTML, plain CSS, plain JavaScript

---

### Task 1: Restrict summary output to user and assistant

**Files:**
- Modify: `lib/session-store.test.js`
- Modify: `lib/session-store.js`

**Step 1: Write the failing test**

- Add a test assertion that `getSessionDetail()` only returns timeline items labeled `user` or `assistant`.

**Step 2: Run test to verify it fails**

Run: `node .\lib\session-store.test.js`
Expected: FAIL because timeline still includes non-dialogue events.

**Step 3: Write minimal implementation**

- Update the event summarizer to emit only normalized `user` and `assistant` dialogue items.

**Step 4: Run test to verify it passes**

Run: `node .\lib\session-store.test.js`
Expected: PASS

### Task 2: Remove raw detail UI and tighten metadata

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

**Step 1: Write the failing test**

- Use a syntax and behavior sanity check after removing the raw-detail DOM dependencies.

**Step 2: Run test to verify it fails**

Run: `node -e "new Function(require('fs').readFileSync('./public/app.js','utf8'))"`
Expected: FAIL until raw-detail references are removed consistently.

**Step 3: Write minimal implementation**

- Remove the raw tab and raw panel.
- Remove raw counters and load-more logic.
- Update the detail subtitle and metadata rendering to summary-only behavior.

**Step 4: Run test to verify it passes**

Run: `node -e "new Function(require('fs').readFileSync('./public/app.js','utf8'))"`
Expected: PASS

### Task 3: Make the header fixed and panes independently scrollable

**Files:**
- Modify: `public/styles.css`

**Step 1: Write the failing test**

- Validate current layout assumptions by checking the CSS still uses page-height flow instead of fixed-shell pane scrolling.

**Step 2: Run test to verify it fails**

Run: manual browser verification
Expected: Current page scrolls as a whole.

**Step 3: Write minimal implementation**

- Convert the shell to `100vh`.
- Increase default width.
- Let the workspace consume remaining height.
- Give list and detail panes internal scrolling.
- Preserve a fallback mobile layout with natural scrolling.

**Step 4: Run test to verify it passes**

Run: live browser verification with the local server
Expected: Header remains visible while list/detail panes scroll independently.
