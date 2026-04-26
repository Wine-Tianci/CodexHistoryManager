"use strict";

const { spawn } = require("node:child_process");

function createBrowserLauncher(options = {}) {
  const launchProcess = options.spawn || spawn;
  const platform = options.platform || process.platform;

  return async function openBrowser(url) {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) {
      throw new Error("browser URL is required");
    }

    const { command, args } = buildOpenBrowserCommand(platform, normalizedUrl);
    const child = launchProcess(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    await waitForProcessResult(child);
  };
}

function buildOpenBrowserCommand(platform, url) {
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "start", "", url],
    };
  }
  if (platform === "darwin") {
    return {
      command: "open",
      args: [url],
    };
  }
  return {
    command: "xdg-open",
    args: [url],
  };
}

function waitForProcessResult(child) {
  if (!child || typeof child.once !== "function") {
    return Promise.resolve();
  }

  const stderrChunks = [];
  if (child.stderr && typeof child.stderr.on === "function") {
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });
  }

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const handleClose = (code) => {
      cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderrChunks.join("").trim();
      reject(new Error(detail || `browser launcher exited with code ${code}`));
    };
    const cleanup = () => {
      child.removeListener("error", handleError);
      child.removeListener("close", handleClose);
    };

    child.once("error", handleError);
    child.once("close", handleClose);
  });
}

module.exports = {
  buildOpenBrowserCommand,
  createBrowserLauncher,
};
