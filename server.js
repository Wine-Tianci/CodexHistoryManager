const http = require("node:http");
const path = require("node:path");
const { readAppConfig } = require("./lib/app-config.js");
const { SessionStore } = require("./lib/session-store.js");
const { ProfileStore } = require("./lib/profile-store.js");
const { ClaudeSessionStore } = require("./lib/claude-session-store.js");
const { ClaudeProfileStore } = require("./lib/claude-profile-store.js");
const { createRequestHandler } = require("./lib/request-handler.js");
const {
  createClaudeSessionResumeLauncher,
  createSessionResumeLauncher,
} = require("./lib/session-resume-launcher.js");
const { createBrowserLauncher } = require("./lib/browser-launcher.js");
const { listenWithPortFallback } = require("./lib/server-listener.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const APP_CONFIG_PATH = path.join(__dirname, "ai-agent-deck.config.json");
const PORT = process.env.PORT || 4173;
const CODEX_ROOT = process.env.CODEX_ROOT;
const CLAUDE_ROOT = process.env.CLAUDE_ROOT;

bootstrap().catch((error) => {
  console.error("Failed to start AI Agent Deck:", error.message || error);
  process.exitCode = 1;
});

async function bootstrap() {
  const appConfig = await readAppConfig({
    configPath: APP_CONFIG_PATH,
  });
  const sessionStore = new SessionStore(CODEX_ROOT ? { codexRoot: CODEX_ROOT } : undefined);
  const profileStore = new ProfileStore(CODEX_ROOT ? { codexRoot: CODEX_ROOT } : undefined);
  const claudeSessionStore = new ClaudeSessionStore(
    CLAUDE_ROOT ? { claudeRoot: CLAUDE_ROOT } : undefined,
  );
  const claudeProfileStore = new ClaudeProfileStore(
    CLAUDE_ROOT ? { claudeRoot: CLAUDE_ROOT } : undefined,
  );
  const resumeLauncher = createSessionResumeLauncher({
    windowsTerminalPath: appConfig.terminalPath || undefined,
  });
  const claudeResumeLauncher = createClaudeSessionResumeLauncher({
    windowsTerminalPath: appConfig.terminalPath || undefined,
  });
  const openBrowser = createBrowserLauncher();
  const server = http.createServer(
    createRequestHandler({
      sessionStore,
      profileStore,
      claudeSessionStore,
      claudeProfileStore,
      resumeLauncher,
      claudeResumeLauncher,
      publicDir: PUBLIC_DIR,
    }),
  );

  const { port, requestedPort } = await listenWithPortFallback(server, { port: PORT });
  const url = `http://localhost:${port}`;
  if (port !== requestedPort) {
    console.warn(`Port ${requestedPort} is in use; using ${port} instead.`);
  }
  console.log(`AI Agent Deck backend listening on ${url}`);
  openBrowser(url).catch((error) => {
    console.warn(`Failed to open browser: ${error.message || error}`);
  });
}
