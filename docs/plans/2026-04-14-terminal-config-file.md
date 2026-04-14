# Terminal Config File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Load the session-resume terminal path from a manual-edit JSON config file in the project root.

**Architecture:** Add a small config loader in `lib/` that reads `codex-history-manager.config.json` from the repository root and returns normalized tool config. `server.js` will read that config during startup and pass `terminalPath` into the session resume launcher, which keeps its current runtime fallback.

**Tech Stack:** Node.js, JSON config file, `node:test`, vanilla project startup scripts.

---

### Task 1: Add a failing config-loader test

**Files:**
- Create: `lib/app-config.test.js`
- Create: `lib/app-config.js`

**Step 1: Write the failing test**

Add tests for:
- reading a valid `terminalPath`
- returning defaults when the file is missing
- rejecting invalid JSON

**Step 2: Run test to verify it fails**

Run: `node --test .\lib\app-config.test.js`
Expected: FAIL because the loader does not exist yet.

**Step 3: Write minimal implementation**

Create `readAppConfig` that reads a JSON file path, normalizes `terminalPath`, and falls back cleanly on missing files.

**Step 4: Run test to verify it passes**

Run: `node --test .\lib\app-config.test.js`
Expected: PASS.

### Task 2: Wire config into server startup

**Files:**
- Modify: `server.js`

**Step 1: Write the failing test**

Use the config-loader unit test as the primary contract; no extra server harness is needed for this small wiring step.

**Step 2: Run test to verify it fails**

Run: `node --test .\lib\app-config.test.js`
Expected: PASS already, then startup wiring is implemented against that contract.

**Step 3: Write minimal implementation**

Load `codex-history-manager.config.json` from the project root and pass `terminalPath` into `createSessionResumeLauncher`.

**Step 4: Run test to verify it still passes**

Run: `node --test .\lib\app-config.test.js`
Expected: PASS.

### Task 3: Add the root config file and document manual editing

**Files:**
- Create: `codex-history-manager.config.json`
- Modify: `README.md`

**Step 1: Write the failing test**

No automated test needed; this task is documentation and checked-in config only.

**Step 2: Write minimal implementation**

Add a sample config file in the project root with `terminalPath`, and document how to edit it manually.

**Step 3: Run verification**

Run: `node --test .\lib\app-config.test.js`
Run: `node --test .\lib\session-resume-launcher.test.js`
Run: `node --test .\lib\request-handler.test.js`
Expected: PASS.
