const path = require("node:path");
const fsPromises = require("node:fs/promises");
const { sendJson, sendError, readJsonBody } = require("./http-utils.js");

function createRequestHandler({
  sessionStore,
  profileStore,
  claudeSessionStore,
  claudeProfileStore,
  resumeLauncher,
  claudeResumeLauncher,
  publicDir,
}) {
  if (!sessionStore) {
    throw new Error("sessionStore is required");
  }
  if (!profileStore) {
    throw new Error("profileStore is required");
  }
  if (!publicDir) {
    throw new Error("publicDir is required");
  }
  const launchResume =
    typeof resumeLauncher === "function"
      ? resumeLauncher
      : async () => {
          throw new Error("resume launcher is required");
        };
  const launchClaudeResume =
    typeof claudeResumeLauncher === "function"
      ? claudeResumeLauncher
      : async () => {
          throw new Error("claude resume launcher is required");
        };

  return async function handleRequest(req, res) {
    setCors(res);
    const method = req.method;
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (url.pathname === "/api/sessions" && method === "GET") {
        sendJson(res, 200, await sessionStore.listSessions());
        return;
      }

      if (url.pathname === "/api/sessions" && method === "DELETE") {
        const body = await readJsonBody(req);
        if (!body || !Array.isArray(body.sessionIds)) {
          sendError(res, 400, "sessionIds array is required");
          return;
        }
        sendJson(res, 200, await sessionStore.deleteSessions(body.sessionIds));
        return;
      }

      if (url.pathname.startsWith("/api/sessions/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const sessionId = decodeURIComponent(segments[2] || "");
        if (!sessionId) {
          sendError(res, 400, "missing session id");
          return;
        }
        if (segments.length === 4 && segments[3] === "resume") {
          if (method !== "POST") {
            sendError(res, 405, "method not allowed");
            return;
          }
          await launchResume(sessionId);
          sendJson(res, 200, { sessionId, launched: true });
          return;
        }
        if (segments.length === 3 && method === "GET") {
          const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);
          const limitParam = parseInt(url.searchParams.get("limit") ?? "200", 10);
          const offset = Number.isNaN(offsetParam) ? 0 : Math.max(0, offsetParam);
          const limit = Number.isNaN(limitParam)
            ? 200
            : Math.min(1000, Math.max(1, limitParam));
          sendJson(
            res,
            200,
            await sessionStore.getSessionDetail(sessionId, { offset, limit }),
          );
          return;
        }
        if (segments.length === 3 && method === "PATCH") {
          const body = await readJsonBody(req);
          if (!body || typeof body.title !== "string") {
            sendError(res, 400, "title is required");
            return;
          }
          sendJson(res, 200, await sessionStore.renameSession(sessionId, body.title));
          return;
        }
        sendError(res, 404, "not found");
        return;
      }

      if (url.pathname === "/api/profiles" && method === "GET") {
        sendJson(res, 200, await profileStore.listProfiles());
        return;
      }

      if (url.pathname === "/api/profiles" && method === "POST") {
        const body = await readJsonBody(req);
        sendJson(res, 201, await profileStore.createProfile(body || {}));
        return;
      }

      if (url.pathname === "/api/claude/sessions" && method === "GET") {
        requireStore(claudeSessionStore, "claudeSessionStore");
        sendJson(res, 200, await claudeSessionStore.listSessions());
        return;
      }

      if (url.pathname === "/api/claude/sessions" && method === "DELETE") {
        requireStore(claudeSessionStore, "claudeSessionStore");
        const body = await readJsonBody(req);
        if (!body || !Array.isArray(body.sessionIds)) {
          sendError(res, 400, "sessionIds array is required");
          return;
        }
        sendJson(res, 200, await claudeSessionStore.deleteSessions(body.sessionIds));
        return;
      }

      if (url.pathname.startsWith("/api/claude/sessions/")) {
        requireStore(claudeSessionStore, "claudeSessionStore");
        const segments = url.pathname.split("/").filter(Boolean);
        const sessionId = decodeURIComponent(segments[3] || "");
        if (!sessionId) {
          sendError(res, 400, "missing session id");
          return;
        }
        if (segments.length === 5 && segments[4] === "resume") {
          if (method !== "POST") {
            sendError(res, 405, "method not allowed");
            return;
          }
          const detail = await claudeSessionStore.getSessionDetail(sessionId);
          await launchClaudeResume(sessionId, {
            cwd: detail.meta?.cwd || detail.meta?.path || "",
          });
          sendJson(res, 200, { sessionId, launched: true });
          return;
        }
        if (segments.length === 4 && method === "GET") {
          sendJson(res, 200, await claudeSessionStore.getSessionDetail(sessionId));
          return;
        }
        sendError(res, 404, "not found");
        return;
      }

      if (url.pathname === "/api/claude/profiles" && method === "GET") {
        requireStore(claudeProfileStore, "claudeProfileStore");
        sendJson(res, 200, await claudeProfileStore.listProfiles());
        return;
      }

      if (url.pathname === "/api/claude/profiles" && method === "POST") {
        requireStore(claudeProfileStore, "claudeProfileStore");
        const body = await readJsonBody(req);
        sendJson(res, 201, await claudeProfileStore.createProfile(body || {}));
        return;
      }

      if (url.pathname.startsWith("/api/claude/profiles/")) {
        requireStore(claudeProfileStore, "claudeProfileStore");
        const segments = url.pathname.split("/").filter(Boolean);
        const profileId = decodeURIComponent(segments[3] || "");
        if (!profileId) {
          sendError(res, 400, "missing profile id");
          return;
        }
        if (segments[4] === "activate") {
          if (method !== "POST") {
            sendError(res, 405, "method not allowed");
            return;
          }
          sendJson(res, 200, await claudeProfileStore.activateProfile(profileId));
          return;
        }
        if (method === "GET") {
          sendJson(res, 200, await claudeProfileStore.getProfile(profileId));
          return;
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          sendJson(res, 200, await claudeProfileStore.updateProfile(profileId, body || {}));
          return;
        }
        if (method === "DELETE") {
          sendJson(res, 200, await claudeProfileStore.deleteProfile(profileId));
          return;
        }
      }

      if (url.pathname.startsWith("/api/profiles/")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const profileId = decodeURIComponent(segments[2] || "");
        if (!profileId) {
          sendError(res, 400, "missing profile id");
          return;
        }
        if (segments[3] === "activate") {
          if (method !== "POST") {
            sendError(res, 405, "method not allowed");
            return;
          }
          sendJson(res, 200, await profileStore.activateProfile(profileId));
          return;
        }
        if (method === "GET") {
          sendJson(res, 200, await profileStore.getProfile(profileId));
          return;
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          sendJson(res, 200, await profileStore.updateProfile(profileId, body || {}));
          return;
        }
        if (method === "DELETE") {
          sendJson(res, 200, await profileStore.deleteProfile(profileId));
          return;
        }
      }

      await serveStatic(req, res, publicDir);
    } catch (error) {
      console.error("request failed", error);
      sendError(res, 500, error.message || "internal error");
    }
  };
}

function requireStore(store, storeName) {
  if (!store) {
    throw new Error(`${storeName} is required`);
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function serveStatic(req, res, publicDir) {
  let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }
  const candidate = path.join(publicDir, pathname);
  if (!candidate.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("Access denied");
    return;
  }
  try {
    const content = await fsPromises.readFile(candidate);
    res.setHeader("Content-Type", getMimeType(candidate));
    res.setHeader("Content-Length", content.length);
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 500;
    res.end("Unable to serve file");
  }
}

module.exports = {
  createRequestHandler,
};
