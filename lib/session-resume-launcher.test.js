const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  buildClaudeWindowsTerminalStartCommand,
  buildWindowsTerminalStartCommand,
  createClaudeSessionResumeLauncher,
  createSessionResumeLauncher,
} = require("./session-resume-launcher.js");

test("buildWindowsTerminalStartCommand builds a Start-Process call for the requested terminal path", () => {
  const sessionId = "019d89e0-13c2-7251-a3a9-993274ff5ad7";
  const command = buildWindowsTerminalStartCommand(
    "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
    sessionId,
  );

  assert.equal(
    command,
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','cmd.exe','/k','codex','resume','019d89e0-13c2-7251-a3a9-993274ff5ad7')",
  );
});

test("buildClaudeWindowsTerminalStartCommand builds a Claude resume command", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const command = buildClaudeWindowsTerminalStartCommand(
    "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
    sessionId,
  );

  assert.equal(
    command,
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','cmd.exe','/k','claude','--resume','11111111-1111-4111-8111-111111111111')",
  );
});

test("buildClaudeWindowsTerminalStartCommand starts Claude resume in the session cwd", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const command = buildClaudeWindowsTerminalStartCommand(
    "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe",
    sessionId,
    { cwd: "F:\\workspace_Hydra" },
  );

  assert.equal(
    command,
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','-d','F:\\workspace_Hydra','cmd.exe','/k','claude','--resume','11111111-1111-4111-8111-111111111111')",
  );
});

test("resume launcher starts the requested Windows Terminal path through PowerShell Start-Process", async () => {
  const calls = [];
  const windowsTerminalPath = "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";
  const launcher = createSessionResumeLauncher({
    platform: "win32",
    windowsTerminalPath,
    spawn(command, args, options) {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      calls.push({ command, args, options });
      process.nextTick(() => child.emit("close", 0));
      return child;
    },
  });

  const sessionId = "019d89e0-13c2-7251-a3a9-993274ff5ad7";
  const result = await launcher(sessionId);

  assert.deepEqual(result, {
    sessionId,
    launched: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "powershell.exe");
  assert.deepEqual(calls[0].args, [
    "-NoProfile",
    "-Command",
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','cmd.exe','/k','codex','resume','019d89e0-13c2-7251-a3a9-993274ff5ad7')",
  ]);
  assert.deepEqual(calls[0].options, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
});

test("Claude resume launcher starts claude --resume in Windows Terminal", async () => {
  const calls = [];
  const windowsTerminalPath = "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";
  const launcher = createClaudeSessionResumeLauncher({
    platform: "win32",
    windowsTerminalPath,
    spawn(command, args, options) {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      calls.push({ command, args, options });
      process.nextTick(() => child.emit("close", 0));
      return child;
    },
  });

  const sessionId = "11111111-1111-4111-8111-111111111111";
  const result = await launcher(sessionId);

  assert.deepEqual(result, {
    sessionId,
    launched: true,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    "-NoProfile",
    "-Command",
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','cmd.exe','/k','claude','--resume','11111111-1111-4111-8111-111111111111')",
  ]);
});

test("Claude resume launcher passes the session cwd to Windows Terminal", async () => {
  const calls = [];
  const windowsTerminalPath = "C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe";
  const launcher = createClaudeSessionResumeLauncher({
    platform: "win32",
    windowsTerminalPath,
    spawn(command, args, options) {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      calls.push({ command, args, options });
      process.nextTick(() => child.emit("close", 0));
      return child;
    },
  });

  const sessionId = "11111111-1111-4111-8111-111111111111";
  await launcher(sessionId, { cwd: "F:\\workspace_Hydra" });

  assert.deepEqual(calls[0].args, [
    "-NoProfile",
    "-Command",
    "Start-Process -FilePath 'C:\\Users\\xiaotianci\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe' -ArgumentList @('new-tab','-d','F:\\workspace_Hydra','cmd.exe','/k','claude','--resume','11111111-1111-4111-8111-111111111111')",
  ]);
});

test("resume launcher rejects if the terminal process cannot be spawned", async () => {
  const launcher = createSessionResumeLauncher({
    platform: "win32",
    spawn() {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => child.emit("error", new Error("spawn failed")));
      return child;
    },
  });

  await assert.rejects(
    launcher("019d89e0-13c2-7251-a3a9-993274ff5ad7"),
    /spawn failed/,
  );
});

test("resume launcher rejects if PowerShell exits with an error", async () => {
  const launcher = createSessionResumeLauncher({
    platform: "win32",
    spawn() {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stderr.emit("data", "Access is denied.");
        child.emit("close", 1);
      });
      return child;
    },
  });

  await assert.rejects(
    launcher("019d89e0-13c2-7251-a3a9-993274ff5ad7"),
    /Access is denied\./,
  );
});
