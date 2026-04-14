# Codex History Manager Summary Markdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the detail summary cards so they render Markdown content and expose a per-card button that copies the original Markdown source.

**Architecture:** Keep the current static HTML app and vendor a small browser Markdown library under `public/vendor/`. Add pure rendering helpers in `public/app-model.js` for testable card markup generation, then wire button events and clipboard handling in `public/app.js`.

**Tech Stack:** Node.js, plain HTML, plain CSS, plain JavaScript, vendored `snarkdown`

---

### Task 1: Add failing tests for Markdown card rendering

**Files:**
- Modify: `public/app-model.test.js`
- Modify: `public/app-model.js`

**Step 1: Write the failing test**

- Add a test that expects Markdown emphasis and headings to render as HTML.
- Add a test that expects unsafe `javascript:` links to be stripped.
- Add a test that expects each timeline item HTML block to include a copy button with the raw Markdown payload stored in a data attribute.

**Step 2: Run test to verify it fails**

Run: `node .\public\app-model.test.js`
Expected: FAIL because the helper exports do not exist yet.

**Step 3: Write minimal implementation**

- Add Markdown rendering helpers to `public/app-model.js`.
- Load the vendored renderer in Node tests and in the browser.
- Build summary item markup through the helper so the same contract is reused by the app.

**Step 4: Run test to verify it passes**

Run: `node .\public\app-model.test.js`
Expected: PASS

### Task 2: Wire copy behavior into the browser app

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Step 1: Write the failing test**

- Use a script parse check after adding the new event handlers and DOM references.

**Step 2: Run test to verify it fails**

Run: `node -e "new Function(require('fs').readFileSync('./public/app.js','utf8'))"`
Expected: FAIL until the new DOM and helper references are consistent.

**Step 3: Write minimal implementation**

- Load the vendored Markdown script before `app.js`.
- Render each summary card via the shared helper.
- Add delegated click handling for `复制 Markdown`.
- Copy the raw Markdown text with `navigator.clipboard.writeText()` and show lightweight button feedback.

**Step 4: Run test to verify it passes**

Run: `node -e "new Function(require('fs').readFileSync('./public/app.js','utf8'))"`
Expected: PASS

### Task 3: Polish Markdown card styling and verify behavior

**Files:**
- Modify: `public/styles.css`

**Step 1: Write the failing test**

- Use manual browser verification to confirm the current summary cards do not render Markdown semantics and have no copy action.

**Step 2: Run test to verify it fails**

Run: manual browser verification
Expected: Plain text summary blocks with no Markdown rendering and no copy button.

**Step 3: Write minimal implementation**

- Add styles for the card action row and Markdown content blocks.
- Keep code blocks and long lines wrapping inside the detail pane.

**Step 4: Run test to verify it passes**

Run: `node .\public\app-model.test.js`, `node .\lib\session-store.test.js`, and a live browser check with `node .\server.js`
Expected: Tests pass and summary cards render Markdown with working copy actions.
