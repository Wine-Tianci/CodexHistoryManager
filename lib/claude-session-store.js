const fs = require("node:fs");
const fsPromises = fs.promises;
const path = require("node:path");
const os = require("node:os");

class ClaudeSessionStore {
  constructor({ claudeRoot } = {}) {
    this.claudeRoot = claudeRoot || path.join(os.homedir(), ".claude");
    this.historyPath = path.join(this.claudeRoot, "history.jsonl");
    this.projectsDir = path.join(this.claudeRoot, "projects");
  }

  async listSessions() {
    const [historyMap, projectData] = await Promise.all([
      buildHistoryMap(this.historyPath),
      buildProjectMap(this.projectsDir),
    ]);
    const sessions = Array.from(projectData.map.values()).map((entry) => {
      const history = historyMap.get(entry.sessionId);
      return {
        sessionId: entry.sessionId,
        projectKey: entry.projectKey,
        project: history?.project || entry.path,
        path: history?.project || entry.path,
        title: history?.display || "Untitled Session",
        updatedAt: entry.updatedAt,
        messageCount: entry.messageCount,
        model: entry.model,
        usage: entry.usage,
      };
    });
    sessions.sort((left, right) => {
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightTime - leftTime;
    });
    return {
      sessions,
      warnings: projectData.warnings,
    };
  }

  async getSessionDetail(sessionId) {
    const projectData = await buildProjectMap(this.projectsDir);
    const detail = projectData.map.get(sessionId);
    if (!detail) {
      return {
        sessionId,
        meta: { sessionId },
        timeline: [],
        rawEvents: [],
        totalEvents: 0,
        model: "",
        warnings: [],
      };
    }
    const parsed = await readJsonl(detail.transcriptPath, { allowMissing: false });
    const firstUser = parsed.entries.find((entry) => entry?.type === "user");
    return {
      sessionId,
      meta: {
        sessionId,
        cwd: firstUser?.cwd || "",
        projectKey: detail.projectKey,
        path: detail.path,
      },
      timeline: parsed.entries
        .map((entry) => summarizeTimelineEvent(entry))
        .filter(Boolean),
      rawEvents: parsed.entries,
      totalEvents: parsed.entries.length,
      model: findAssistantModel(parsed.entries),
      usage: buildUsageSummary(parsed.entries),
      warnings: parsed.warnings,
    };
  }

  async deleteSessions(sessionIds) {
    const normalized = Array.from(new Set((sessionIds || []).filter(Boolean)));
    const detailMap = await buildProjectMap(this.projectsDir);
    const deleted = [];
    const errors = [];
    for (const sessionId of normalized) {
      const entry = detailMap.map.get(sessionId);
      if (!entry?.transcriptPath) {
        continue;
      }
      try {
        await fsPromises.unlink(entry.transcriptPath);
        deleted.push(sessionId);
      } catch (error) {
        if (error.code === "ENOENT") {
          deleted.push(sessionId);
        } else {
          errors.push({
            sessionId,
            message: `failed to delete detail file: ${error.message}`,
          });
        }
      }
    }
    return { deleted, errors };
  }
}

async function buildHistoryMap(historyPath) {
  const parsed = await readJsonl(historyPath, { allowMissing: true });
  const map = new Map();
  for (const entry of parsed.entries) {
    if (!entry || !entry.sessionId) {
      continue;
    }
    if (!map.has(entry.sessionId)) {
      map.set(entry.sessionId, entry);
    }
  }
  return map;
}

async function buildProjectMap(projectsDir) {
  const map = new Map();
  const warnings = [];
  try {
    const projectEntries = await fsPromises.readdir(projectsDir, { withFileTypes: true });
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory() || projectEntry.name === "subagents") {
        continue;
      }
      const projectKey = projectEntry.name;
      const projectDir = path.join(projectsDir, projectKey);
      const childEntries = await fsPromises.readdir(projectDir, { withFileTypes: true });
      for (const childEntry of childEntries) {
        if (!childEntry.isFile() || !childEntry.name.endsWith(".jsonl")) {
          continue;
        }
        const transcriptPath = path.join(projectDir, childEntry.name);
        const parsed = await readJsonl(transcriptPath, { allowMissing: false });
        warnings.push(...parsed.warnings);
        const sessionId =
          findSessionId(parsed.entries) || childEntry.name.replace(/\.jsonl$/i, "");
        const stats = await fsPromises.stat(transcriptPath);
        map.set(sessionId, {
          sessionId,
          projectKey,
          path: findPath(parsed.entries, projectKey),
          transcriptPath,
          updatedAt: stats.mtime.toISOString(),
          messageCount: parsed.entries.filter((entry) => isMessageEvent(entry)).length,
          model: findAssistantModel(parsed.entries),
          usage: buildUsageSummary(parsed.entries),
        });
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      warnings.push(`unable to scan ${projectsDir}: ${error.message}`);
    }
  }
  return { map, warnings };
}

function findSessionId(entries) {
  for (const entry of entries) {
    if (entry?.sessionId) {
      return entry.sessionId;
    }
  }
  return "";
}

function findPath(entries, projectKey) {
  const firstUser = entries.find((entry) => entry?.cwd);
  if (firstUser?.cwd) {
    return firstUser.cwd;
  }
  return projectKey.replace(/--/g, ":").replace(/-/g, "\\");
}

function isMessageEvent(entry) {
  return entry?.type === "user" || entry?.type === "assistant";
}

function findAssistantModel(entries) {
  const assistant = entries.find((entry) => entry?.type === "assistant");
  return assistant?.message?.model || "";
}

function buildUsageSummary(entries) {
  const usage = {
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
  let hasUsage = false;

  for (const entry of entries) {
    const rawUsage = entry?.message?.usage || entry?.usage;
    if (!rawUsage || typeof rawUsage !== "object") {
      continue;
    }
    hasUsage = true;
    usage.inputTokens += readNumber(rawUsage.input_tokens);
    usage.cachedInputTokens +=
      readNumber(rawUsage.cache_read_input_tokens) +
      readNumber(rawUsage.cache_creation_input_tokens);
    usage.outputTokens += readNumber(rawUsage.output_tokens);
    usage.reasoningOutputTokens += readNumber(rawUsage.reasoning_output_tokens);
  }

  usage.totalTokens =
    usage.inputTokens +
    usage.cachedInputTokens +
    usage.outputTokens +
    usage.reasoningOutputTokens;
  return hasUsage ? usage : null;
}

function readNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function summarizeTimelineEvent(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.type === "user") {
    return {
      label: "user",
      type: "user",
      timestamp: entry.timestamp || null,
      text: flattenContent(entry.message?.content),
    };
  }
  if (entry.type === "assistant") {
    return {
      label: "assistant",
      type: "assistant",
      timestamp: entry.timestamp || null,
      text: flattenContent(entry.message?.content),
    };
  }
  return null;
}

function flattenContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => flattenContent(item?.text || item))
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }
  return "";
}

async function readJsonl(filePath, { allowMissing = false } = {}) {
  try {
    const content = await fsPromises.readFile(filePath, "utf8");
    return parseJsonlLines(content, filePath);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") {
      return { entries: [], warnings: [] };
    }
    throw error;
  }
}

function parseJsonlLines(content, filePath) {
  const warnings = [];
  const entries = [];
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      warnings.push(`${filePath} line ${index + 1}: ${error.message}`);
    }
  }
  return { entries, warnings };
}

module.exports = {
  ClaudeSessionStore,
};
