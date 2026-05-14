const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { ClaudeSessionStore } = require("./claude-session-store.js");

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

async function createFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "claude-session-store-"));
  const projectDir = path.join(base, "projects", "F--workspace-Hydra");
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(base, "history.jsonl"),
    [
      JSON.stringify({
        display: "Create CLAUDE.md",
        timestamp: 1778659845962,
        project: "F:\\workspace_Hydra",
        sessionId: SESSION_ID,
      }),
      JSON.stringify({
        display: "ignored",
        timestamp: 1778659845963,
        project: "F:\\workspace_Hydra",
        sessionId: "22222222-2222-4222-8222-222222222222",
      }),
    ].join("\n") + "\n",
    "utf8",
  );

  const transcriptPath = path.join(projectDir, `${SESSION_ID}.jsonl`);
  await fs.writeFile(
    transcriptPath,
    [
      JSON.stringify({
        type: "permission-mode",
        permissionMode: "default",
        sessionId: SESSION_ID,
      }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hello" },
        timestamp: "2026-05-13T07:56:12.805Z",
        cwd: "F:\\workspace_Hydra",
        sessionId: SESSION_ID,
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: "hi" }],
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 3,
            output_tokens: 5,
          },
        },
        timestamp: "2026-05-13T07:56:16.731Z",
        sessionId: SESSION_ID,
      }),
      "{bad json",
    ].join("\n") + "\n",
    "utf8",
  );

  const store = new ClaudeSessionStore({ claudeRoot: base });
  return {
    base,
    store,
    transcriptPath,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

test("listSessions discovers Claude project transcripts", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const result = await fixture.store.listSessions();

  assert.equal(result.sessions.length, 1);
  assert.deepEqual(result.sessions[0], {
    sessionId: SESSION_ID,
    projectKey: "F--workspace-Hydra",
    project: "F:\\workspace_Hydra",
    path: "F:\\workspace_Hydra",
    title: "Create CLAUDE.md",
    updatedAt: result.sessions[0].updatedAt,
    messageCount: 2,
    model: "claude-haiku-4-5-20251001",
    usage: {
      totalTokens: 18,
      inputTokens: 10,
      cachedInputTokens: 3,
      outputTokens: 5,
      reasoningOutputTokens: 0,
    },
  });
  assert.ok(result.warnings.some((warning) => warning.includes(".jsonl line 4")));
});

test("getSessionDetail returns normalized meta, timeline, raw events, and warnings", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const detail = await fixture.store.getSessionDetail(SESSION_ID);

  assert.equal(detail.sessionId, SESSION_ID);
  assert.deepEqual(detail.meta, {
    sessionId: SESSION_ID,
    cwd: "F:\\workspace_Hydra",
    projectKey: "F--workspace-Hydra",
    path: "F:\\workspace_Hydra",
  });
  assert.deepEqual(
    detail.timeline.map((entry) => entry.label),
    ["user", "assistant"],
  );
  assert.equal(detail.totalEvents, 3);
  assert.equal(detail.rawEvents.length, 3);
  assert.equal(detail.model, "claude-haiku-4-5-20251001");
  assert.deepEqual(detail.usage, {
    totalTokens: 18,
    inputTokens: 10,
    cachedInputTokens: 3,
    outputTokens: 5,
    reasoningOutputTokens: 0,
  });
  assert.ok(detail.warnings.some((warning) => warning.includes(".jsonl line 4")));
});

test("listSessions returns empty result when Claude root is missing", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "claude-session-store-empty-"));
  await fs.rm(base, { recursive: true, force: true });
  const store = new ClaudeSessionStore({ claudeRoot: base });
  t.after(async () => fs.rm(base, { recursive: true, force: true }).catch(() => {}));

  const result = await store.listSessions();

  assert.deepEqual(result, { sessions: [], warnings: [] });
});

test("deleteSessions removes Claude transcript files", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const result = await fixture.store.deleteSessions([SESSION_ID]);

  assert.deepEqual(result, { deleted: [SESSION_ID], errors: [] });
  await assert.rejects(async () => fs.access(fixture.transcriptPath));
});
