# Session Resume Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a button beside the selected session's `Session ID` that opens a Windows terminal and runs `codex resume <SESSION_ID>`.

**Architecture:** The right-side detail metadata renderer in `public/app.js` will output a composite `Session ID` value with both the session id text and a button. A new backend route in `lib/request-handler.js` will accept `POST /api/sessions/:id/resume` and delegate process launching to a small utility so the HTTP layer stays thin and testable.

**Tech Stack:** Vanilla browser JavaScript, Node.js HTTP server, `node:test`, Windows process spawning.

---

### Task 1: Add a failing frontend test for the detail metadata action

**Files:**
- Modify: `public/app-model.js`
- Test: `public/app-model.test.js`

**Step 1: Write the failing test**

Add a test for a new helper that builds the `Session ID` metadata row with the session id and a `data-resume-session-id` button.

**Step 2: Run test to verify it fails**

Run: `node .\public\app-model.test.js`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Add the helper in `public/app-model.js` and export it for browser and test use.

**Step 4: Run test to verify it passes**

Run: `node .\public\app-model.test.js`
Expected: PASS for the new case and existing model tests.

### Task 2: Add a failing backend test for the resume endpoint

**Files:**
- Modify: `lib/request-handler.js`
- Test: `lib/request-handler.test.js`

**Step 1: Write the failing test**

Add a request-handler test for `POST /api/sessions/:id/resume` using an injected launcher stub.

**Step 2: Run test to verify it fails**

Run: `node --test .\lib\request-handler.test.js`
Expected: FAIL with a missing route or missing launcher call.

**Step 3: Write minimal implementation**

Inject a launcher dependency into `createRequestHandler` and add the new route.

**Step 4: Run test to verify it passes**

Run: `node --test .\lib\request-handler.test.js`
Expected: PASS.

### Task 3: Implement the Windows terminal launcher

**Files:**
- Create: `lib/session-resume-launcher.js`
- Modify: `server.js`

**Step 1: Write the failing test**

Reuse the request-handler test from Task 2 so the launcher abstraction remains covered at the route boundary.

**Step 2: Run test to verify it fails**

Run: `node --test .\lib\request-handler.test.js`
Expected: still FAIL until the real launcher is wired in.

**Step 3: Write minimal implementation**

Create a launcher that starts `cmd.exe /c start "" cmd.exe /k "codex resume <SESSION_ID>"` in detached mode and returns immediately. Wire it into `server.js`.

**Step 4: Run test to verify it passes**

Run: `node --test .\lib\request-handler.test.js`
Expected: PASS.

### Task 4: Connect the frontend button to the backend action

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Step 1: Write the failing test**

Use the failing model test from Task 1 as the frontend contract. No DOM harness is needed for this small behavior change.

**Step 2: Run test to verify it fails**

Run: `node .\public\app-model.test.js`
Expected: FAIL until the rendered metadata includes the action markup.

**Step 3: Write minimal implementation**

Update detail metadata rendering to use the helper, bind a click handler for the resume button, and add a compact inline style.

**Step 4: Run test to verify it passes**

Run: `node .\public\app-model.test.js`
Expected: PASS.

### Task 5: Verify the whole change

**Files:**
- Test: `public/app-model.test.js`
- Test: `lib/request-handler.test.js`

**Step 1: Run targeted tests**

Run: `node .\public\app-model.test.js`
Expected: PASS

Run: `node --test .\lib\request-handler.test.js`
Expected: PASS

**Step 2: Sanity-check the UI**

Run the local server and confirm that selecting a session shows the new action beside `Session ID`.
