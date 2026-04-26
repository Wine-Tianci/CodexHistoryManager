const http = require("node:http");
const path = require("node:path");
const { readAppConfig } = require("./lib/app-config.js");
const { SessionStore } = require("./lib/session-store.js");
const { ProfileStore } = require("./lib/profile-store.js");
const { createRequestHandler } = require("./lib/request-handler.js");
const { createSessionResumeLauncher } = require("./lib/session-resume-launcher.js");
const { createBrowserLauncher } = require("./lib/browser-launcher.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const APP_CONFIG_PATH = path.join(__dirname, "codex-manager.config.json");
const LEGACY_APP_CONFIG_PATH = path.join(__dirname, "codex-history-manager.config.json");
const PORT = process.env.PORT || 4173;
const CODEX_ROOT = process.env.CODEX_ROOT;

bootstrap().catch((error) => {
  console.error("Failed to start CodexManager:", error.message || error);
  process.exitCode = 1;
});

async function bootstrap() {
  const appConfig = await readAppConfig({
    configPath: APP_CONFIG_PATH,
    legacyConfigPath: LEGACY_APP_CONFIG_PATH,
  });
  const sessionStore = new SessionStore(CODEX_ROOT ? { codexRoot: CODEX_ROOT } : undefined);
  const profileStore = new ProfileStore(CODEX_ROOT ? { codexRoot: CODEX_ROOT } : undefined);
  const resumeLauncher = createSessionResumeLauncher({
    windowsTerminalPath: appConfig.terminalPath || undefined,
  });
  const openBrowser = createBrowserLauncher();
  const server = http.createServer(
    createRequestHandler({
      sessionStore,
      profileStore,
      resumeLauncher,
      publicDir: PUBLIC_DIR,
    }),
  );

  server.listen(PORT, () => {
    const address = server.address();
    const url =
      address && typeof address === "object"
        ? `http://localhost:${address.port}`
        : `http://localhost:${PORT}`;
    console.log(`CodexManager backend listening on ${url}`);
    openBrowser(url).catch((error) => {
      console.warn(`Failed to open browser: ${error.message || error}`);
    });
  });
}
