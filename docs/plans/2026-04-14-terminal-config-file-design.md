# Terminal Config File Design

**Goal:** Move the session-resume terminal path from code defaults into a tool-local config file stored in the project root, while preserving a safe fallback when the file is missing.

## Scope

- Add a root-level config file named `codex-manager.config.json`.
- Support a `terminalPath` field for the session resume launcher.
- Keep configuration manual-edit only; no UI for editing it.

## Architecture

The backend startup path in `server.js` will load a small tool config object from the project root before constructing the session resume launcher. A dedicated config loader module will read and validate the JSON file so the startup script stays small and testable.

The session resume launcher will continue to accept an injected `windowsTerminalPath`. If the config file is missing or does not provide `terminalPath`, the launcher falls back to the existing `wt.exe` alias path.

## Error Handling

- Missing config file: use defaults.
- Invalid JSON: fail fast at startup with a clear error.
- Blank or non-string `terminalPath`: ignore it and use defaults.

## Testing

- Add a unit test for the config loader that covers configured value, missing file fallback, and invalid JSON.
- Keep existing launcher and request-handler tests to verify wiring still works.
