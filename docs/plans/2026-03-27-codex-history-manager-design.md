# Codex History Manager Design

**Date:** 2026-03-27

**Goal:** Build a local web application that manages Codex local session history with list, detail, rename, and permanent multi-delete capabilities.

## Recommendation

Use a web app with a local API service instead of a native `exe`.

- A browser UI is faster to build for searchable lists, split panes, inline editing, and multi-select actions.
- The data source is already local filesystem data under `~/.codex`, so a local backend can safely read and mutate it.
- If a distributable desktop app is needed later, the web app can be wrapped in Electron or Tauri without changing the core behavior.

## Requirements

The application must support:

1. List session summaries with `source`, `session ID`, `updated time`, and `title`.
2. Open a specific session and view details.
3. Rename a session.
4. Permanently delete multiple sessions.

Additional confirmed behavior:

- Data source is the local Codex session store under `C:\Users\laijingfeng\.codex`.
- Detail view must include both a readable summary mode and a raw event mode.
- Delete is permanent, not archive-only.

## Data Sources

Primary files and directories:

- `C:\Users\laijingfeng\.codex\session_index.jsonl`
- `C:\Users\laijingfeng\.codex\history.jsonl`
- `C:\Users\laijingfeng\.codex\sessions\**\*.jsonl`
- `C:\Users\laijingfeng\.codex\archived_sessions\*.jsonl`

Observed schema:

- `session_index.jsonl` provides `id`, `thread_name`, and `updated_at`.
- Session detail files contain event streams including `session_meta`, user messages, assistant messages, tool events, and task lifecycle events.
- `history.jsonl` contains per-session history text snippets keyed by `session_id`.

## Architecture

### Frontend

Use `React + Vite + TypeScript`.

- Left pane: session list with search, filter, sort, checkbox selection.
- Right pane: session detail.
- Responsive layout: split pane on desktop, stacked panels on smaller screens.

### Backend

Use `Node.js + Fastify + TypeScript`.

- Reads and parses Codex local files.
- Exposes list, detail, rename, and delete APIs.
- Centralizes filesystem mutation so permanent delete and index rewrites are consistent.

### Why Not Pure Frontend

A pure browser app using File System Access API would make permission flow, persistent access, and permanent batch deletion more fragile. The local API keeps file operations explicit and testable.

## Data Model

### Session Summary

- `sessionId`
- `title`
- `updatedAt`
- `source` (`sessions` or `archived_sessions`)
- `detailPath`
- `hasDetailFile`

Title resolution order:

1. `thread_name` from `session_index.jsonl`
2. First user message text from `history.jsonl`
3. Fallback title like `Untitled Session`

### Session Detail

- `sessionId`
- `title`
- `updatedAt`
- `source`
- `meta`
- `timeline`
- `rawEvents`

`timeline` is a normalized readable view generated from raw JSONL events.

## UI Design

### Toolbar

- Search box
- Source filter
- Refresh button
- Selected count
- Bulk delete button

### Session List

Columns:

- `Source`
- `Session ID`
- `Updated`
- `Title`

Behaviors:

- Single click selects a row and loads detail.
- Checkbox toggles selection for bulk actions.
- Title supports inline rename.
- Default sort is descending `updatedAt`.

### Detail Panel

Tabs:

- `Summary`
- `Raw`

Summary tab shows:

- Session metadata
- Human-readable event timeline
- Error state when the detail file is missing

Raw tab shows:

- Parsed raw event records
- Incremental loading for large files

## Filesystem Mutation Rules

### Rename

- Rewrite `session_index.jsonl`.
- Only mutate the matching record's `thread_name`.
- Preserve all unrelated records.
- Use temporary-file write then atomic replace.

### Permanent Delete

For each selected session:

1. Delete the matching detail file from `sessions` or `archived_sessions`.
2. Remove the matching record from `session_index.jsonl`.
3. Remove matching records from `history.jsonl`.

Operational safety:

- Validate all requested targets before mutation starts.
- Use temporary files for rewritten indexes.
- Return per-session success or failure results.
- No user-facing recycle bin is provided.

## Error Handling

- Missing detail file with existing index record is shown as an orphaned session.
- Corrupt JSONL lines are skipped with surfaced warnings where possible.
- Rename conflicts or rewrite failures return explicit API errors.
- Delete reports partial failures instead of hiding them.

## Testing Strategy

### Backend

- Parse `session_index.jsonl`
- Parse session detail JSONL
- Build timeline from raw events
- Rename a single session
- Permanently delete multiple sessions and sync index/history
- Handle orphaned sessions and malformed lines

### Frontend

- Render list with required columns
- Search and filter behavior
- Select row and load detail
- Inline rename flow
- Multi-select delete confirmation
- Error-state rendering

## Execution Notes

- Start with the web app implementation.
- Keep delete logic in the backend only.
- If desktop packaging is needed later, wrap the finished app rather than changing the core architecture.
