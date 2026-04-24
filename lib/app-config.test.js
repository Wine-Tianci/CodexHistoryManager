const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

const { readAppConfig } = require("./app-config.js");

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "codex-app-config-"));
}

test("readAppConfig returns terminalPath from a valid config file", async (t) => {
  const tempDir = await createTempDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const configPath = path.join(tempDir, "codex-manager.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      terminalPath: "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
    }),
    "utf8",
  );

  const config = await readAppConfig({ configPath });

  assert.deepEqual(config, {
    terminalPath: "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
  });
});

test("readAppConfig returns defaults when the config file is missing", async () => {
  const config = await readAppConfig({
    configPath: path.join(os.tmpdir(), "definitely-missing-codex-manager.config.json"),
  });

  assert.deepEqual(config, {
    terminalPath: null,
  });
});

test("readAppConfig reads legacy config when the renamed config is missing", async (t) => {
  const tempDir = await createTempDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const configPath = path.join(tempDir, "codex-manager.config.json");
  const legacyConfigPath = path.join(tempDir, "codex-history-manager.config.json");
  await fs.writeFile(
    legacyConfigPath,
    JSON.stringify({
      terminalPath: "C:\\Windows\\System32\\cmd.exe",
    }),
    "utf8",
  );

  const config = await readAppConfig({ configPath, legacyConfigPath });

  assert.deepEqual(config, {
    terminalPath: "C:\\Windows\\System32\\cmd.exe",
  });
});

test("readAppConfig rejects invalid JSON", async (t) => {
  const tempDir = await createTempDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const configPath = path.join(tempDir, "codex-manager.config.json");
  await fs.writeFile(configPath, "{ invalid json", "utf8");

  await assert.rejects(
    readAppConfig({ configPath }),
    /invalid tool config JSON/,
  );
});

test("readAppConfig ignores blank terminalPath values", async (t) => {
  const tempDir = await createTempDir();
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const configPath = path.join(tempDir, "codex-manager.config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      terminalPath: "   ",
    }),
    "utf8",
  );

  const config = await readAppConfig({ configPath });

  assert.deepEqual(config, {
    terminalPath: null,
  });
});
