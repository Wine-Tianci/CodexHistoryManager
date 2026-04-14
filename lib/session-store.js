const fs = require("node:fs");
const fsPromises = fs.promises;
const path = require("node:path");
const os = require("node:os");

const SESSION_ID_REGEX =
  /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/;

class SessionStore {
  constructor({ codexRoot } = {}) {
    this.codexRoot = codexRoot || path.join(os.homedir(), ".codex");
    this.indexPath = path.join(this.codexRoot, "session_index.jsonl");
    this.historyPath = path.join(this.codexRoot, "history.jsonl");
    this.sessionsDir = path.join(this.codexRoot, "sessions");
    this.archivesDir = path.join(this.codexRoot, "archived_sessions");
  }

  async listSessions() {
    const [indexData, detailData, historyData] = await Promise.all([
      readJsonl(this.indexPath, { allowMissing: true }),
      buildDetailMap(this.sessionsDir, this.archivesDir),
      buildHistoryMap(this.historyPath),
    ]);
    const warnings = [
      ...indexData.warnings,
      ...detailData.warnings,
      ...historyData.warnings,
    ];
    const sessionSummaries = [];
    const seenSessionIds = new Set();
    for (const entry of indexData.entries) {
      if (!entry || !entry.id) continue;
      const detail = detailData.map.get(entry.id);
      const title = entry.thread_name || historyData.map.get(entry.id) || "Untitled Session";
      sessionSummaries.push({
        sessionId: entry.id,
        updatedAt:
          entry.updated_at || entry.timestamp || entry.ts || detail?.updatedAt || null,
        title,
        source: detail?.source || entry.source || "sessions",
        hasDetailFile: Boolean(detail),
      });
      seenSessionIds.add(entry.id);
    }
    for (const [sessionId, detail] of detailData.map.entries()) {
      if (seenSessionIds.has(sessionId)) {
        continue;
      }
      sessionSummaries.push({
        sessionId,
        updatedAt: detail.updatedAt || null,
        title: historyData.map.get(sessionId) || "Untitled Session",
        source: detail.source || "sessions",
        hasDetailFile: true,
      });
    }
    sessionSummaries.sort((a, b) =>
      compareDateStrings(a.updatedAt, b.updatedAt)
    );
    return { sessions: sessionSummaries, warnings };
  }

  async getSessionDetail(sessionId, { offset = 0, limit = 200 } = {}) {
    const warnings = [];
    const [indexData, detailData] = await Promise.all([
      readJsonl(this.indexPath, { allowMissing: true }),
      buildDetailMap(this.sessionsDir, this.archivesDir),
    ]);
    warnings.push(...indexData.warnings, ...detailData.warnings);
    const detailEntry = detailData.map.get(sessionId);
    const metaEntry = indexData.entries.find((entry) => entry?.id === sessionId);
    if (!detailEntry || !detailEntry.path) {
      return {
        sessionId,
        meta: buildMetaFromIndex(metaEntry, sessionId),
        timeline: [],
        rawEvents: [],
        totalEvents: 0,
        isOrphaned: true,
        warnings,
      };
    }
    const { entries: events, warnings: parseWarnings } = await readJsonl(
      detailEntry.path,
      { allowMissing: false }
    );
    warnings.push(...parseWarnings);
    const meta =
      findFirstMeta(events) || buildMetaFromIndex(metaEntry, sessionId);
    const timeline = events
      .map((event) => summarizeEvent(event))
      .filter(Boolean);
    const rawEvents = events.slice(offset, offset + limit);
    return {
      sessionId,
      meta,
      timeline,
      rawEvents,
      totalEvents: events.length,
      isOrphaned: false,
      warnings,
    };
  }

  async renameSession(sessionId, title) {
    if (!title || typeof title !== "string") {
      throw new Error("title must be a non-empty string");
    }
    const indexData = await readJsonl(this.indexPath, { allowMissing: true });
    let replaced = false;
    const updatedEntries = indexData.entries.map((entry) => {
      if (entry && entry.id === sessionId) {
        replaced = true;
        return { ...entry, thread_name: title };
      }
      return entry;
    });
    if (!replaced) {
      throw new Error(`session ${sessionId} not found`);
    }
    await writeJsonLinesAtomic(this.indexPath, updatedEntries);
    return { sessionId, title };
  }

  async deleteSessions(sessionIds) {
    const normalized = Array.from(new Set(sessionIds.filter(Boolean)));
    if (!normalized.length) {
      return { deleted: [], errors: [] };
    }
    const detailData = await buildDetailMap(this.sessionsDir, this.archivesDir);
    const deleted = [];
    const errors = [];
    const toDropFromIndexes = new Set();
    for (const sessionId of normalized) {
      const detail = detailData.map.get(sessionId);
      let deletionSucceeded = true;
      if (detail?.path) {
        try {
          await fsPromises.unlink(detail.path);
        } catch (err) {
          if (err.code === "ENOENT") {
            // already gone, treat as success
          } else {
            deletionSucceeded = false;
            errors.push({
              sessionId,
              message: `failed to delete detail file: ${err.message}`,
            });
          }
        }
      }
      if (deletionSucceeded) {
        deleted.push(sessionId);
        toDropFromIndexes.add(sessionId);
      }
    }
    if (toDropFromIndexes.size) {
      await rewriteJsonlExcluding(this.indexPath, toDropFromIndexes);
      await rewriteJsonlExcluding(this.historyPath, toDropFromIndexes, {
        matchFields: ["session_id"],
      });
    }
    return { deleted, errors };
  }
}

function compareDateStrings(a, b) {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return tb - ta;
}

function buildMetaFromIndex(entry, fallbackSessionId = null) {
  if (!entry) {
    return { sessionId: fallbackSessionId };
  }
  return {
    sessionId: entry.id,
    title: entry.thread_name,
    updatedAt: entry.updated_at || entry.timestamp || entry.ts || null,
    source: entry.source || "sessions",
  };
}

function findFirstMeta(events) {
  if (!Array.isArray(events)) return null;
  const metaEvent = events.find((entry) => entry?.type === "session_meta");
  if (!metaEvent) return null;
  return {
    sessionId: metaEvent.payload?.id,
    timestamp: metaEvent.payload?.timestamp || metaEvent.timestamp,
    cwd: metaEvent.payload?.cwd,
    originator: metaEvent.payload?.originator,
    cliVersion: metaEvent.payload?.cli_version,
    source: metaEvent.payload?.source,
    baseInstructions: metaEvent.payload?.base_instructions,
  };
}

async function buildDetailMap(sessionsDir, archivesDir) {
  const map = new Map();
  const warnings = [];

  await Promise.all([
    walkDetailDirectory(sessionsDir, "sessions", map, warnings),
    walkDetailDirectory(archivesDir, "archived_sessions", map, warnings),
  ]);

  return { map, warnings };
}

async function walkDetailDirectory(rootDir, source, map, warnings) {
  try {
    const entries = await fsPromises.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        await walkDetailDirectory(fullPath, source, map, warnings);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const stats = await fsPromises.stat(fullPath);
      const updatedAt = stats.mtime.toISOString();
      const sessionId = extractSessionId(entry.name);
      if (sessionId) {
        map.set(sessionId, { source, path: fullPath, updatedAt });
        continue;
      }
      try {
        const { entries: lines } = await readJsonl(fullPath);
        if (lines.length && lines[0]?.payload?.id) {
          map.set(lines[0].payload.id, { source, path: fullPath, updatedAt });
        }
      } catch (err) {
        warnings.push(`failed to analyze ${fullPath}: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      warnings.push(`unable to scan ${rootDir}: ${err.message}`);
    }
  }
}

function extractSessionId(filename) {
  const match = filename.match(SESSION_ID_REGEX);
  if (match) {
    return match[1];
  }
  return null;
}

async function buildHistoryMap(historyPath) {
  const historyData = await readJsonl(historyPath, { allowMissing: true });
  const map = new Map();
  for (const entry of historyData.entries) {
    if (!entry || !entry.session_id || typeof entry.text !== "string") {
      continue;
    }
    if (!map.has(entry.session_id)) {
      map.set(entry.session_id, entry.text);
    }
  }
  return { map, warnings: historyData.warnings };
}

async function readJsonl(filePath, { allowMissing = false } = {}) {
  try {
    const content = await fsPromises.readFile(filePath, "utf8");
    return parseJsonlLines(content, filePath);
  } catch (err) {
    if (allowMissing && err.code === "ENOENT") {
      return { entries: [], warnings: [`${path.basename(filePath)} not found`] };
    }
    throw err;
  }
}

function parseJsonlLines(content, filePath) {
  const warnings = [];
  const entries = [];
  const lines = content.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (err) {
      warnings.push(`${filePath} line ${idx + 1}: ${err.message}`);
    }
  }
  return { entries, warnings };
}

async function writeJsonLinesAtomic(targetPath, entries) {
  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
  const filtered = entries.filter(Boolean);
  const content =
    filtered.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const tempPath = path.join(
    path.dirname(targetPath),
    `.tmp-${path.basename(targetPath)}-${process.pid}-${Date.now()}`
  );
  await fsPromises.writeFile(tempPath, content, "utf8");
  await fsPromises.rename(tempPath, targetPath);
}

async function rewriteJsonlExcluding(
  targetPath,
  excludeSet,
  { matchFields = ["id"] } = {}
) {
  const existing = await readJsonl(targetPath, { allowMissing: true });
  const filtered = existing.entries.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    for (const field of matchFields) {
      if (entry[field] && excludeSet.has(entry[field])) {
        return false;
      }
    }
    return true;
  });
  await writeJsonLinesAtomic(targetPath, filtered);
}

function summarizeEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const timestamp = event.timestamp || event.ts || null;
  if (event.type === "response_item" && event.payload?.role === "assistant") {
    return {
      type: "assistant",
      timestamp,
      label: "assistant",
      text: flattenPayload(event.payload),
    };
  }
  if (event.type === "response_item" && event.payload?.role === "user") {
    return {
      type: "user",
      timestamp,
      label: "user",
      text: flattenPayload(event.payload),
    };
  }
  if (event.type === "event_msg" && event.payload?.type === "user_message") {
    return {
      type: "user",
      timestamp,
      label: "user",
      text: flattenPayload(event.payload?.message ?? event.payload),
    };
  }
  return null;
}

function flattenPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    return payload
      .map((inner) => flattenPayload(inner))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(payload.content)) {
    return payload.content
      .map((chunk) => flattenPayload(chunk))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.message === "object") return flattenPayload(payload.message);
  if (typeof payload.name === "string") return payload.name;
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

module.exports = { SessionStore };
