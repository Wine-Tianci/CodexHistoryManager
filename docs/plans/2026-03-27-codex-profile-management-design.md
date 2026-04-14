# Codex Profile Management Design

**Date:** 2026-03-27

**Goal:** Add profile management to the local web tool so users can save multiple Codex configuration profiles and switch the active local Codex API settings from the UI.

## Confirmed Requirements

The tool must support:

1. View a list of saved profiles and clearly mark which profile is currently in use.
2. View profile details.
3. Add, edit, and delete profiles.
4. Switch the active profile.
5. Add a navigation entry so users can open the profile management page from the existing tool.

Each profile currently contains:

- `name`
- `apiKey`
- `baseUrl`

Confirmed behavior for activation:

- Activating a profile must immediately rewrite the current local Codex configuration.
- `~/.codex/config.toml` must update the active provider `base_url`.
- `~/.codex/auth.json` must update `OPENAI_API_KEY`.

## Storage Strategy

Store profiles in a dedicated file under `~/.codex` instead of mixing them into official Codex files.

Recommended filename:

- `codex-history-manager.profiles.json`

Why this name:

- It is specific to this tool.
- It avoids likely collisions with official Codex files such as `config.toml`, `auth.json`, `history.jsonl`, and `session_index.jsonl`.

Proposed file format:

```json
{
  "version": 1,
  "lastActivatedProfileId": "profile_123",
  "profiles": [
    {
      "id": "profile_123",
      "name": "Work",
      "apiKey": "sk-xxx",
      "baseUrl": "https://example.com"
    }
  ]
}
```

## Active Profile Resolution

Use a mixed strategy:

- Persist `lastActivatedProfileId` in the profile store for history.
- Determine the real "currently in use" profile by reading live values from:
  - `~/.codex/config.toml`
  - `~/.codex/auth.json`
- Match the live `baseUrl` and `apiKey` against saved profiles.

Why this is the right tradeoff:

- If the user edits `config.toml` or `auth.json` outside the tool, the UI still shows the real current state.
- If the current live configuration does not match any saved profile, the UI can explicitly show that the active config is unmanaged.

## Backend Design

### New Store

Add a dedicated profile store alongside the current session store.

Responsibilities:

- Read and write the profile store file.
- Read current active Codex configuration from official files.
- Create, update, delete, and activate profiles.
- Safely rewrite `config.toml` and `auth.json`.

### API Endpoints

Add:

- `GET /api/profiles`
- `GET /api/profiles/:id`
- `POST /api/profiles`
- `PATCH /api/profiles/:id`
- `DELETE /api/profiles/:id`
- `POST /api/profiles/:id/activate`

Response requirements:

- Profile list returns saved profiles plus derived active-state metadata.
- Detail endpoint returns full profile values.
- Activation endpoint returns the updated active profile status.

### Config Rewrite Rules

`config.toml`:

- Read current `model_provider`.
- Locate the matching `[model_providers.<provider>]` section.
- Rewrite only the `base_url` line for that provider.
- Preserve unrelated content.

`auth.json`:

- Parse JSON.
- Rewrite `OPENAI_API_KEY`.
- Preserve unrelated fields such as `auth_mode`.

For both files:

- Validate the target structure before write.
- Use temp-file write then atomic replace.

## Frontend Design

### Navigation

Keep the existing session manager page and add a top-level navigation button to open a new profile management page.

Recommended route shape without adding a router dependency:

- `/` for session management
- `/profiles.html` for profile management

This matches the current static-file setup and keeps the project zero-dependency.

### Profile Management Page

Primary areas:

1. Header with page title, navigation back to sessions, and refresh action.
2. Profile list panel.
3. Profile detail and edit form panel.

List content:

- Name
- Base URL
- API key masked by default
- Status badge for currently active profile

Detail content:

- Full editable form for name, API key, and base URL
- Save action
- Activate action
- Delete action

Create flow:

- Explicit "New Profile" button clears the form into create mode.

Delete behavior:

- Deleting the saved active profile is allowed.
- Deletion removes only the saved profile record.
- It does not revert current Codex live config.

## Error Handling

- If live config files are missing or malformed, profile APIs return explicit errors.
- If no saved profile matches the current live config, the UI shows "current config is not bound to a saved profile".
- Prevent empty `name`, `apiKey`, or `baseUrl` values on create and update.
- Surface activation failures without mutating saved profile data.

## Testing Strategy

Backend tests:

- Read empty and populated profile store files.
- Create, update, delete profiles.
- Detect active profile by comparing live config values.
- Activate a profile and verify both official files are rewritten.
- Preserve unrelated `config.toml` and `auth.json` content.

Frontend tests:

- Mask API keys in list view.
- Show active badge on the matching profile.
- Render create and edit states.
- Trigger activate, save, and delete flows.
- Show unmanaged-active-config state when no saved profile matches.
