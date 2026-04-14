const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  buildWindowsTerminalStartCommand,
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

test("resume launcher starts the requested Windows Terminal path through PowerShell Start-Process", async () => {
  const calls = [];
  const launcher = createSessionResumeLauncher({
    platform: "win32",
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
