# Claude Code Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Claude Code profile configuration and history management while keeping Codex configuration and history separate.

**Architecture:** Add Claude-specific backend stores for `~/.claude` settings and project transcripts, then expose separate `/api/claude/*` routes. Add separate static pages for Claude history and profile management so existing Codex pages remain stable.

**Tech Stack:** Node.js built-in test runner, zero-dependency Node HTTP server, static HTML/CSS/JS frontend.

---

### Task 1: Claude Profile Store Tests

**Files:**
- Create: `lib/claude-profile-store.test.js`
- Create later: `lib/claude-profile-store.js`

**Step 1: Write failing tests**

Add tests for:

- `listProfiles` returns profiles, current config, and active profile.
- `createProfile` and `updateProfile` persist `name`, `model`, and `env`.
- `activateProfile` writes `settings.json` model/env and preserves unrelated fields.
- `readCurrentConfig` returns empty values when `settings.json` is missing.
- `activateProfile` rejects malformed `settings.json`.

Use a temp `claudeRoot` and this settings fixture:

```js
await fs.writeFile(
  path.join(claudeRoot, "settings.json"),
  JSON.stringify({
    theme: "dark",
    permissions: { allow: ["Bash(git status)"] },
    env: { AWS_REGION: "us-east-1" },
    model: "sonnet",
  }),
  "utf8",
);
```

Expected activation assertion:

```js
assert.equal(settings.model, "haiku");
assert.equal(settings.env.ANTHROPIC_MODEL, "claude-haiku-4-5-20251001");
assert.equal(settings.env.AWS_REGION, "us-east-1");
assert.deepEqual(settings.permissions, { allow: ["Bash(git status)"] });
```

**Step 2: Verify RED**

Run: `node --test lib/claude-profile-store.test.js`

Expected: FAIL because `./claude-profile-store.js` does not exist.

---

### Task 2: Claude Profile Store Implementation

**Files:**
- Create: `lib/claude-profile-store.js`
- Test: `lib/claude-profile-store.test.js`

**Step 1: Implement minimal store**

Create `ClaudeProfileStore` with:

- Constructor options: `{ claudeRoot, profileStoreFileName }`
- Defaults: `claudeRoot = path.join(os.homedir(), ".claude")`
- Profile file: `codex-manager.profiles.json`
- Methods: `listProfiles`, `getProfile`, `createProfile`, `updateProfile`, `deleteProfile`, `activateProfile`, `readCurrentConfig`

Use normalized profile shape:

```js
{
  id: "profile_<uuid>",
  name: "Work Claude",
  model: "haiku",
  env: {
    ANTHROPIC_MODEL: "claude-haiku-4-5-20251001"
  }
}
```

Activation algorithm:

1. Read `settings.json`, or use `{}` if missing.
2. Fail if the file exists but is not valid JSON object.
3. If profile has `model`, set `settings.model`.
4. Merge `profile.env` into `settings.env`.
5. Write `settings.json` atomically.
6. Record `lastActivatedProfileId`.

**Step 2: Verify GREEN**

Run: `node --test lib/claude-profile-store.test.js`

Expected: PASS.

---

### Task 3: Claude Session Store Tests

**Files:**
- Create: `lib/claude-session-store.test.js`
- Create later: `lib/claude-session-store.js`

**Step 1: Write failing tests**

Build temp Claude root:

```text
<root>/history.jsonl
<root>/projects/F--workspace-Hydra/<session-id>.jsonl
```

Transcript fixture lines:

```json
{"type":"permission-mode","permissionMode":"default","sessionId":"11111111-1111-4111-8111-111111111111"}
{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-05-13T07:56:12.805Z","cwd":"F:\\workspace_Hydra","sessionId":"11111111-1111-4111-8111-111111111111"}
{"type":"assistant","message":{"role":"assistant","model":"claude-haiku-4-5-20251001","content":[{"type":"text","text":"hi"}]},"timestamp":"2026-05-13T07:56:16.731Z","sessionId":"11111111-1111-4111-8111-111111111111"}
```

Assert:

- `listSessions` returns one summary with `sessionId`, `projectKey`, `project`, `title`, `updatedAt`, `messageCount`, and `model`.
- `getSessionDetail` returns `meta`, `timeline`, `rawEvents`, `totalEvents`, and `warnings`.
- Invalid JSONL lines add warnings and do not fail the whole session.
- Missing root returns an empty list.

**Step 2: Verify RED**

Run: `node --test lib/claude-session-store.test.js`

Expected: FAIL because `./claude-session-store.js` does not exist.

---

### Task 4: Claude Session Store Implementation

**Files:**
- Create: `lib/claude-session-store.js`
- Test: `lib/claude-session-store.test.js`

**Step 1: Implement discovery and detail reading**

Create `ClaudeSessionStore` with:

- Constructor option: `{ claudeRoot }`
- Paths: `history.jsonl`, `projects`
- Methods: `listSessions`, `getSessionDetail`, `deleteSessions`

Session discovery:

- Walk `projects` recursively.
- Treat top-level `.jsonl` files under a project directory as primary transcript files.
- Ignore files under `subagents` for the first version.
- Extract session ID from filename or `sessionId` field.
- Use `history.jsonl` entries keyed by `sessionId` for title hints.

Timeline normalization:

- `type: "user"` -> label `user`
- `type: "assistant"` -> label `assistant`
- `type: "attachment"` -> label from `attachment.type`
- `type: "permission-mode"` -> label `permission`
- Unknown objects -> omit from timeline but keep in `rawEvents`

**Step 2: Verify GREEN**

Run: `node --test lib/claude-session-store.test.js`

Expected: PASS.

---

### Task 5: Claude API Routes

**Files:**
- Modify: `lib/request-handler.js`
- Modify: `lib/request-handler.test.js`

**Step 1: Write failing route tests**

Extend `createFixture` to instantiate `ClaudeProfileStore` and `ClaudeSessionStore`.

Add tests for:

- `GET /api/claude/profiles`
- `POST /api/claude/profiles`
- `PATCH /api/claude/profiles/:id`
- `POST /api/claude/profiles/:id/activate`
- `GET /api/claude/sessions`
- `GET /api/claude/sessions/:id`
- `DELETE /api/claude/sessions`

Expected: routes return 404 or constructor rejects before implementation.

**Step 2: Implement route wiring**

Update `createRequestHandler` signature:

```js
function createRequestHandler({
  sessionStore,
  profileStore,
  claudeSessionStore,
  claudeProfileStore,
  resumeLauncher,
  publicDir,
})
```

Keep `claude*` dependencies optional for backward compatibility. If a `/api/claude/*` route is called without the matching store, return 500 with a clear message.

**Step 3: Verify**

Run: `node --test lib/request-handler.test.js`

Expected: PASS.

---

### Task 6: Server Bootstrap

**Files:**
- Modify: `server.js`

**Step 1: Write failing integration-oriented test if practical**

If `server.js` currently has no startup unit test, keep this as a narrow manual wiring task and verify through route tests in Task 5.

**Step 2: Wire Claude stores**

Instantiate:

```js
const { ClaudeProfileStore } = require("./lib/claude-profile-store.js");
const { ClaudeSessionStore } = require("./lib/claude-session-store.js");
```

Use env override:

```js
const CLAUDE_ROOT = process.env.CLAUDE_ROOT;
const claudeRootOption = CLAUDE_ROOT ? { claudeRoot: CLAUDE_ROOT } : undefined;
```

Pass both stores to `createRequestHandler`.

**Step 3: Verify**

Run: `node --test lib/request-handler.test.js`

Expected: PASS.

---

### Task 7: Frontend Model Helpers

**Files:**
- Modify: `public/app-model.test.js`
- Modify: `public/app-model.js`

**Step 1: Write failing tests**

Add helpers and tests for:

- `buildClaudeProfileMetaEntries(profile)` masks sensitive env values.
- `buildClaudeCurrentConfigMetaEntries(currentConfig)` shows model and env summary.
- `validateClaudeProfileDraft(draft)` requires name and accepts blank optional env values.
- `filterClaudeSessions(sessions, filters)` searches title, session ID, project, and model.

**Step 2: Implement helpers**

Reuse `escapeHtml`, `maskApiKey`, and `sortSessionsByUpdatedAt` where appropriate. Sensitive env keys include names containing `KEY`, `TOKEN`, `SECRET`, or `PASSWORD`.

**Step 3: Verify**

Run: `node public/app-model.test.js`

Expected: PASS.

---

### Task 8: Claude Pages

**Files:**
- Create: `public/claude.html`
- Create: `public/claude.js`
- Create: `public/claude-profiles.html`
- Create: `public/claude-profiles.js`
- Modify: `public/index.html`
- Modify: `public/profiles.html`
- Modify: `public/styles.css`
- Modify: `lib/request-handler.test.js`

**Step 1: Write failing static route test**

Extend the existing static navigation test to fetch:

- `/claude.html`
- `/claude-profiles.html`

Assert each page loads, includes the shared model script, and links back to Codex pages.

**Step 2: Implement pages**

`claude.html` should mirror the existing session manager flow:

- Fetch `/api/claude/sessions`
- Render list, search, details, raw event view, and delete action
- Fetch `/api/claude/sessions/:id` for detail

`claude-profiles.html` should mirror profile manager flow:

- Fetch `/api/claude/profiles`
- Create/update/delete profiles
- Activate profile
- Render env rows as editable key/value pairs

Keep text concise and avoid showing raw secrets in profile cards or current-config summary.

**Step 3: Verify**

Run:

```powershell
node public/app-model.test.js
node --test lib/request-handler.test.js
```

Expected: PASS.

---

### Task 9: Documentation And Full Verification

**Files:**
- Modify: `README.md`

**Step 1: Document Claude support**

Add:

- Claude pages and endpoints.
- `CLAUDE_ROOT` environment override.
- Managed files under `~/.claude`.
- Note that Codex and Claude configurations are independent.

**Step 2: Run all tests**

Run:

```powershell
node --test lib/profile-store.test.js
node --test lib/session-store.test.js
node --test lib/request-handler.test.js
node --test lib/claude-profile-store.test.js
node --test lib/claude-session-store.test.js
node public/app-model.test.js
node lib/app-config.test.js
node lib/browser-launcher.test.js
node lib/session-resume-launcher.test.js
```

Expected: all PASS.

**Step 3: Manual smoke test**

Run:

```powershell
$env:CLAUDE_ROOT="$env:TEMP\\codex-manager-claude-smoke"
node .\server.js
```

Open:

- `http://localhost:4173/claude.html`
- `http://localhost:4173/claude-profiles.html`

Expected: pages load with empty states and no Codex regression.

