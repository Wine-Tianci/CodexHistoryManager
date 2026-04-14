# Session Resume Button Design

**Goal:** Add a "switch to current session" action beside the `Session ID` value in the session detail metadata panel. Clicking it should open a new Windows terminal and run `codex resume <SESSION_ID>`.

## Scope

- Add the action only for the currently selected session in the right-side detail panel.
- Keep the existing session list layout unchanged.
- Use a backend endpoint so the browser does not need direct shell access.

## Architecture

The frontend already renders session metadata from `public/app.js`. The `Session ID` row will become a richer metadata value that can include both the ID and an action button. The button will call a new backend endpoint dedicated to resuming a session.

The backend request handler in `lib/request-handler.js` will expose `POST /api/sessions/:id/resume`. That route will delegate to a small launcher utility that starts a Windows terminal process and executes `codex resume <SESSION_ID>` without blocking the HTTP response.

## Error Handling

- If no session is selected, no button is rendered.
- If the backend cannot launch the terminal, the API returns an error and the frontend shows a failure alert.
- If the session id is missing or malformed at the route layer, the API returns `400`.

## Testing

- Add a frontend model-level test for the metadata row helper that renders the resume button next to the `Session ID`.
- Add a backend request-handler test that verifies `POST /api/sessions/:id/resume` invokes the launcher with the correct session id and returns a success payload.
- Keep the tests local to the existing lightweight Node test setup.
