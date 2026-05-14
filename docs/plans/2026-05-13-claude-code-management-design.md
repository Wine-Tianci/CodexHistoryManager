# Claude Code Management Design

## Goal

Add Claude Code support without mixing it into Codex runtime configuration. Codex profiles and history keep using the existing `.codex` files, while Claude profiles and history use Claude Code's own local files.

## Local Claude Data

Observed on Windows:

- User state file: `C:\Users\<user>\.claude.json`
- Claude root: `C:\Users\<user>\.claude`
- Global settings: `C:\Users\<user>\.claude\settings.json`
- Prompt history index: `C:\Users\<user>\.claude\history.jsonl`
- Full session transcripts: `C:\Users\<user>\.claude\projects\<project-key>\<session-id>.jsonl`
- Live session metadata: `C:\Users\<user>\.claude\sessions\*.json`

`settings.json` can contain an `env` object for provider variables and a top-level `model` value. For the current target, CodexManager should manage these settings only through Claude-specific profile logic.

## Architecture

Add Claude-specific stores beside the existing Codex stores:

- `ClaudeProfileStore` manages saved Claude profiles and activation.
- `ClaudeSessionStore` discovers Claude session history and reads transcript details.
- Existing `ProfileStore` and `SessionStore` remain Codex-only.

The API should expose separate route groups:

- `/api/claude/profiles`
- `/api/claude/profiles/:id`
- `/api/claude/profiles/:id/activate`
- `/api/claude/sessions`
- `/api/claude/sessions/:id`

The UI should expose separate Claude pages or a clear top-level switch. The first implementation can add `claude-profiles.html` and `claude.html` to keep the existing pages stable and reduce coupling.

## Claude Profiles

Store Claude profiles in:

```text
~/.claude/codex-manager.profiles.json
```

Each saved profile should include:

- `id`
- `name`
- `model`
- `env`

`env` is a string map and should support the variables Claude Code already reads, including:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_BEDROCK_BASE_URL`
- `CLAUDE_CODE_USE_BEDROCK`
- `CLAUDE_CODE_SKIP_BEDROCK_AUTH`
- `AWS_REGION`

Activation reads `~/.claude/settings.json`, merges only the profile-managed fields, and writes the file atomically. It must preserve unrelated settings such as hooks, permissions, plugins, and UI preferences.

API responses should mask sensitive environment values in list/detail presentation unless the form explicitly needs the raw value for editing. Raw values should never be displayed in history views.

## Claude History

Session listing should be built from `~/.claude/projects/**/*.jsonl`, with `~/.claude/history.jsonl` used as an optional index for first prompt/title hints. Each session summary should include:

- `id`
- `project`
- `projectKey`
- `path`
- `title`
- `updatedAt`
- `messageCount`
- `model`

Details should parse each transcript line as JSON and expose normalized records for user, assistant, tool use, tool result, attachment, permission, and metadata entries. The raw record view can mirror the current Codex detail page so unusual Claude event types remain inspectable.

Deletion should be conservative: first implementation can support transcript-file deletion only after explicit confirmation. Renaming should update only CodexManager's own metadata file, not Claude's transcript JSONL, because Claude Code does not appear to keep a simple canonical title field in transcript files.

## Error Handling

Missing Claude files should not break Codex pages. Claude pages should show a clear empty state when `~/.claude` does not exist or no sessions are present.

Malformed JSONL lines should be skipped with a per-session warning count instead of failing the whole page. Malformed `settings.json` should block profile activation with a clear error because writing over it would be unsafe.

## Testing

Add tests with temporary Claude roots:

- Profile creation, update, delete, and activation.
- Activation preserves unrelated `settings.json` fields.
- Activation writes model and selected environment variables.
- Current-config reads model and env from `settings.json`.
- Session listing discovers project transcripts.
- Session details normalize user/assistant/tool records.
- Malformed transcript lines produce warnings, not total failure.
- API routes return Claude profile and session payloads separately from Codex routes.

