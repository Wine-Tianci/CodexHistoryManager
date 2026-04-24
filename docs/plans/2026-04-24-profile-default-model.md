# Profile Default Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional default model and reasoning effort fields to Codex profiles and apply them on profile activation.

**Architecture:** Extend the existing profile JSON/API shape with `model` and `modelReasoningEffort`. Keep both fields optional, normalize missing values to empty strings, and conditionally rewrite top-level TOML keys during activation only when the profile supplies a value.

**Tech Stack:** Node.js built-in `node:test`, static browser JavaScript, HTML/CSS, no npm dependencies.

---

### Task 1: Backend Profile Storage and Activation

**Files:**
- Modify: `lib/profile-store.test.js`
- Modify: `lib/profile-store.js`

**Step 1: Write failing tests**

Add tests that:
- `createProfile` and `updateProfile` persist `model` and `modelReasoningEffort`.
- `activateProfile` rewrites top-level `model` and `model_reasoning_effort`.
- Activating a profile without these fields preserves the existing live values.

**Step 2: Run test to verify it fails**

Run: `node --test lib/profile-store.test.js`
Expected: FAIL because the new fields are ignored and TOML keys are not rewritten.

**Step 3: Implement minimal backend code**

Add optional string normalization, include fields in stored profiles, parse current model settings, and add TOML rewrite helpers for top-level string keys.

**Step 4: Run test to verify it passes**

Run: `node --test lib/profile-store.test.js`
Expected: PASS.

### Task 2: API and Frontend Form

**Files:**
- Modify: `lib/request-handler.test.js`
- Modify: `public/app-model.test.js`
- Modify: `public/app-model.js`
- Modify: `public/profiles.html`
- Modify: `public/profiles.js`
- Modify: `public/styles.css` if layout spacing needs adjustment

**Step 1: Write failing tests**

Add tests that profile API responses include the new fields and frontend validation accepts blank model settings.

**Step 2: Run tests to verify they fail**

Run: `node --test lib/request-handler.test.js` and `node public/app-model.test.js`
Expected: FAIL before frontend/backend code is extended.

**Step 3: Implement minimal frontend/API code**

Add two form inputs, include values in draft state and dirty checks, render current config and profile list metadata, and keep validation optional.

**Step 4: Run tests to verify they pass**

Run: `node --test lib/request-handler.test.js` and `node public/app-model.test.js`
Expected: PASS.

### Task 3: Documentation and Full Verification

**Files:**
- Modify: `README.md`

**Step 1: Update docs**

Document the two optional profile fields and the two live TOML keys written on activation.

**Step 2: Run full verification**

Run:
- `node --test lib/profile-store.test.js`
- `node --test lib/request-handler.test.js`
- `node public/app-model.test.js`

Expected: all commands exit 0.
