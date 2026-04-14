const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { SessionStore } = require("./session-store.js");

const SESSION_ID = "019cb8fc-aec9-71d0-a87f-c6f928d4addd";
const ARCHIVED_ID = "019cb8fc-aec9-71d0-a87f-c6f928d4adde";
const ORPHAN_ID = "00000000-0000-0000-0000-000000000000";
const DETAIL_ONLY_ID = "11111111-1111-1111-1111-111111111111";

async function createFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codex-store-"));
  const sessionsDir = path.join(base, "sessions", "2026", "03", "04");
  const archivedDir = path.join(base, "archived_sessions");
  await fs.mkdir(sessionsDir, { recursive: true });
  await fs.mkdir(archivedDir, { recursive: true });

  const sessionFile = path.join(sessionsDir, `session-${SESSION_ID}.jsonl`);
  const archivedFile = path.join(archivedDir, `archived-${ARCHIVED_ID}.jsonl`);
  const detailOnlyFile = path.join(
    sessionsDir,
    `session-${DETAIL_ONLY_ID}.jsonl`
  );

  await writeJsonLines(sessionFile, [
    {
      timestamp: "2026-03-04T00:00:00Z",
      type: "session_meta",
      payload: { id: SESSION_ID, cwd: "/tmp" },
    },
    {
      timestamp: "2026-03-04T00:00:00.500Z",
      type: "event_msg",
      payload: { type: "user_message", message: "Need summary only" },
    },
    {
      timestamp: "2026-03-04T00:00:01Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Answer" }],
      },
    },
    {
      timestamp: "2026-03-04T00:00:02Z",
      type: "event_msg",
      payload: { type: "task_started", turn_id: "turn-1" },
    },
  ]);

  await writeJsonLines(archivedFile, [
    {
      timestamp: "2026-03-04T00:10:00Z",
      type: "session_meta",
      payload: { id: ARCHIVED_ID, cwd: "/tmp/archive" },
    },
    {
      timestamp: "2026-03-04T00:10:01Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Archived answer" }],
      },
    },
  ]);

  await writeJsonLines(detailOnlyFile, [
    {
      timestamp: "2026-03-04T01:30:00Z",
      type: "session_meta",
      payload: { id: DETAIL_ONLY_ID, cwd: "/tmp/detail-only" },
    },
  ]);
  await fs.utimes(
    detailOnlyFile,
    new Date("2026-03-04T01:30:00Z"),
    new Date("2026-03-04T01:30:00Z")
  );

  const indexPath = path.join(base, "session_index.jsonl");
  await writeJsonLines(indexPath, [
    {
      id: SESSION_ID,
      thread_name: "Session Title",
      updated_at: "2026-03-04T01:00:00Z",
    },
    "invalid json line",
    {
      id: ARCHIVED_ID,
      thread_name: "",
      updated_at: "2026-03-04T00:50:00Z",
    },
    {
      id: ORPHAN_ID,
      thread_name: "Orphan Title",
      updated_at: "2026-03-04T00:40:00Z",
    },
  ]);

  const historyPath = path.join(base, "history.jsonl");
  await writeJsonLines(historyPath, [
    { session_id: SESSION_ID, ts: 1, text: "First query" },
    { session_id: ARCHIVED_ID, ts: 2, text: "Archived query" },
    { session_id: ORPHAN_ID, ts: 3, text: "Orphan query" },
    { session_id: DETAIL_ONLY_ID, ts: 4, text: "Detail only query" },
  ]);

  const store = new SessionStore({ codexRoot: base });
  return {
    base,
    store,
    indexPath,
    historyPath,
    sessionFile,
    archivedFile,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

async function writeJsonLines(target, entries) {
  const lines = entries.map((entry) =>
    typeof entry === "string" ? entry : JSON.stringify(entry)
  );
  await fs.writeFile(target, lines.join("\n") + "\n", "utf8");
}

test("listSessions returns summaries with fallback titles and warnings", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const result = await fixture.store.listSessions();
  assert.ok(result.sessions.length >= 3);
  const archived = result.sessions.find((entry) => entry.sessionId === ARCHIVED_ID);
  assert.strictEqual(archived.title, "Archived query");
  const orphan = result.sessions.find((entry) => entry.sessionId === ORPHAN_ID);
  assert.strictEqual(orphan.hasDetailFile, false);
  assert.ok(result.warnings.some((w) => w.includes("session_index")));
});

test("listSessions includes sessions discovered only from detail files", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const result = await fixture.store.listSessions();
  const detailOnly = result.sessions.find(
    (entry) => entry.sessionId === DETAIL_ONLY_ID
  );
  assert.ok(detailOnly);
  assert.strictEqual(detailOnly.title, "Detail only query");
  assert.strictEqual(detailOnly.hasDetailFile, true);
  assert.strictEqual(result.sessions[0].sessionId, DETAIL_ONLY_ID);
});

test("getSessionDetail returns meta, timeline, and raw events", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const detail = await fixture.store.getSessionDetail(SESSION_ID, {
    offset: 0,
    limit: 5,
  });
  assert.strictEqual(detail.sessionId, SESSION_ID);
  assert.strictEqual(detail.meta.sessionId, SESSION_ID);
  assert.deepEqual(
    detail.timeline.map((entry) => entry.label),
    ["user", "assistant"]
  );
  assert.ok(detail.rawEvents.length >= 1);
});

test("renameSession rewrites the index", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  await fixture.store.renameSession(SESSION_ID, "Renamed Title");
  const content = await fs.readFile(fixture.indexPath, "utf8");
  assert.ok(content.includes('"thread_name":"Renamed Title"'));
});

test("deleteSessions removes files, history, and index lines", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const result = await fixture.store.deleteSessions([
    SESSION_ID,
    ORPHAN_ID,
  ]);
  assert.ok(result.deleted.includes(SESSION_ID));
  assert.ok(result.deleted.includes(ORPHAN_ID));
  await assert.rejects(async () => fs.access(fixture.sessionFile));
  const historyContent = await fs.readFile(fixture.historyPath, "utf8");
  assert.ok(!historyContent.includes(SESSION_ID));
});
