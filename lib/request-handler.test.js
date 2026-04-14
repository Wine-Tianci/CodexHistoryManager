const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { ProfileStore } = require("./profile-store.js");
const { SessionStore } = require("./session-store.js");
const { createRequestHandler } = require("./request-handler.js");

async function createFixture(options = {}) {
  const codexRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-handler-"));
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
  const resumeLauncher =
    options.resumeLauncher ||
    (async () => {
      throw new Error("resume launcher not configured");
    });
  const server = http.createServer(
    createRequestHandler({
      sessionStore,
      profileStore,
      resumeLauncher,
      publicDir: path.join(process.cwd(), "public"),
    }),
  );
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return {
    codexRoot,
    profileStore,
    baseUrl: `http://127.0.0.1:${address.port}`,
    cleanup: async () => {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await fs.rm(codexRoot, { recursive: true, force: true });
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
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.name, "After");
  assert.equal(payload.apiKey, "sk-after");
  assert.equal(payload.baseUrl, "https://api.after.example");
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

test("static pages expose navigation between session and profile management", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const indexResponse = await fetch(`${fixture.baseUrl}/`);
  const indexHtml = await indexResponse.text();
  const profilesResponse = await fetch(`${fixture.baseUrl}/profiles.html`);
  const profilesHtml = await profilesResponse.text();

  assert.equal(indexResponse.status, 200);
  assert.match(indexHtml, /profiles\.html/);
  assert.equal(profilesResponse.status, 200);
  assert.match(profilesHtml, /index\.html/);
});
