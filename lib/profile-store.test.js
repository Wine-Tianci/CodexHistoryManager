const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { ProfileStore } = require("./profile-store.js");

async function createFixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "codex-profile-store-"));
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(
    path.join(base, "config.toml"),
    [
      'model_provider = "Custom"',
      'model = "gpt-5.2"',
      "",
      "[model_providers.Custom]",
      'name = "Custom"',
      'base_url = "https://api.initial.example"',
      'wire_api = "responses"',
      "",
      "[features]",
      "collaboration_modes = true",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(base, "auth.json"),
    JSON.stringify(
      {
        auth_mode: "apikey",
        OPENAI_API_KEY: "sk-initial",
      },
      null,
      2,
    ),
    "utf8",
  );

  const store = new ProfileStore({ codexRoot: base });
  return {
    base,
    store,
    cleanup: () => fs.rm(base, { recursive: true, force: true }),
  };
}

test("listProfiles returns empty saved profiles and unmanaged active config by default", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const result = await fixture.store.listProfiles();

  assert.deepEqual(result.profiles, []);
  assert.equal(result.activeProfileId, null);
  assert.equal(result.lastActivatedProfileId, null);
  assert.equal(result.hasUnmanagedActiveConfig, true);
  assert.deepEqual(result.currentConfig, {
    provider: "Custom",
    baseUrl: "https://api.initial.example",
    apiKey: "sk-initial",
  });
});

test("createProfile and updateProfile persist saved profiles", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Work",
    provider: "Custom",
    apiKey: "sk-work",
    baseUrl: "https://api.work.example",
  });
  assert.ok(created.id);
  assert.equal(created.name, "Work");

  const updated = await fixture.store.updateProfile(created.id, {
    name: "Work Updated",
    provider: "Custom",
    apiKey: "sk-work-2",
    baseUrl: "https://api.work-2.example",
  });
  assert.deepEqual(updated, {
    id: created.id,
    name: "Work Updated",
    provider: "Custom",
    apiKey: "sk-work-2",
    baseUrl: "https://api.work-2.example",
  });

  const result = await fixture.store.listProfiles();
  assert.equal(result.profiles.length, 1);
  assert.deepEqual(result.profiles[0], {
    id: created.id,
    name: "Work Updated",
    provider: "Custom",
    apiKey: "sk-work-2",
    baseUrl: "https://api.work-2.example",
    isActive: false,
  });
});

test("activateProfile rewrites live config and marks the matching profile active", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Gateway",
    provider: "Custom",
    apiKey: "sk-gateway",
    baseUrl: "https://api.gateway.example",
  });

  const activated = await fixture.store.activateProfile(created.id);

  assert.equal(activated.activeProfileId, created.id);
  assert.equal(activated.lastActivatedProfileId, created.id);
  assert.equal(activated.hasUnmanagedActiveConfig, false);
  assert.equal(
    activated.profiles.find((item) => item.id === created.id)?.isActive,
    true,
  );

  const configToml = await fs.readFile(path.join(fixture.base, "config.toml"), "utf8");
  const authJson = JSON.parse(await fs.readFile(path.join(fixture.base, "auth.json"), "utf8"));

  assert.match(configToml, /base_url = "https:\/\/api\.gateway\.example"/);
  assert.match(configToml, /wire_api = "responses"/);
  assert.equal(authJson.auth_mode, "apikey");
  assert.equal(authJson.OPENAI_API_KEY, "sk-gateway");
});

test("deleteProfile removes a saved profile without mutating the live config", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  const created = await fixture.store.createProfile({
    name: "Temp",
    provider: "Custom",
    apiKey: "sk-temp",
    baseUrl: "https://api.temp.example",
  });

  await fixture.store.deleteProfile(created.id);

  const result = await fixture.store.listProfiles();
  assert.deepEqual(result.profiles, []);

  const currentConfig = await fixture.store.readCurrentConfig();
  assert.deepEqual(currentConfig, {
    provider: "Custom",
    baseUrl: "https://api.initial.example",
    apiKey: "sk-initial",
  });
});

test("createProfile defaults provider to Custom and activateProfile switches model_provider", async (t) => {
  const fixture = await createFixture();
  t.after(async () => fixture.cleanup());

  await fs.writeFile(
    path.join(fixture.base, "config.toml"),
    [
      'model_provider = "Custom"',
      'model = "gpt-5.2"',
      "",
      "[model_providers.Custom]",
      'name = "Custom"',
      'base_url = "https://api.initial.example"',
      'wire_api = "responses"',
      "",
      "[model_providers.AltProvider]",
      'name = "AltProvider"',
      'base_url = "https://api.alt-initial.example"',
      'wire_api = "responses"',
      "",
    ].join("\n"),
    "utf8",
  );

  const created = await fixture.store.createProfile({
    name: "Alt",
    apiKey: "sk-alt",
    baseUrl: "https://api.alt-target.example",
  });

  assert.equal(created.provider, "Custom");

  const updated = await fixture.store.updateProfile(created.id, {
    provider: "AltProvider",
  });

  assert.equal(updated.provider, "AltProvider");

  await fixture.store.activateProfile(created.id);

  const currentConfig = await fixture.store.readCurrentConfig();
  assert.deepEqual(currentConfig, {
    provider: "AltProvider",
    baseUrl: "https://api.alt-target.example",
    apiKey: "sk-alt",
  });

  const configToml = await fs.readFile(path.join(fixture.base, "config.toml"), "utf8");
  assert.match(configToml, /model_provider = "AltProvider"/);
  assert.match(configToml, /\[model_providers.AltProvider\][\s\S]*base_url = "https:\/\/api\.alt-target\.example"/);
});
