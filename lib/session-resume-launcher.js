"use strict";

const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_WINDOWS_TERMINAL_PATH = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "Microsoft",
  "WindowsApps",
  "wt.exe",
);

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createSessionResumeLauncher(options = {}) {
  return createTerminalResumeLauncher(options, buildWindowsTerminalStartCommand);
}

function createClaudeSessionResumeLauncher(options = {}) {
  return createTerminalResumeLauncher(options, buildClaudeWindowsTerminalStartCommand);
}

function createTerminalResumeLauncher(options = {}, buildCommand) {
  const launchProcess = options.spawn || spawn;
  const platform = options.platform || process.platform;
  const windowsTerminalPath = options.windowsTerminalPath || DEFAULT_WINDOWS_TERMINAL_PATH;

  return async function resumeSession(sessionId, launchOptions = {}) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!SESSION_ID_PATTERN.test(normalizedSessionId)) {
      throw new Error("invalid session id");
    }
    if (platform !== "win32") {
      throw new Error("session resume is only supported on Windows");
    }

    const child = launchProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        buildCommand(windowsTerminalPath, normalizedSessionId, launchOptions),
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );

    await waitForProcessResult(child);

    return {
      sessionId: normalizedSessionId,
      launched: true,
    };
  };
}

function waitForSuccessfulSpawn(child) {
  if (!child || typeof child.once !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleSpawn = () => {
      cleanup();
      resolve();
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      child.removeListener("spawn", handleSpawn);
      child.removeListener("error", handleError);
    };

    child.once("spawn", handleSpawn);
    child.once("error", handleError);
  });
}

function buildWindowsTerminalStartCommand(windowsTerminalPath, sessionId) {
  return buildTerminalStartCommand(windowsTerminalPath, [
    "new-tab",
    "cmd.exe",
    "/k",
    "codex",
    "resume",
    sessionId,
  ]);
}

function buildClaudeWindowsTerminalStartCommand(windowsTerminalPath, sessionId, options = {}) {
  const cwd = normalizeOptionalString(options.cwd);
  return buildTerminalStartCommand(windowsTerminalPath, [
    "new-tab",
    ...(cwd ? ["-d", cwd] : []),
    "cmd.exe",
    "/k",
    "claude",
    "--resume",
    sessionId,
  ]);
}

function buildTerminalStartCommand(windowsTerminalPath, args) {
  const filePath = quotePowerShellLiteral(windowsTerminalPath);
  const argList = args.map((value) => quotePowerShellLiteral(value)).join(",");
  return `Start-Process -FilePath ${filePath} -ArgumentList @(${argList})`;
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
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
      reject(new Error(detail || `launcher exited with code ${code}`));
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
  buildClaudeWindowsTerminalStartCommand,
  buildWindowsTerminalStartCommand,
  createClaudeSessionResumeLauncher,
  createSessionResumeLauncher,
};
