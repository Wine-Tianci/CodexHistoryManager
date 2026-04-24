# Codex Profile Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a profile management page that stores named Codex API profiles under `~/.codex`, supports CRUD and activation, and rewrites the live Codex `config.toml` and `auth.json` when switching profiles.

**Architecture:** Keep the current zero-dependency Node HTTP server and static frontend. Add a backend `ProfileStore` for saved profiles and live-config activation, then add a dedicated `profiles.html` page plus shared model helpers for profile list, details, and actions.

**Tech Stack:** Node.js, built-in `node:test`, vanilla HTML/CSS/JS, local filesystem APIs

---

### Task 1: Add failing backend tests for profile storage and activation

**Files:**
- Create: `lib/profile-store.test.js`

**Step 1: Write the failing test**

Cover:

- list profiles from an empty store
- create one profile
- update one profile
- delete one profile
- detect the active profile from live `config.toml` and `auth.json`
- activate a profile and verify `base_url` and `OPENAI_API_KEY` are rewritten

**Step 2: Run test to verify it fails**

Run: `node .\\lib\\profile-store.test.js`
Expected: FAIL because `ProfileStore` does not exist yet.

**Step 3: Write minimal implementation**

- create a profile store module
- add JSON file read/write helpers
- add live config readers and writers

**Step 4: Run test to verify it passes**

Run: `node .\\lib\\profile-store.test.js`
Expected: PASS

### Task 2: Implement backend profile store

**Files:**
- Create: `lib/profile-store.js`

**Step 1: Write the minimal implementation**

- store profiles in `~/.codex/codex-manager.profiles.json`
- expose `listProfiles`, `getProfile`, `createProfile`, `updateProfile`, `deleteProfile`, `activateProfile`
- compute active profile from live config values
- preserve unrelated file content during rewrites

**Step 2: Run tests**

Run: `node .\\lib\\profile-store.test.js`
Expected: PASS

### Task 3: Add failing frontend model tests for profile presentation helpers

**Files:**
- Modify: `public\\app-model.test.js`
- Modify: `public\\app-model.js`

**Step 1: Write the failing test**

Cover:

- mask API keys for list rendering
- sort profiles with the active profile first, then by name
- detect empty profile form validation cases

**Step 2: Run test to verify it fails**

Run: `node .\\public\\app-model.test.js`
Expected: FAIL because profile helpers do not exist yet.

**Step 3: Write minimal implementation**

- add reusable profile presentation helpers in `public/app-model.js`

**Step 4: Run test to verify it passes**

Run: `node .\\public\\app-model.test.js`
Expected: PASS

### Task 4: Expose profile APIs in the local server

**Files:**
- Modify: `server.js`

**Step 1: Write the failing test**

Use the backend store tests plus manual API-focused verification after route wiring.

**Step 2: Write minimal implementation**

- `GET /api/profiles`
- `GET /api/profiles/:id`
- `POST /api/profiles`
- `PATCH /api/profiles/:id`
- `DELETE /api/profiles/:id`
- `POST /api/profiles/:id/activate`

**Step 3: Run tests**

Run: `node .\\lib\\profile-store.test.js`
Expected: PASS

### Task 5: Build the profile management page

**Files:**
- Create: `public\\profiles.html`
- Create: `public\\profiles.js`
- Modify: `public\\styles.css`

**Step 1: Write the minimal implementation**

- add a two-panel profile management page
- list profiles with active badge
- show detail form for create/edit
- support save, delete, activate, and refresh
- render unmanaged-current-config state

**Step 2: Run model tests**

Run: `node .\\public\\app-model.test.js`
Expected: PASS

### Task 6: Add navigation entry from the existing page

**Files:**
- Modify: `public\\index.html`
- Modify: `public\\app.js`
- Modify: `public\\styles.css`

**Step 1: Write the minimal implementation**

- add a navigation button from session management to profile management
- add a reciprocal back button on the profile page
- keep existing session management behavior intact

**Step 2: Verify manually**

- open `/`
- navigate to `/profiles.html`
- navigate back to `/`

### Task 7: Final verification

**Files:**
- Modify: `README.md`

**Step 1: Update documentation**

- mention the new profile management page
- document the dedicated profile store filename
- document that activation rewrites live Codex config files

**Step 2: Run verification**

Run: `node .\\lib\\session-store.test.js`
Expected: PASS

Run: `node .\\lib\\profile-store.test.js`
Expected: PASS

Run: `node .\\public\\app-model.test.js`
Expected: PASS
