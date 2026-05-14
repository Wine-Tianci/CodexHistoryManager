const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { ProfileStore } = require("./profile-store.js");
const { SessionStore } = require("./session-store.js");
const { ClaudeProfileStore } = require("./claude-profile-store.js");
const { ClaudeSessionStore } = require("./claude-session-store.js");
const { createRequestHandler } = require("./request-handler.js");

async function createFixture(options = {}) {
  const codexRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-handler-"));
  const claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claude-handler-"));
  await fs.writeFile(
    path.join(codexRoot, "config.toml"),
    [
      'model_provider = "Custom"',
      "",
      "[model_providers.Custom]",
      'base_url = "https://api.initial.example"',
      'wire_api = "responses"',
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(codexRoot, "auth.json"),
    JSON.stringify({
      auth_mode: "apikey",
      OPENAI_API_KEY: "sk-initial",
    }),
    "utf8",
  );
  const profileStore = new ProfileStore({ codexRoot });
  const sessionStore = new SessionStore({ codexRoot });
  await fs.mkdir(path.join(claudeRoot, "projects", "F--workspace-Hydra"), { recursive: true });
  await fs.writeFile(
    path.join(claudeRoot, "settings.json"),
    JSON.stringify(
      {
        env: {
          AWS_REGION: "us-east-1",
        },
        model: "sonnet",
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(claudeRoot, "history.jsonl"),
    `${JSON.stringify({
      display: "Create CLAUDE.md",
      timestamp: 1778659845962,
      project: "F:\\workspace_Hydra",
      sessionId: "11111111-1111-4111-8111-111111111111",
    })}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(
      claudeRoot,
      "projects",
      "F--workspace-Hydra",
      "11111111-1111-4111-8111-111111111111.jsonl",
    ),
    [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hello" },
        timestamp: "2026-05-13T07:56:12.805Z",
        cwd: "F:\\workspace_Hydra",
        sessionId: "11111111-1111-4111-8111-111111111111",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content: [{ type: "text", text: "hi" }],
        },
        timestamp: "2026-05-13T07:56:16.731Z",
        sessionId: "11111111-1111-4111-8111-111111111111",
      }),
    ].join("\n") + "\n",
    "utf8",
  );
  const claudeProfileStore = new ClaudeProfileStore({ claudeRoot });
  const claudeSessionStore = new ClaudeSessionStore({ claudeRoot });
  const resumeLauncher =
    options.resumeLauncher ||
    (async () => {
      throw new Error("resume launcher not configured");
    });
  const claudeResumeLauncher =
    options.claudeResumeLauncher ||
    (async () => {
      throw new Error("claude resume launcher not configured");
    });
  const server = http.createServer(
    createRequestHandler({
      sessionStore,
      profileStore,
      claudeSessionStore,
      claudeProfileStore,
      resumeLauncher,
      claudeResumeLauncher,
      publicDir: path.join(process.cwd(), "public"),
    }),
  );
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return {
    codexRoot,
    claudeRoot,
    profileStore,
    claudeProfileStore,
    baseUrl: `http://127.0.0.1:${address.port}`,
    cleanup: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await fs.rm(codexRoot, { recursive: true, force: true });
      await fs.rm(claudeRoot, { recursive: true, force: true });
    },
  };
}

test("POST /api/sessions/:id/resume launches the requested session", async (t) => {
  const calls = [];
  const fixture = await createFixture({
    resumeLauncher: async (sessionId) => {
      calls.push(sessionId);
      return { ok: true };
    },
  });
  t.after(async () => fixture.cleanup());

  const sessionId = "019d89e0-13c2-7251-a3a9-993274ff5ad7";
  const response = await fetch(
    `${fixture.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/resume`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [sessionId]);
  assert.deepEqual(payload, { sessionId, launched: true });
});

test("POST /api/claude/sessions/:id/resume launches the requested Claude session", async (t) => {
  const calls = [];
  const fixture = await createFixture({
    claudeResumeLauncher: async (sessionId, options) => {
      calls.push({ sessionId, options });
      return { ok: true };
    },
  });
  t.after(async () => fixture.cleanup());

  const sessionId = "11111111-1111-4111-8111-111111111111";
  const response = await fetch(
    `${fixture.baseUrl}/api/claude/sessions/${encodeURIComponent(sessionId)}/resume`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      sessionId,
      options: { cwd: "F:\\workspace_Hydra" },
    },
  ]);
  assert.deepEqual(payload, { sessionId, launched: true });
});

test("GET /api/profiles returns the saved profile list and active status", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const created = await fixture.profileStore.createProfile({
    name: "Work",
    apiKey: "sk-work",
    baseUrl: "https://api.work.example",
  });
  await fixture.profileStore.activateProfile(created.id);

  const response = await fetch(`${fixture.baseUrl}/api/profiles`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.activeProfileId, created.id);
  assert.equal(payload.profiles.length, 1);
  assert.equal(payload.profiles[0].isActive, true);
});

test("POST /api/profiles creates a profile and GET /api/profiles/:id returns the detail", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const createResponse = await fetch(`${fixture.baseUrl}/api/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Gateway",
      apiKey: "sk-gateway",
      baseUrl: "https://api.gateway.example",
      model: "gpt-5.5",
      modelReasoningEffort: "high",
    }),
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.ok(created.id);

  const detailResponse = await fetch(`${fixture.baseUrl}/api/profiles/${encodeURIComponent(created.id)}`);
  const detail = await detailResponse.json();

  assert.equal(detailResponse.status, 200);
  assert.equal(detail.name, "Gateway");
  assert.equal(detail.apiKey, "sk-gateway");
  assert.equal(detail.baseUrl, "https://api.gateway.example");
  assert.equal(detail.model, "gpt-5.5");
  assert.equal(detail.modelReasoningEffort, "high");
});

test("POST /api/profiles/:id/activate rewrites the live config", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const created = await fixture.profileStore.createProfile({
    name: "Switch",
    apiKey: "sk-switch",
    baseUrl: "https://api.switch.example",
  });

  const response = await fetch(
    `${fixture.baseUrl}/api/profiles/${encodeURIComponent(created.id)}/activate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.activeProfileId, created.id);

  const configToml = await fs.readFile(path.join(fixture.codexRoot, "config.toml"), "utf8");
  const authJson = JSON.parse(await fs.readFile(path.join(fixture.codexRoot, "auth.json"), "utf8"));

  assert.match(configToml, /base_url = "https:\/\/api\.switch\.example"/);
  assert.equal(authJson.OPENAI_API_KEY, "sk-switch");
});

test("PATCH /api/profiles/:id updates a saved profile", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const created = await fixture.profileStore.createProfile({
    name: "Before",
    apiKey: "sk-before",
    baseUrl: "https://api.before.example",
  });

  const response = await fetch(`${fixture.baseUrl}/api/profiles/${encodeURIComponent(created.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "After",
      apiKey: "sk-after",
      baseUrl: "https://api.after.example",
      model: "gpt-5.4",
      modelReasoningEffort: "medium",
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.name, "After");
  assert.equal(payload.apiKey, "sk-after");
  assert.equal(payload.baseUrl, "https://api.after.example");
  assert.equal(payload.model, "gpt-5.4");
  assert.equal(payload.modelReasoningEffort, "medium");
});

test("DELETE /api/profiles/:id removes a saved profile", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  const created = await fixture.profileStore.createProfile({
    name: "Delete Me",
    apiKey: "sk-delete",
    baseUrl: "https://api.delete.example",
  });

  const response = await fetch(`${fixture.baseUrl}/api/profiles/${encodeURIComponent(created.id)}`, {
    method: "DELETE",
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.profileId, created.id);

  const listResponse = await fetch(`${fixture.baseUrl}/api/profiles`);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.profiles.length, 0);
});

test("Claude profile routes create, fetch, and activate a Claude profile", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const createResponse = await fetch(`${fixture.baseUrl}/api/claude/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Claude Bedrock",
      baseUrl: "https://example.test/bedrock",
      apiKey: "sk-claude",
      defaultModel: "claude-haiku-4-5-20251001",
    }),
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.ok(created.id);

  const detailResponse = await fetch(
    `${fixture.baseUrl}/api/claude/profiles/${encodeURIComponent(created.id)}`,
  );
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.name, "Claude Bedrock");
  assert.equal(detail.baseUrl, "https://example.test/bedrock");
  assert.equal(detail.apiKey, "sk-claude");
  assert.equal(detail.defaultModel, "claude-haiku-4-5-20251001");

  const activateResponse = await fetch(
    `${fixture.baseUrl}/api/claude/profiles/${encodeURIComponent(created.id)}/activate`,
    {
      method: "POST",
    },
  );
  const activated = await activateResponse.json();

  assert.equal(activateResponse.status, 200);
  assert.equal(activated.activeProfileId, created.id);

  const settings = JSON.parse(
    await fs.readFile(path.join(fixture.claudeRoot, "settings.json"), "utf8"),
  );
  assert.equal(settings.model, "haiku");
  assert.equal(settings.env.ANTHROPIC_BEDROCK_BASE_URL, "https://example.test/bedrock");
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "sk-claude");
  assert.equal(settings.env.ANTHROPIC_MODEL, "claude-haiku-4-5-20251001");
  assert.equal(settings.env.AWS_REGION, "us-east-1");
});

test("Claude session routes list and return session detail", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const listResponse = await fetch(`${fixture.baseUrl}/api/claude/sessions`);
  const listPayload = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.sessions.length, 1);
  assert.equal(listPayload.sessions[0].sessionId, "11111111-1111-4111-8111-111111111111");

  const detailResponse = await fetch(
    `${fixture.baseUrl}/api/claude/sessions/11111111-1111-4111-8111-111111111111`,
  );
  const detailPayload = await detailResponse.json();

  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.sessionId, "11111111-1111-4111-8111-111111111111");
  assert.equal(detailPayload.timeline.length, 2);
  assert.equal(detailPayload.model, "claude-haiku-4-5-20251001");
});

test("DELETE /api/claude/sessions removes Claude transcript files", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const response = await fetch(`${fixture.baseUrl}/api/claude/sessions`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionIds: ["11111111-1111-4111-8111-111111111111"],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    deleted: ["11111111-1111-4111-8111-111111111111"],
    errors: [],
  });
});

test("static pages expose navigation between session and profile management", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const indexResponse = await fetch(`${fixture.baseUrl}/`);
  const indexHtml = await indexResponse.text();
  const profilesResponse = await fetch(`${fixture.baseUrl}/profiles.html`);
  const profilesHtml = await profilesResponse.text();
  const appResponse = await fetch(`${fixture.baseUrl}/app.js`);
  const appJs = await appResponse.text();

  assert.equal(indexResponse.status, 200);
  assert.match(indexHtml, /<title>历史管理<\/title>/);
  assert.match(indexHtml, /<h1>历史管理<\/h1>/);
  assert.match(indexHtml, /AI 类型/);
  assert.match(indexHtml, /会话概览/);
  assert.match(indexHtml, /Codex/);
  assert.match(indexHtml, /Claude/);
  assert.match(indexHtml, /profiles\.html/);
  assert.match(indexHtml, />方案管理<\/a>/);
  assert.ok(indexHtml.indexOf(">搜索<") < indexHtml.indexOf(">AI 类型<"));
  assert.doesNotMatch(indexHtml, /id="source-filter"/);
  assert.doesNotMatch(indexHtml, />来源<\/span>/);
  assert.doesNotMatch(indexHtml, /Claude History/);
  assert.doesNotMatch(indexHtml, /Claude Profiles/);
  assert.equal(appResponse.status, 200);
  assert.doesNotMatch(appJs, /\["来源"/);
  assert.doesNotMatch(appJs, /session\.source \|\| "sessions"/);
  assert.equal(profilesResponse.status, 200);
  assert.match(profilesHtml, /<title>方案管理<\/title>/);
  assert.match(profilesHtml, /<h1>方案管理<\/h1>/);
  assert.match(profilesHtml, /AI 类型/);
  assert.match(profilesHtml, /当前配置/);
  assert.match(profilesHtml, /Codex/);
  assert.match(profilesHtml, /Claude/);
  assert.match(profilesHtml, /index\.html/);
  assert.match(profilesHtml, />历史管理<\/a>/);
  assert.doesNotMatch(profilesHtml, />返回会话管理<\/a>/);
  assert.doesNotMatch(profilesHtml, /Claude Profiles/);
  assert.doesNotMatch(profilesHtml, /Codex History/);
});
test("legacy Claude static pages redirect to unified pages", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const claudeResponse = await fetch(`${fixture.baseUrl}/claude.html`);
  const claudeHtml = await claudeResponse.text();
  const claudeProfilesResponse = await fetch(`${fixture.baseUrl}/claude-profiles.html`);
  const claudeProfilesHtml = await claudeProfilesResponse.text();

  assert.equal(claudeResponse.status, 200);
  assert.match(claudeHtml, /<title>正在进入历史管理<\/title>/);
  assert.match(claudeHtml, /url=\.\/index\.html/);
  assert.match(claudeHtml, />进入历史管理<\/a>/);
  assert.equal(claudeProfilesResponse.status, 200);
  assert.match(claudeProfilesHtml, /<title>正在进入方案管理<\/title>/);
  assert.match(claudeProfilesHtml, /url=\.\/profiles\.html/);
  assert.match(claudeProfilesHtml, />进入方案管理<\/a>/);
});
