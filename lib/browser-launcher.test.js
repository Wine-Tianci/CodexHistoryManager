const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createBrowserLauncher } = require("./browser-launcher.js");

test("browser launcher opens the requested URL with the Windows default browser", async () => {
  const calls = [];
  const launcher = createBrowserLauncher({
    platform: "win32",
    spawn(command, args, options) {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      calls.push({ command, args, options });
      process.nextTick(() => child.emit("close", 0));
      return child;
    },
  });

  await launcher("http://localhost:4173");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "cmd.exe");
  assert.deepEqual(calls[0].args, ["/c", "start", "", "http://localhost:4173"]);
  assert.deepEqual(calls[0].options, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
});

test("browser launcher rejects when the browser command fails", async () => {
  const launcher = createBrowserLauncher({
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
    launcher("http://localhost:4173"),
    /Access is denied\./,
  );
});
