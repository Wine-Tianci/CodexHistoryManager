# Unified Codex and Claude Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge Codex and Claude management into one history page and one profile page, both in Chinese, while keeping the existing split backend APIs.

**Architecture:** Reuse the existing Codex and Claude stores and routes, then unify the frontend shell so page-level `AI 类型` determines which API family, field set, and actions are active. Update Claude profile storage to use business fields (`baseUrl`, `apiKey`, `defaultModel`) and map those fields into `.claude/settings.json` on activation, including automatic sync of the top-level `model` alias.

**Tech Stack:** Node.js built-in test runner, zero-dependency Node HTTP server, static HTML/CSS/JS frontend.

---

### Task 1: Add Shared UI Model Coverage For Unified AI Context

**Files:**
- Modify: `public/app-model.test.js`
- Modify later: `public/app-model.js`

**Step 1: Write the failing tests**

Add tests for new shared helpers and validation rules:

- `filterUnifiedSessions(sessions, filters)` or equivalent helper handles both Codex and Claude source labels.
- `buildAiTypeOptions()` or equivalent helper returns `Codex` and `Claude`.
- `validateClaudeProfileDraft(draft)` requires `name`, `baseUrl`, `apiKey`, and `defaultModel`.
- Claude-facing labels and meta helpers use the new business fields instead of raw env rows.

Use a Claude draft like:

```js
const draft = {
  name: "",
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
};
```

Expected errors:

```js
{
  name: "名称不能为空。",
  baseUrl: "Base URL 不能为空。",
  apiKey: "API Key 不能为空。",
  defaultModel: "默认模型不能为空。",
}
```

**Step 2: Run the test to verify RED**

Run: `node public/app-model.test.js`

Expected: FAIL because the unified helpers or Claude validation rules do not exist yet.

**Step 3: Write the minimal implementation**

Update `public/app-model.js` to add only the helper functions and validation changes required by the new tests.

**Step 4: Run the test to verify GREEN**

Run: `node public/app-model.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add public/app-model.js public/app-model.test.js
git commit -m "test: add unified ui model coverage"
```

### Task 2: Rewrite Claude Profile Store Tests Around Business Fields

**Files:**
- Modify: `lib/claude-profile-store.test.js`
- Modify later: `lib/claude-profile-store.js`

**Step 1: Write the failing tests**

Replace env-row-oriented expectations with business-field expectations:

- `createProfile` persists `name`, `baseUrl`, `apiKey`, and `defaultModel`.
- `getProfile` returns those business fields.
- `readCurrentConfig` reads them from `settings.json`.
- `activateProfile` writes:
  - `env.ANTHROPIC_BEDROCK_BASE_URL`
  - `env.ANTHROPIC_AUTH_TOKEN`
  - `env.ANTHROPIC_MODEL`
  - top-level `model`
- `activateProfile` preserves unrelated top-level keys and unrelated `env` keys.

Use this settings fixture:

```js
await fs.writeFile(
  path.join(claudeRoot, "settings.json"),
  JSON.stringify({
    theme: "dark",
    env: {
      AWS_REGION: "us-east-1",
      EXTRA_FLAG: "keep-me",
    },
    model: "sonnet",
  }),
  "utf8",
);
```

Expected activation assertions:

```js
assert.equal(settings.env.ANTHROPIC_BEDROCK_BASE_URL, "https://example.test/bedrock");
assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "sk-test");
assert.equal(settings.env.ANTHROPIC_MODEL, "us.anthropic.claude-haiku-4-5-20251001-v1:0");
assert.equal(settings.model, "haiku");
assert.equal(settings.env.AWS_REGION, "us-east-1");
assert.equal(settings.env.EXTRA_FLAG, "keep-me");
assert.equal(settings.theme, "dark");
```

**Step 2: Run the test to verify RED**

Run: `node --test lib/claude-profile-store.test.js`

Expected: FAIL because the store still uses `model` and raw `env` in its public profile shape.

**Step 3: Write the minimal implementation**

Update only the tests first. Do not change store code in this step.

**Step 4: Commit**

```bash
git add lib/claude-profile-store.test.js
git commit -m "test: cover claude business profile fields"
```

### Task 3: Implement Claude Profile Business Field Mapping

**Files:**
- Modify: `lib/claude-profile-store.js`
- Test: `lib/claude-profile-store.test.js`
- Modify later if needed: `lib/request-handler.test.js`

**Step 1: Write the minimal implementation**

Change the Claude profile store shape from:

```js
{
  id,
  name,
  model,
  env,
}
```

to:

```js
{
  id,
  name,
  baseUrl,
  apiKey,
  defaultModel,
}
```

Implementation rules:

- `readCurrentConfig()` reads:
  - `baseUrl` from `env.ANTHROPIC_BEDROCK_BASE_URL`
  - `apiKey` from `env.ANTHROPIC_AUTH_TOKEN`
  - `defaultModel` from `env.ANTHROPIC_MODEL`
- `activateProfile()` writes only those managed values.
- `activateProfile()` preserves unrelated top-level settings and unrelated env keys.
- `activateProfile()` auto-syncs the top-level `model` alias from `defaultModel`.

Add a small helper for alias extraction. For the initial version:

- if the model string contains `haiku`, write `haiku`
- if it contains `sonnet`, write `sonnet`
- if it contains `opus`, write `opus`
- otherwise keep the existing top-level `model` or fall back to the full model string

**Step 2: Run the test to verify GREEN**

Run: `node --test lib/claude-profile-store.test.js`

Expected: PASS.

**Step 3: Update API route tests if needed**

If `lib/request-handler.test.js` still expects Claude profile payloads shaped as `{ model, env }`, update those tests to the new shape before touching request handler code.

**Step 4: Run request handler tests**

Run: `node --test lib/request-handler.test.js`

Expected: either PASS already or FAIL only on changed Claude payload expectations.

**Step 5: Commit**

```bash
git add lib/claude-profile-store.js lib/claude-profile-store.test.js lib/request-handler.test.js
git commit -m "feat: map claude profiles to business fields"
```

### Task 4: Add Failing Coverage For Unified History Page Shell

**Files:**
- Modify: `lib/request-handler.test.js`
- Modify later: `public/index.html`
- Modify later: `public/app.js`
- Modify later: `public/styles.css`

**Step 1: Write the failing tests**

Extend the existing static page assertions for `/` or `/index.html` to check that the unified history page includes:

- Chinese page title and subtitle
- a single history entry page
- an `AI 类型` selector in the session summary area
- no page-jump links for `Claude History` or `Claude Profiles`

Use string assertions like:

```js
assert.match(indexHtml, /AI 类型/);
assert.doesNotMatch(indexHtml, /Claude History/);
assert.doesNotMatch(indexHtml, /Claude Profiles/);
```

**Step 2: Run the test to verify RED**

Run: `node --test lib/request-handler.test.js`

Expected: FAIL because the current Codex history page still contains cross-page links and no AI type selector.

**Step 3: Write the minimal implementation**

Update `public/index.html` only:

- convert any remaining broken or mixed copy to stable Chinese text
- replace cross-page links with stable top-level nav
- add the `AI 类型` `<select>` beside the session summary heading

Do not implement behavior in this step.

**Step 4: Run the test to verify GREEN**

Run: `node --test lib/request-handler.test.js`

Expected: PASS for the new static markup assertions.

**Step 5: Commit**

```bash
git add public/index.html lib/request-handler.test.js
git commit -m "test: cover unified history page shell"
```

### Task 5: Implement Unified History Page Behavior

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/app-model.js`
- Modify: `public/styles.css`
- Reference only: `public/claude.js`

**Step 1: Write the failing test or narrow manual check definition**

There is no existing test harness for browser-side event flow in `public/app.js`. Add the smallest possible pure helper tests in `public/app-model.test.js` for:

- building AI source labels
- selecting the correct API base path for Codex vs Claude
- clearing active detail when AI type changes

If a helper does not yet exist, create a helper seam first in `public/app-model.js`.

**Step 2: Run the helper test to verify RED**

Run: `node public/app-model.test.js`

Expected: FAIL because the helper seam is missing.

**Step 3: Write the minimal implementation**

Refactor `public/app.js` into one history controller with page state like:

```js
{
  aiType: "codex",
  sessions: [],
  filteredSessions: [],
  selectedIds: new Set(),
  activeSessionId: null,
  activeDetail: null,
}
```

Behavior rules:

- `aiType = codex` -> use `/api/sessions`
- `aiType = claude` -> use `/api/claude/sessions`
- clear detail and selection when AI type changes
- render a visible `Codex` or `Claude` label in every row
- show Codex-only actions, including resume, only in Codex mode
- keep all visible copy in Chinese

Reuse code from `public/claude.js` only as reference. The final behavior should live in the unified page script.

**Step 4: Run the targeted verification**

Run:

```powershell
node public/app-model.test.js
node --test lib/request-handler.test.js
```

Expected: PASS.

**Step 5: Manual smoke test**

Run:

```powershell
node .\server.js
```

Then verify in the browser:

- `历史管理` loads in Chinese
- switching `AI 类型` between `Codex` and `Claude` refreshes the list
- switching AI type clears incompatible detail
- Claude rows show a clear `Claude` label
- Codex rows still support resume

**Step 6: Commit**

```bash
git add public/app.js public/index.html public/app-model.js public/app-model.test.js public/styles.css
git commit -m "feat: unify history management page"
```

### Task 6: Add Failing Coverage For Unified Profile Page Shell

**Files:**
- Modify: `lib/request-handler.test.js`
- Modify later: `public/profiles.html`

**Step 1: Write the failing tests**

Extend the existing static page assertions for `/profiles.html` to check that the page includes:

- Chinese page copy
- a single profile entry page
- an `AI 类型` selector
- no links for `Claude History`, `Claude Profiles`, or `Codex History`

Use assertions like:

```js
assert.match(profilesHtml, /AI 类型/);
assert.doesNotMatch(profilesHtml, /Claude Profiles/);
assert.doesNotMatch(profilesHtml, /Codex History/);
```

**Step 2: Run the test to verify RED**

Run: `node --test lib/request-handler.test.js`

Expected: FAIL because the current profile page still contains cross-page links and no AI type selector.

**Step 3: Write the minimal implementation**

Update `public/profiles.html` only:

- remove cross-page links
- convert visible copy to Chinese
- add the `AI 类型` selector in the profile context area
- reserve form sections or containers for Codex and Claude field groups

**Step 4: Run the test to verify GREEN**

Run: `node --test lib/request-handler.test.js`

Expected: PASS for the new static markup assertions.

**Step 5: Commit**

```bash
git add public/profiles.html lib/request-handler.test.js
git commit -m "test: cover unified profile page shell"
```

### Task 7: Implement Unified Profile Page Behavior

**Files:**
- Modify: `public/profiles.js`
- Modify: `public/profiles.html`
- Modify: `public/app-model.js`
- Modify: `public/app-model.test.js`
- Modify: `public/styles.css`
- Reference only: `public/claude-profiles.js`
- Verify if needed: `lib/request-handler.js`
- Verify if needed: `lib/request-handler.test.js`

**Step 1: Write the failing tests**

Add pure tests in `public/app-model.test.js` for:

- mapping profile API paths from `aiType`
- rendering Claude profile meta from `baseUrl`, masked `apiKey`, and `defaultModel`
- validating Codex and Claude drafts independently

Expected Claude meta summary example:

```js
[
  ["Base URL", "https://example.test/bedrock"],
  ["API Key", "sk-te...test"],
  ["默认模型", "us.anthropic.claude-haiku-4-5-20251001-v1:0"],
]
```

**Step 2: Run the test to verify RED**

Run: `node public/app-model.test.js`

Expected: FAIL because the unified profile helper behavior does not exist yet.

**Step 3: Write the minimal implementation**

Refactor `public/profiles.js` into one profile controller with page state like:

```js
{
  aiType: "codex",
  profiles: [],
  selectedProfileId: null,
  selectedProfile: null,
  currentConfig: null,
  draft: {},
}
```

Behavior rules:

- `aiType = codex` uses `/api/profiles`
- `aiType = claude` uses `/api/claude/profiles`
- switching AI type reloads profile list and current config
- Codex shows current Codex fields
- Claude shows `名称 / Base URL / API Key / 默认模型`
- all page copy is Chinese
- profile cards and current-config summaries mask secrets

If the request handler payload shape needs small normalization for the unified frontend, make only the minimum route or response changes needed and update `lib/request-handler.test.js` first.

**Step 4: Run the targeted verification**

Run:

```powershell
node public/app-model.test.js
node --test lib/claude-profile-store.test.js
node --test lib/request-handler.test.js
```

Expected: PASS.

**Step 5: Manual smoke test**

Run:

```powershell
node .\server.js
```

Then verify in the browser:

- `方案管理` loads in Chinese
- switching `AI 类型` swaps the saved profile list and current config
- Claude mode shows `名称 / Base URL / API Key / 默认模型`
- activating a Claude profile updates `.claude/settings.json` with mapped fields and preserved unrelated settings

**Step 6: Commit**

```bash
git add public/profiles.js public/profiles.html public/app-model.js public/app-model.test.js public/styles.css lib/request-handler.js lib/request-handler.test.js lib/claude-profile-store.js lib/claude-profile-store.test.js
git commit -m "feat: unify profile management page"
```

### Task 8: Clean Up Navigation, Legacy Pages, And Docs

**Files:**
- Modify: `README.md`
- Verify whether to keep or redirect: `public/claude.html`
- Verify whether to keep or redirect: `public/claude-profiles.html`
- Verify whether to keep or stop referencing: `public/claude.js`
- Verify whether to keep or stop referencing: `public/claude-profiles.js`

**Step 1: Write the failing doc or static assertions if needed**

If `README.md` still documents four primary pages, update the expectations before code cleanup:

- primary pages are `index.html` and `profiles.html`
- Codex and Claude are selected within the page
- Claude profile fields map into `.claude/settings.json`

**Step 2: Write the minimal implementation**

Update `README.md` and decide one of these low-risk cleanup paths:

- keep `claude.html` and `claude-profiles.html` as compatibility artifacts but stop linking to them
- or replace them with minimal redirects to the unified pages

Do not remove files until the unified pages are stable and verified.

**Step 3: Run full verification**

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

**Step 4: Final manual smoke test**

Run:

```powershell
node .\server.js
```

Open:

- `http://localhost:4173/`
- `http://localhost:4173/profiles.html`

Expected:

- both pages use Chinese copy
- top-level nav is stable
- Codex and Claude switch via dropdowns, not page-jump buttons
- no regression in Codex session delete, rename, or resume
- no regression in Claude session delete
- Claude profile activation preserves unrelated settings

**Step 5: Commit**

```bash
git add README.md public/claude.html public/claude-profiles.html public/claude.js public/claude-profiles.js
git commit -m "docs: document unified codex and claude management"
```
