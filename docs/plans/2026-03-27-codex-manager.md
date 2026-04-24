# CodexManager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local web app that lists Codex sessions, shows session details, supports rename, and permanently deletes multiple sessions from the local Codex history store.

**Architecture:** A React + Vite frontend talks to a local Fastify API. The backend parses and mutates `C:\Users\laijingfeng\.codex` JSONL files, while the frontend provides the split-pane management UI with summary and raw detail modes.

**Tech Stack:** Node.js, TypeScript, React, Vite, Fastify, Vitest, React Testing Library

---

### Task 1: Scaffold the workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.css`
- Create: `src/server/index.ts`

**Step 1: Write the failing test**

Create `src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the CodexManager shell", () => {
    render(<App />);
    expect(screen.getByText("CodexManager")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- App.test.tsx`
Expected: FAIL because the app and test setup do not exist yet.

**Step 3: Write minimal implementation**

- Create the Vite React entrypoint.
- Export `App` from `src/app/App.tsx`.
- Render a page heading `CodexManager`.
- Add minimal Vitest and Testing Library setup.

**Step 4: Run test to verify it passes**

Run: `npm test -- App.test.tsx`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts index.html src
git commit -m "chore: scaffold codex manager"
```

### Task 2: Define shared session types and parsing helpers

**Files:**
- Create: `src/shared/session.ts`
- Create: `src/server/lib/jsonl.ts`
- Create: `src/server/lib/session-parsers.ts`
- Create: `src/server/lib/session-parsers.test.ts`

**Step 1: Write the failing test**

In `src/server/lib/session-parsers.test.ts`, add tests for:

```ts
it("parses a session index line into a summary record", () => {
  const line = '{"id":"abc","thread_name":"Title","updated_at":"2026-03-27T05:05:26.721Z"}';
  expect(parseSessionIndexLine(line)).toEqual({
    sessionId: "abc",
    title: "Title",
    updatedAt: "2026-03-27T05:05:26.721Z",
  });
});
```

```ts
it("extracts a readable timeline item from a user message event", () => {
  const event = {
    timestamp: "2026-03-04T13:16:56.084Z",
    type: "event_msg",
    payload: { type: "user_message", message: "hello" },
  };
  expect(toTimelineItem(event)).toMatchObject({
    kind: "user",
    text: "hello",
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- session-parsers.test.ts`
Expected: FAIL because parsing helpers do not exist.

**Step 3: Write minimal implementation**

- Add shared summary/detail/timeline TypeScript types.
- Add JSONL line parsing helper.
- Add session index parser, history fallback parser, and raw-event-to-timeline mapper.

**Step 4: Run test to verify it passes**

Run: `npm test -- session-parsers.test.ts`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/shared/session.ts src/server/lib/jsonl.ts src/server/lib/session-parsers.ts src/server/lib/session-parsers.test.ts
git commit -m "feat: add session parsing primitives"
```

### Task 3: Implement session discovery service

**Files:**
- Create: `src/server/lib/codex-paths.ts`
- Create: `src/server/lib/session-repository.ts`
- Create: `src/server/lib/session-repository.test.ts`

**Step 1: Write the failing test**

In `src/server/lib/session-repository.test.ts`, create fixture files under a test temp directory and assert:

```ts
it("builds session summaries from the codex store", async () => {
  const repo = createSessionRepository({ codexRoot: fixtureRoot });
  const sessions = await repo.listSessions();
  expect(sessions[0]).toMatchObject({
    sessionId: "019d2dae-d8be-71a3-a39b-65dc9c3b70a6",
    source: "sessions",
    title: "Example title",
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- session-repository.test.ts`
Expected: FAIL because the repository does not exist.

**Step 3: Write minimal implementation**

- Resolve default Codex root from the user home directory.
- Scan `session_index.jsonl`.
- Match session IDs to files in `sessions` and `archived_sessions`.
- Merge title fallback from `history.jsonl`.
- Return summaries sorted by `updatedAt` descending.

**Step 4: Run test to verify it passes**

Run: `npm test -- session-repository.test.ts`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/server/lib/codex-paths.ts src/server/lib/session-repository.ts src/server/lib/session-repository.test.ts
git commit -m "feat: add codex session discovery"
```

### Task 4: Implement session detail loading

**Files:**
- Modify: `src/server/lib/session-repository.ts`
- Create: `src/server/lib/session-detail.test.ts`

**Step 1: Write the failing test**

Add tests that verify:

```ts
it("loads a session detail with summary and raw events", async () => {
  const detail = await repo.getSession("abc");
  expect(detail.timeline.length).toBeGreaterThan(0);
  expect(detail.rawEvents.length).toBeGreaterThan(0);
});
```

```ts
it("marks a session as orphaned when the index exists but the file is missing", async () => {
  const detail = await repo.getSession("missing");
  expect(detail.meta.isOrphaned).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- session-detail.test.ts`
Expected: FAIL because detail loading is not implemented.

**Step 3: Write minimal implementation**

- Read the matching session JSONL file.
- Parse raw events.
- Normalize a readable timeline.
- Flag missing-file sessions as orphaned.
- Support a `rawOffset` and `rawLimit` input for raw event pagination.

**Step 4: Run test to verify it passes**

Run: `npm test -- session-detail.test.ts`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/server/lib/session-repository.ts src/server/lib/session-detail.test.ts
git commit -m "feat: add session detail loading"
```

### Task 5: Implement rename and permanent delete operations

**Files:**
- Modify: `src/server/lib/session-repository.ts`
- Create: `src/server/lib/session-mutations.ts`
- Create: `src/server/lib/session-mutations.test.ts`

**Step 1: Write the failing test**

Add tests for:

```ts
it("renames one session by rewriting session_index.jsonl", async () => {
  await renameSession({ codexRoot: fixtureRoot, sessionId: "abc", title: "New title" });
  expect(await readFile(indexPath, "utf8")).toContain('"thread_name":"New title"');
});
```

```ts
it("deletes multiple sessions from files, session_index, and history", async () => {
  const result = await deleteSessions({ codexRoot: fixtureRoot, sessionIds: ["a", "b"] });
  expect(result.deleted).toEqual(["a", "b"]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- session-mutations.test.ts`
Expected: FAIL because mutation helpers do not exist.

**Step 3: Write minimal implementation**

- Implement temp-file rewrite helpers for `session_index.jsonl` and `history.jsonl`.
- Delete session files from the resolved source path.
- Validate all targets before mutation.
- Return structured per-session mutation results.

**Step 4: Run test to verify it passes**

Run: `npm test -- session-mutations.test.ts`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/server/lib/session-repository.ts src/server/lib/session-mutations.ts src/server/lib/session-mutations.test.ts
git commit -m "feat: add session rename and delete"
```

### Task 6: Expose the local API

**Files:**
- Modify: `src/server/index.ts`
- Create: `src/server/app.ts`
- Create: `src/server/app.test.ts`

**Step 1: Write the failing test**

Add API tests for:

```ts
it("returns the session list", async () => {
  const response = await app.inject({ method: "GET", url: "/api/sessions" });
  expect(response.statusCode).toBe(200);
});
```

```ts
it("renames a session through the API", async () => {
  const response = await app.inject({
    method: "PATCH",
    url: "/api/sessions/abc",
    payload: { title: "Renamed" },
  });
  expect(response.statusCode).toBe(200);
});
```

```ts
it("deletes sessions through the API", async () => {
  const response = await app.inject({
    method: "DELETE",
    url: "/api/sessions",
    payload: { sessionIds: ["a", "b"] },
  });
  expect(response.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app.test.ts`
Expected: FAIL because the API routes do not exist.

**Step 3: Write minimal implementation**

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions`
- Validate request payloads and return explicit errors.

**Step 4: Run test to verify it passes**

Run: `npm test -- app.test.ts`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/server/index.ts src/server/app.ts src/server/app.test.ts
git commit -m "feat: add codex manager api"
```

### Task 7: Build the session list UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.css`
- Create: `src/app/api.ts`
- Create: `src/app/components/SessionTable.tsx`
- Create: `src/app/components/Toolbar.tsx`
- Create: `src/app/components/SessionTable.test.tsx`

**Step 1: Write the failing test**

Add component tests that verify:

```tsx
it("renders source, session ID, updated time, and title columns", async () => {
  render(<App />);
  expect(screen.getByText("Source")).toBeInTheDocument();
  expect(screen.getByText("Session ID")).toBeInTheDocument();
  expect(screen.getByText("Updated")).toBeInTheDocument();
  expect(screen.getByText("Title")).toBeInTheDocument();
});
```

```tsx
it("filters sessions by search text", async () => {
  render(<App />);
  await userEvent.type(screen.getByRole("searchbox"), "abc");
  expect(screen.getByText("abc")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- SessionTable.test.tsx`
Expected: FAIL because the list UI does not exist.

**Step 3: Write minimal implementation**

- Fetch and display sessions from the API.
- Render the required columns.
- Add search and source filter controls.
- Add checkbox selection state and selected count.

**Step 4: Run test to verify it passes**

Run: `npm test -- SessionTable.test.tsx`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/app/App.tsx src/app/App.css src/app/api.ts src/app/components/Toolbar.tsx src/app/components/SessionTable.tsx src/app/components/SessionTable.test.tsx
git commit -m "feat: add session list ui"
```

### Task 8: Build the detail panel UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.css`
- Create: `src/app/components/SessionDetail.tsx`
- Create: `src/app/components/TimelineView.tsx`
- Create: `src/app/components/RawEventsView.tsx`
- Create: `src/app/components/SessionDetail.test.tsx`

**Step 1: Write the failing test**

Add tests for:

```tsx
it("shows summary and raw tabs for the selected session", async () => {
  render(<App />);
  expect(await screen.findByRole("tab", { name: "Summary" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument();
});
```

```tsx
it("renders an orphaned-session warning when the file is missing", async () => {
  render(<SessionDetail detail={orphanedDetail} />);
  expect(screen.getByText(/orphaned/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- SessionDetail.test.tsx`
Expected: FAIL because the detail panel does not exist.

**Step 3: Write minimal implementation**

- Load session detail when a row is selected.
- Show metadata and normalized timeline in the summary tab.
- Show paginated raw events in the raw tab.
- Render explicit loading, empty, and error states.

**Step 4: Run test to verify it passes**

Run: `npm test -- SessionDetail.test.tsx`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/app/App.tsx src/app/App.css src/app/components/SessionDetail.tsx src/app/components/TimelineView.tsx src/app/components/RawEventsView.tsx src/app/components/SessionDetail.test.tsx
git commit -m "feat: add session detail panel"
```

### Task 9: Add rename and bulk delete UI flows

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.css`
- Modify: `src/app/components/SessionTable.tsx`
- Modify: `src/app/components/Toolbar.tsx`
- Create: `src/app/components/DeleteConfirmDialog.tsx`
- Create: `src/app/components/SessionActions.test.tsx`

**Step 1: Write the failing test**

Add tests for:

```tsx
it("renames a session inline and refreshes the title", async () => {
  render(<App />);
  await userEvent.dblClick(await screen.findByText("Old title"));
  await userEvent.clear(screen.getByDisplayValue("Old title"));
  await userEvent.type(screen.getByRole("textbox"), "New title{enter}");
  expect(await screen.findByText("New title")).toBeInTheDocument();
});
```

```tsx
it("deletes selected sessions after confirmation", async () => {
  render(<App />);
  await userEvent.click(screen.getAllByRole("checkbox")[1]);
  await userEvent.click(screen.getByRole("button", { name: /delete selected/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
  expect(screen.queryByText("Deleted Session")).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- SessionActions.test.tsx`
Expected: FAIL because rename and delete flows are not implemented.

**Step 3: Write minimal implementation**

- Add inline title editing with Enter save and Escape cancel.
- Call the rename API and refresh the list/detail state.
- Add bulk delete confirmation with irreversible warning text.
- Call the delete API and remove deleted sessions from local state.

**Step 4: Run test to verify it passes**

Run: `npm test -- SessionActions.test.tsx`
Expected: PASS

**Step 5: Commit**

If this directory is a git repo:

```bash
git add src/app/App.tsx src/app/App.css src/app/components/SessionTable.tsx src/app/components/Toolbar.tsx src/app/components/DeleteConfirmDialog.tsx src/app/components/SessionActions.test.tsx
git commit -m "feat: add rename and bulk delete flows"
```

### Task 10: Final verification and run instructions

**Files:**
- Create: `README.md`
- Modify: `package.json`

**Step 1: Write the failing test**

Add a simple smoke test script entry expectation:

```ts
it("exposes dev, build, and test scripts", () => {
  expect(packageJson.scripts.dev).toBeDefined();
  expect(packageJson.scripts.build).toBeDefined();
  expect(packageJson.scripts.test).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- package-scripts.test.ts`
Expected: FAIL until package scripts and test file exist.

**Step 3: Write minimal implementation**

- Add `dev`, `build`, `test`, and `server` scripts.
- Document local startup, default Codex path, and destructive delete behavior.
- Add a note that the app targets local Codex history under the current Windows user profile.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npm run dev`
Expected: Frontend and backend start locally.

**Step 5: Commit**

If this directory is a git repo:

```bash
git add README.md package.json
git commit -m "docs: add usage instructions"
```
