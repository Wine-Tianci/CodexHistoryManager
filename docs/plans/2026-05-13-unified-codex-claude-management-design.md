# Unified Codex and Claude Management Design

## Goal

Unify Codex and Claude management into two Chinese-language pages:

- One history management page that switches between Codex and Claude sessions with a dropdown.
- One profile management page that switches between Codex and Claude profile types with a dropdown.

The product should stop treating Codex and Claude as separate top-level pages. Instead, the page stays stable and the selected AI type defines which data source, fields, and actions are active.

## Current State

The current UI splits each capability into separate pages:

- `public/index.html` for Codex history
- `public/claude.html` for Claude history
- `public/profiles.html` for Codex profiles
- `public/claude-profiles.html` for Claude profiles

This creates two problems:

- The product mixes Chinese and English UI, which makes the experience feel inconsistent.
- Users switch between Codex and Claude by jumping to another page, which makes the IA feel like a toggle instead of a stable workflow.

## Product Decisions

### 1. Keep Two Top-Level Workflows

The app keeps only two user-facing workflows:

- `历史管理`
- `方案管理`

These remain the only primary navigation actions in the page header.

### 2. Move Codex/Claude Selection Into Page Context

Each workflow page adds an `AI 类型` dropdown with these fixed options:

- `Codex`
- `Claude`

The dropdown sets page context. It does not act like a button that flips the UI back and forth.

### 3. Keep Backend APIs Split

The frontend will unify the experience, but the backend can continue to use the existing route split:

- Codex: `/api/...`
- Claude: `/api/claude/...`

This minimizes backend risk and keeps the first unified implementation focused on UI composition, state switching, and field mapping.

## History Management Design

## Page Structure

The unified history page continues to use `public/index.html` as the primary entry page.

Header behavior:

- Keep a Chinese-language title and subtitle.
- Remove page-jump buttons for `Claude History`, `Claude Profiles`, and `Codex Profiles`.
- Keep only the stable top-level navigation between `历史管理` and `方案管理`.

List panel behavior:

- Place the `AI 类型` dropdown beside the `会话概要` heading.
- The selected value determines which session list API is queried.
- Search, refresh, selection, bulk delete, and detail loading all operate within the selected AI type.

Detail panel behavior:

- When the AI type changes, clear any active detail that belongs to the previous type.
- Show a Chinese empty-state prompt asking the user to select a new session for the newly selected AI type.

## Session Identification

The session list should still show a highly visible source tag for every row so the page remains easy to scan even in a unified shell.

Rules:

- Codex history rows show a visible `Codex` label.
- Claude history rows show a visible `Claude` label.
- Codex sessions may continue to show their internal source values such as `sessions` or `archived_sessions`, but the page-level AI source must be visually obvious first.

## Data Rules

Codex mode continues to use the current Codex session behavior:

- List: `/api/sessions`
- Detail: `/api/sessions/:id`
- Delete: `/api/sessions`
- Resume: existing Codex-only resume flow remains available

Claude mode continues to use the current Claude session behavior:

- List: `/api/claude/sessions`
- Detail: `/api/claude/sessions/:id`
- Delete: `/api/claude/sessions`

Claude history does not get a Codex-style resume action unless a real Claude resume flow is explicitly added later.

## Profile Management Design

## Page Structure

The unified profile page continues to use `public/profiles.html` as the primary entry page.

Header behavior:

- Convert all visible copy to Chinese.
- Remove page-jump buttons for Claude and Codex sub-pages.
- Keep only stable navigation between `历史管理` and `方案管理`.

Context behavior:

- Add the `AI 类型` dropdown near the top of the profile form area.
- The selected AI type controls the current config summary, saved profile list, and edit form fields.

## Codex Profile Fields

When `AI 类型 = Codex`, preserve the current field model:

- 名称
- Provider
- 密钥
- Base URL
- 默认模型
- Reasoning Effort

The current Codex storage and activation behavior remains unchanged.

## Claude Profile Fields

When `AI 类型 = Claude`, the page should present business fields instead of an open-ended environment variable editor.

The visible fields are:

- 名称
- Base URL
- API Key
- 默认模型

These fields map into `C:\Users\<user>\.claude\settings.json`.

Observed structure in the current local Claude settings:

- top-level `model`
- `env.ANTHROPIC_BEDROCK_BASE_URL`
- `env.ANTHROPIC_AUTH_TOKEN`
- `env.ANTHROPIC_MODEL`

The profile editor should treat these as first-class fields instead of exposing raw env rows for the primary workflow.

## Claude Field Mapping Rules

Claude profile storage should persist normalized business fields, then activation writes the Claude settings file with these mappings:

- `Base URL` -> `env.ANTHROPIC_BEDROCK_BASE_URL`
- `API Key` -> `env.ANTHROPIC_AUTH_TOKEN`
- `默认模型` -> `env.ANTHROPIC_MODEL`

The top-level Claude `model` value should be auto-synced from the selected default model into a short alias.

Example:

- `env.ANTHROPIC_MODEL = us.anthropic.claude-haiku-4-5-20251001-v1:0`
- top-level `model = haiku`

This keeps the user-facing form simple while staying compatible with the local Claude settings shape already in use.

## Claude Settings Preservation

Activation for Claude profiles must preserve unrelated keys in `settings.json`.

Examples of data that must not be dropped:

- unrelated top-level settings
- unrelated `env` entries
- hooks, permissions, plugins, and other Claude Code preferences

Only profile-managed keys should be inserted or updated.

## UI Language and Style

All user-facing copy for the unified pages should be Chinese.

This includes:

- page titles
- subtitles
- buttons
- field labels
- empty states
- confirmations
- validation errors
- loading text

The resulting product should not mix Chinese Codex pages with English Claude pages.

## Compatibility Strategy

The first unified release should optimize for low migration risk:

- Keep current backend endpoints.
- Keep current stores for Codex and Claude.
- Reuse existing page scripts as the basis for a unified frontend model.
- Treat `public/claude.html` and `public/claude-profiles.html` as implementation artifacts that can later be removed or redirected after the unified pages are stable.

This avoids a broad server refactor in the same change set.

## Testing

The change should add or update tests for these behaviors:

- The unified history page switches between Codex and Claude APIs based on the selected AI type.
- Changing the AI type clears incompatible active session detail.
- The history list renders a clear AI source label.
- The unified profile page switches field sets based on the selected AI type.
- Codex validation remains unchanged.
- Claude validation requires `名称`, `Base URL`, `API Key`, and `默认模型`.
- Claude profile activation writes:
  - `env.ANTHROPIC_BEDROCK_BASE_URL`
  - `env.ANTHROPIC_AUTH_TOKEN`
  - `env.ANTHROPIC_MODEL`
  - top-level `model` alias
- Claude profile activation preserves unrelated `settings.json` content.
- All new page copy used in the unified flow is Chinese.

## Non-Goals

This change does not attempt to:

- unify backend route shapes into a single generic API
- add a Claude resume-session action
- expose every Claude environment variable as a first-class form field
- redesign the overall visual language beyond the structural cleanup needed for unification
