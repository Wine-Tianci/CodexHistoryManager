const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { ClaudeProfileStore } = require("./claude-profile-store.js");

async function createFixture() {
  const claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claude-profile-store-"));
  await fs.mkdir(claudeRoot, { recursive: true });
  await fs.writeFile(
    path.join(claudeRoot, "settings.json"),
    JSON.stringify(
      {
        theme: "dark",
        env: {
          AWS_REGION: "us-east-1",
          EXTRA_FLAG: "keep-me",
        },
        model: "sonnet",
      },
      null,
      2,
    ),
    "utf8",
  );

  const store = new ClaudeProfileStore({ claudeRoot });
  return {
    claudeRoot,
    store,
    cleanup: () => fs.rm(claudeRoot, { recursive: true, force: true }),
  };
}

test("listProfiles returns empty profiles and current Claude business config by default", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const result = await fixture.store.listProfiles();

  assert.deepEqual(result.profiles, []);
  assert.equal(result.activeProfileId, null);
  assert.equal(result.lastActivatedProfileId, null);
  assert.equal(result.hasUnmanagedActiveConfig, false);
  assert.deepEqual(result.currentConfig, {
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
  });
});

test("createProfile, updateProfile, and getProfile persist Claude business fields", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Claude Work",
    baseUrl: " https://example.test/bedrock ",
    apiKey: " sk-test ",
    defaultModel: " us.anthropic.claude-haiku-4-5-20251001-v1:0 ",
  });

  assert.ok(created.id);
  assert.equal(created.name, "Claude Work");
  assert.equal(created.baseUrl, "https://example.test/bedrock");
  assert.equal(created.apiKey, "sk-test");
  assert.equal(created.defaultModel, "us.anthropic.claude-haiku-4-5-20251001-v1:0");

  const updated = await fixture.store.updateProfile(created.id, {
    baseUrl: "https://example.test/sonnet",
    apiKey: "sk-updated",
    defaultModel: "us.anthropic.claude-sonnet-4-5-20251001-v1:0",
  });

  assert.equal(updated.name, "Claude Work");
  assert.equal(updated.baseUrl, "https://example.test/sonnet");
  assert.equal(updated.apiKey, "sk-updated");
  assert.equal(updated.defaultModel, "us.anthropic.claude-sonnet-4-5-20251001-v1:0");

  const loaded = await fixture.store.getProfile(created.id);
  assert.equal(loaded.baseUrl, "https://example.test/sonnet");
  assert.equal(loaded.apiKey, "sk-updated");
  assert.equal(loaded.defaultModel, "us.anthropic.claude-sonnet-4-5-20251001-v1:0");

  const result = await fixture.store.listProfiles();
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].baseUrl, "https://example.test/sonnet");
  assert.equal(result.profiles[0].apiKey, "sk-updated");
  assert.equal(result.profiles[0].defaultModel, "us.anthropic.claude-sonnet-4-5-20251001-v1:0");
});

test("readCurrentConfig maps Claude settings env into business fields", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  await fs.writeFile(
    path.join(fixture.claudeRoot, "settings.json"),
    JSON.stringify(
      {
        env: {
          ANTHROPIC_BEDROCK_BASE_URL: "https://example.test/bedrock",
          ANTHROPIC_AUTH_TOKEN: "sk-test",
          ANTHROPIC_MODEL: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        },
        model: "haiku",
      },
      null,
      2,
    ),
    "utf8",
  );

  assert.deepEqual(await fixture.store.readCurrentConfig(), {
    baseUrl: "https://example.test/bedrock",
    apiKey: "sk-test",
    defaultModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  });
});

test("readCurrentConfig tolerates a UTF-8 BOM in settings.json", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  await fs.writeFile(
    path.join(fixture.claudeRoot, "settings.json"),
    `\uFEFF${JSON.stringify({
      env: {
        ANTHROPIC_BEDROCK_BASE_URL: "https://example.test/bedrock",
        ANTHROPIC_AUTH_TOKEN: "sk-test",
        ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
      },
    })}`,
    "utf8",
  );

  assert.deepEqual(await fixture.store.readCurrentConfig(), {
    baseUrl: "https://example.test/bedrock",
    apiKey: "sk-test",
    defaultModel: "claude-haiku-4-5-20251001",
  });
});

test("listProfiles tolerates legacy Claude profile records with raw env fields", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  await fs.writeFile(
    path.join(fixture.claudeRoot, "ai-agent-deck.profiles.json"),
    JSON.stringify(
      {
        version: 1,
        profiles: [
          {
            id: "legacy-profile",
            name: "Legacy Claude",
            model: "haiku",
            env: {
              ANTHROPIC_AUTH_TOKEN: "sk-legacy",
              ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await fixture.store.listProfiles();

  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].id, "legacy-profile");
  assert.equal(result.profiles[0].name, "Legacy Claude");
  assert.equal(result.profiles[0].baseUrl, "");
  assert.equal(result.profiles[0].apiKey, "sk-legacy");
  assert.equal(result.profiles[0].defaultModel, "claude-haiku-4-5-20251001");
});

test("createProfile still rejects incomplete new Claude business profiles", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  await assert.rejects(
    fixture.store.createProfile({
      name: "Incomplete",
      apiKey: "sk-test",
      defaultModel: "claude-haiku-4-5-20251001",
    }),
    /baseUrl is required/,
  );
});

test("activateProfile writes mapped Claude settings while preserving unrelated settings", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Bedrock",
    baseUrl: "https://example.test/bedrock",
    apiKey: "sk-test",
    defaultModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  });

  const activated = await fixture.store.activateProfile(created.id);
  const settings = JSON.parse(
    await fs.readFile(path.join(fixture.claudeRoot, "settings.json"), "utf8"),
  );

  assert.equal(activated.activeProfileId, created.id);
  assert.equal(activated.lastActivatedProfileId, created.id);
  assert.equal(settings.env.ANTHROPIC_BEDROCK_BASE_URL, "https://example.test/bedrock");
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "sk-test");
  assert.equal(settings.env.ANTHROPIC_MODEL, "us.anthropic.claude-haiku-4-5-20251001-v1:0");
  assert.equal(settings.model, "haiku");
  assert.equal(settings.env.AWS_REGION, "us-east-1");
  assert.equal(settings.env.EXTRA_FLAG, "keep-me");
  assert.equal(settings.theme, "dark");
});

test("updateProfile rewrites live Claude settings when editing the active profile", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Bedrock",
    baseUrl: "https://example.test/bedrock",
    apiKey: "sk-test",
    defaultModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  });
  await fixture.store.activateProfile(created.id);

  await fixture.store.updateProfile(created.id, {
    name: "Bedrock Updated",
    baseUrl: "https://example.test/sonnet",
    apiKey: "sk-updated",
    defaultModel: "us.anthropic.claude-sonnet-4-5-20251001-v1:0",
  });

  const settings = JSON.parse(
    await fs.readFile(path.join(fixture.claudeRoot, "settings.json"), "utf8"),
  );
  const listed = await fixture.store.listProfiles();

  assert.equal(settings.env.ANTHROPIC_BEDROCK_BASE_URL, "https://example.test/sonnet");
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "sk-updated");
  assert.equal(settings.env.ANTHROPIC_MODEL, "us.anthropic.claude-sonnet-4-5-20251001-v1:0");
  assert.equal(settings.model, "sonnet");
  assert.equal(settings.env.AWS_REGION, "us-east-1");
  assert.equal(settings.env.EXTRA_FLAG, "keep-me");
  assert.equal(settings.theme, "dark");
  assert.equal(listed.activeProfileId, created.id);
  assert.equal(listed.profiles.find((profile) => profile.id === created.id)?.isActive, true);
});

test("readCurrentConfig returns empty values when settings.json is missing", async (t) => {
  const claudeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claude-profile-store-empty-"));
  const store = new ClaudeProfileStore({ claudeRoot });
  t.after(async () => fs.rm(claudeRoot, { recursive: true, force: true }));

  const currentConfig = await store.readCurrentConfig();

  assert.deepEqual(currentConfig, {
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
  });
});

test("activateProfile rejects malformed settings.json", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());
  await fs.writeFile(path.join(fixture.claudeRoot, "settings.json"), "{bad json", "utf8");

  const created = await fixture.store.createProfile({
    name: "Broken",
    baseUrl: "https://example.test/bedrock",
    apiKey: "sk-test",
    defaultModel: "claude-haiku-4-5-20251001",
  });

  await assert.rejects(
    async () => fixture.store.activateProfile(created.id),
    /settings\.json/,
  );
});
