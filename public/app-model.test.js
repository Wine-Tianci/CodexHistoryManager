const assert = require("node:assert/strict");

const {
  AI_TYPE_STORAGE_KEYS,
  buildAiTypeOptions,
  buildHistoryApiPaths,
  buildProfileApiPaths,
  buildAiSourceLabel,
  buildCurrentConfigMetaEntries,
  buildClaudeCurrentConfigMetaEntries,
  buildClaudeProfileMetaEntries,
  buildProfileMetaEntries,
  buildUsageMetaEntries,
  buildSessionIdMetaValueHtml,
  buildSessionTitlePreview,
  buildWorkspaceTrackWidths,
  buildTimelineItemHtml,
  clampWorkspaceSplit,
  filterClaudeSessions,
  filterSessions,
  filterUnifiedSessions,
  formatTokenCount,
  maskApiKey,
  readStoredAiType,
  renderMarkdownToHtml,
  writeStoredAiType,
  sortProfilesForDisplay,
  sortSessionsByUpdatedAt,
  validateClaudeProfileDraft,
  validateProfileDraft,
  resetHistoryStateForAiType,
} = require("./app-model");

function run(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

run("sortSessionsByUpdatedAt sorts newer sessions first", () => {
  const sessions = [
    { sessionId: "older", updatedAt: "2026-03-26T10:00:00.000Z" },
    { sessionId: "newer", updatedAt: "2026-03-27T10:00:00.000Z" },
  ];

  const sorted = sortSessionsByUpdatedAt(sessions);

  assert.deepEqual(
    sorted.map((session) => session.sessionId),
    ["newer", "older"],
  );
});

run("filterSessions matches title and session id", () => {
  const sessions = [
    {
      source: "sessions",
      sessionId: "019d-alpha",
      updatedAt: "2026-03-27T10:00:00.000Z",
      title: "Lua analyzer",
    },
    {
      source: "archived_sessions",
      sessionId: "019d-beta",
      updatedAt: "2026-03-26T10:00:00.000Z",
      title: "Buff docs",
    },
  ];

  const byTitle = filterSessions(sessions, {
    search: "lua",
    source: "all",
  });

  const bySessionId = filterSessions(sessions, {
    search: "beta",
    source: "all",
  });

  assert.deepEqual(byTitle.map((session) => session.sessionId), ["019d-alpha"]);
  assert.deepEqual(bySessionId.map((session) => session.sessionId), ["019d-beta"]);
});

run("filterSessions applies source filter after sorting", () => {
  const sessions = [
    {
      source: "archived_sessions",
      sessionId: "older-archived",
      updatedAt: "2026-03-25T10:00:00.000Z",
      title: "Older archived",
    },
    {
      source: "sessions",
      sessionId: "newest-live",
      updatedAt: "2026-03-27T10:00:00.000Z",
      title: "Newest live",
    },
    {
      source: "archived_sessions",
      sessionId: "newer-archived",
      updatedAt: "2026-03-26T10:00:00.000Z",
      title: "Newer archived",
    },
  ];

  const filtered = filterSessions(sessions, {
    search: "",
    source: "archived_sessions",
  });

  assert.deepEqual(
    filtered.map((session) => session.sessionId),
    ["newer-archived", "older-archived"],
  );
});

run("renderMarkdownToHtml renders markdown semantics", () => {
  const html = renderMarkdownToHtml("# Title\n\nUse **bold** text.");

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

run("renderMarkdownToHtml strips unsafe javascript links", () => {
  const html = renderMarkdownToHtml("[bad](javascript:alert(1))");

  assert.doesNotMatch(html, /href="javascript:alert\(1\)"/);
  assert.match(html, /<a>bad<\/a>/);
});

run("buildTimelineItemHtml includes a copy-markdown action with raw source", () => {
  const html = buildTimelineItemHtml({
    label: "assistant",
    timestamp: "2026-03-27T10:00:00.000Z",
    text: "## Heading",
  });

  assert.match(html, /data-copy-markdown="## Heading"/);
  assert.match(html, />复制<\/button>/);
  assert.match(html, /timeline-item-markdown/);
  assert.match(html, /<h2>Heading<\/h2>/);
});

run("buildSessionIdMetaValueHtml renders a resume action beside the session id", () => {
  const sessionId = "019d89e0-13c2-7251-a3a9-993274ff5ad7";

  const html = buildSessionIdMetaValueHtml(sessionId);

  assert.match(html, /meta-session-id/);
  assert.match(html, new RegExp(`<code>${sessionId}</code>`));
  assert.match(
    html,
    new RegExp(`data-resume-session-id="${sessionId}"`),
  );
  assert.match(html, /切换到当前会话/);
});

run("buildSessionTitlePreview collapses multiline long first-message titles", () => {
  const title = [
    "352: error log payload with enough content to exceed the preview limit",
    "353: another log line that should not create a tall heading",
    "354: final log line",
  ].join("\n");

  const preview = buildSessionTitlePreview(title, 64);

  assert.equal(preview.length, 67);
  assert.equal(preview.endsWith("..."), true);
  assert.doesNotMatch(preview, /\r|\n/);
  assert.match(preview, /^352: error log payload/);
});

run("formatTokenCount adds separators and falls back to dash", () => {
  assert.equal(formatTokenCount(12561), "12,561");
  assert.equal(formatTokenCount(0), "0");
  assert.equal(formatTokenCount(null), "-");
});

run("buildUsageMetaEntries returns ordered token fields with fallback dashes", () => {
  assert.deepEqual(
    buildUsageMetaEntries({
      totalTokens: 12561,
      inputTokens: 12193,
      cachedInputTokens: 9088,
      outputTokens: 368,
      reasoningOutputTokens: 144,
    }),
    [
      ["Total Tokens", "12,561"],
      ["Input Tokens", "12,193"],
      ["Cached Input", "9,088"],
      ["Output Tokens", "368"],
      ["Reasoning Output", "144"],
    ],
  );

  assert.deepEqual(
    buildUsageMetaEntries(null),
    [
      ["Total Tokens", "-"],
      ["Input Tokens", "-"],
      ["Cached Input", "-"],
      ["Output Tokens", "-"],
      ["Reasoning Output", "-"],
    ],
  );
});

run("clampWorkspaceSplit keeps both panes above minimum width", () => {
  const result = clampWorkspaceSplit({
    nextLeftWidth: 220,
    workspaceWidth: 1000,
    dividerWidth: 14,
    minPaneWidth: 320,
  });

  assert.deepEqual(result, {
    leftWidth: 320,
    rightWidth: 666,
  });
});

run("buildWorkspaceTrackWidths returns explicit pixel widths for both tracks", () => {
  const result = buildWorkspaceTrackWidths({
    nextLeftWidth: 220,
    workspaceWidth: 1000,
    dividerWidth: 14,
    minPaneWidth: 320,
  });

  assert.deepEqual(result, {
    leftWidth: 320,
    rightWidth: 666,
    leftTrackWidth: "320px",
    rightTrackWidth: "666px",
  });
});

run("maskApiKey hides the middle of non-empty keys", () => {
  assert.equal(maskApiKey("sk-1234567890abcdef"), "sk-12...cdef");
  assert.equal(maskApiKey("abcd1234"), "abcd1234");
  assert.equal(maskApiKey(""), "-");
});

run("sortProfilesForDisplay keeps the active profile first and sorts the rest by name", () => {
  const profiles = [
    { id: "b", name: "Zoo", isActive: false },
    { id: "c", name: "Alpha", isActive: true },
    { id: "a", name: "Beta", isActive: false },
  ];

  const sorted = sortProfilesForDisplay(profiles);

  assert.deepEqual(
    sorted.map((profile) => profile.id),
    ["c", "a", "b"],
  );
});

run("buildProfileMetaEntries includes optional default model settings", () => {
  assert.deepEqual(
    buildProfileMetaEntries({
      provider: "Custom",
      baseUrl: "https://api.example.com",
      apiKey: "sk-1234567890abcdef",
      model: "gpt-5.5",
      modelReasoningEffort: "high",
    }),
    [
      ["Provider", "Custom"],
      ["Base URL", "https://api.example.com"],
      ["API Key", "sk-12...cdef"],
      ["Model", "gpt-5.5"],
      ["Reasoning Effort", "high"],
    ],
  );
});

run("buildCurrentConfigMetaEntries includes missing model settings as dashes", () => {
  assert.deepEqual(
    buildCurrentConfigMetaEntries({
      provider: "Custom",
      baseUrl: "https://api.example.com",
      apiKey: "sk-1234567890abcdef",
      model: "",
      modelReasoningEffort: "",
    }),
    [
      ["Provider", "Custom"],
      ["Base URL", "https://api.example.com"],
      ["API Key", "sk-12...cdef"],
      ["Model", "-"],
      ["Reasoning Effort", "-"],
    ],
  );
});

run("validateProfileDraft returns field errors for blank values", () => {
  assert.deepEqual(
    validateProfileDraft({
      name: " ",
      provider: " ",
      apiKey: "",
      baseUrl: " ",
    }),
    {
      name: "名称不能为空。",
      provider: "Provider 不能为空。",
      apiKey: "密钥不能为空。",
      baseUrl: "Base URL 不能为空。",
    },
  );
});

run("validateProfileDraft allows blank default model settings", () => {
  assert.deepEqual(
    validateProfileDraft({
      name: "Work",
      provider: "Custom",
      apiKey: "sk-work",
      baseUrl: "https://api.example.com",
      model: "",
      modelReasoningEffort: "",
    }),
    {},
  );
});

run("filterClaudeSessions matches title, session id, project, and model", () => {
  const sessions = [
    {
      sessionId: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-05-13T08:00:00.000Z",
      title: "Create CLAUDE.md",
      project: "F:\\workspace_Hydra",
      model: "claude-haiku-4-5-20251001",
    },
    {
      sessionId: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-05-13T07:00:00.000Z",
      title: "Review config",
      project: "C:\\Windows\\system32",
      model: "claude-sonnet-4-5-20251001",
    },
  ];

  assert.deepEqual(
    filterClaudeSessions(sessions, { search: "hydra" }).map((item) => item.sessionId),
    ["11111111-1111-4111-8111-111111111111"],
  );
  assert.deepEqual(
    filterClaudeSessions(sessions, { search: "sonnet" }).map((item) => item.sessionId),
    ["22222222-2222-4222-8222-222222222222"],
  );
});

run("buildAiTypeOptions returns the supported AI types", () => {
  assert.deepEqual(buildAiTypeOptions(), [
    { value: "codex", label: "Codex" },
    { value: "claude", label: "Claude" },
  ]);
});

run("AI type storage keys keep history and profiles selections independent", () => {
  assert.deepEqual(AI_TYPE_STORAGE_KEYS, {
    history: "ai-agent-deck.history.aiType",
    profiles: "ai-agent-deck.profiles.aiType",
  });
});

run("readStoredAiType restores a valid saved AI type", () => {
  const storage = createMemoryStorage({
    "ai-agent-deck.history.aiType": "claude",
    "ai-agent-deck.profiles.aiType": "codex",
  });

  assert.equal(
    readStoredAiType(storage, AI_TYPE_STORAGE_KEYS.history),
    "claude",
  );
  assert.equal(
    readStoredAiType(storage, AI_TYPE_STORAGE_KEYS.profiles),
    "codex",
  );
});

run("readStoredAiType falls back when storage is missing or invalid", () => {
  assert.equal(readStoredAiType(null, AI_TYPE_STORAGE_KEYS.history), "codex");
  assert.equal(
    readStoredAiType(createMemoryStorage({ "ai-agent-deck.history.aiType": "bad" }), AI_TYPE_STORAGE_KEYS.history),
    "codex",
  );
  assert.equal(
    readStoredAiType(createThrowingStorage(), AI_TYPE_STORAGE_KEYS.history, "claude"),
    "claude",
  );
});

run("writeStoredAiType persists valid values and ignores invalid storage", () => {
  const storage = createMemoryStorage();

  writeStoredAiType(storage, AI_TYPE_STORAGE_KEYS.history, "claude");
  writeStoredAiType(storage, AI_TYPE_STORAGE_KEYS.profiles, "codex");
  writeStoredAiType(storage, AI_TYPE_STORAGE_KEYS.history, "bad");

  assert.equal(storage.getItem(AI_TYPE_STORAGE_KEYS.history), "claude");
  assert.equal(storage.getItem(AI_TYPE_STORAGE_KEYS.profiles), "codex");
  assert.doesNotThrow(() => writeStoredAiType(createThrowingStorage(), AI_TYPE_STORAGE_KEYS.history, "claude"));
});

run("filterUnifiedSessions searches and filters Codex and Claude sessions", () => {
  const sessions = [
    {
      aiType: "codex",
      source: "sessions",
      sessionId: "codex-live",
      updatedAt: "2026-05-13T08:00:00.000Z",
      title: "重构工具",
    },
    {
      aiType: "claude",
      source: "claude",
      sessionId: "claude-work",
      updatedAt: "2026-05-13T09:00:00.000Z",
      title: "文档整理",
      project: "Hydra",
      model: "claude-sonnet-4-5",
    },
    {
      aiType: "codex",
      source: "archived_sessions",
      sessionId: "codex-archived",
      updatedAt: "2026-05-13T07:00:00.000Z",
      title: "历史任务",
    },
  ];

  assert.deepEqual(
    filterUnifiedSessions(sessions, { aiType: "claude", search: "sonnet" }).map(
      (session) => session.sessionId,
    ),
    ["claude-work"],
  );
  assert.deepEqual(
    filterUnifiedSessions(sessions, { aiType: "codex", source: "archived_sessions" }).map(
      (session) => session.sessionId,
    ),
    ["codex-archived"],
  );
});

run("buildHistoryApiPaths selects the correct session API family", () => {
  assert.deepEqual(buildHistoryApiPaths("codex", "abc 123"), {
    list: "/api/sessions",
    detail: "/api/sessions/abc%20123",
    delete: "/api/sessions",
    resume: "/api/sessions/abc%20123/resume",
  });
  assert.deepEqual(buildHistoryApiPaths("claude", "abc 123"), {
    list: "/api/claude/sessions",
    detail: "/api/claude/sessions/abc%20123",
    delete: "/api/claude/sessions",
    resume: "/api/claude/sessions/abc%20123/resume",
  });
});

run("buildAiSourceLabel returns visible source labels", () => {
  assert.equal(buildAiSourceLabel("codex"), "Codex");
  assert.equal(buildAiSourceLabel("claude"), "Claude");
});

run("resetHistoryStateForAiType clears incompatible detail and selection", () => {
  const selectedIds = new Set(["one", "two"]);
  const nextState = resetHistoryStateForAiType({
    aiType: "codex",
    sessions: [{ sessionId: "one" }],
    filteredSessions: [{ sessionId: "one" }],
    selectedIds,
    activeSessionId: "one",
    activeDetail: { sessionId: "one" },
  }, "claude");

  assert.equal(nextState.aiType, "claude");
  assert.deepEqual(nextState.sessions, []);
  assert.deepEqual(nextState.filteredSessions, []);
  assert.equal(nextState.selectedIds.size, 0);
  assert.equal(nextState.activeSessionId, null);
  assert.equal(nextState.activeDetail, null);
  assert.equal(selectedIds.size, 2);
});

run("buildClaudeProfileMetaEntries uses Claude business fields and masks the API key", () => {
  assert.deepEqual(
    buildClaudeProfileMetaEntries({
      baseUrl: "https://example.test/bedrock",
      apiKey: "sk-1234567890abcdef",
      defaultModel: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    }),
    [
      ["Base URL", "https://example.test/bedrock"],
      ["API Key", "sk-12...cdef"],
      ["默认模型", "us.anthropic.claude-haiku-4-5-20251001-v1:0"],
    ],
  );
});

run("buildClaudeCurrentConfigMetaEntries uses Claude business fields", () => {
  assert.deepEqual(
    buildClaudeCurrentConfigMetaEntries({
      baseUrl: "https://example.test/bedrock",
      apiKey: "sk-1234567890abcdef",
      defaultModel: "claude-sonnet-4-5-20251001",
    }),
    [
      ["Base URL", "https://example.test/bedrock"],
      ["API Key", "sk-12...cdef"],
      ["默认模型", "claude-sonnet-4-5-20251001"],
    ],
  );
});

run("validateClaudeProfileDraft requires Claude business fields", () => {
  assert.deepEqual(
    validateClaudeProfileDraft({
      name: " ",
      baseUrl: "",
      apiKey: "",
      defaultModel: "",
    }),
    {
      name: "名称不能为空。",
      baseUrl: "Base URL 不能为空。",
      apiKey: "API Key 不能为空。",
      defaultModel: "默认模型不能为空。",
    },
  );

  assert.deepEqual(
    validateClaudeProfileDraft({
      name: "Claude Work",
      baseUrl: "https://example.test/bedrock",
      apiKey: "sk-test",
      defaultModel: "claude-haiku-4-5",
    }),
    {},
  );
});

run("buildProfileApiPaths selects the correct profile API family", () => {
  assert.deepEqual(buildProfileApiPaths("codex", "profile 1"), {
    list: "/api/profiles",
    detail: "/api/profiles/profile%201",
    activate: "/api/profiles/profile%201/activate",
    delete: "/api/profiles/profile%201",
  });
  assert.deepEqual(buildProfileApiPaths("claude", "profile 1"), {
    list: "/api/claude/profiles",
    detail: "/api/claude/profiles/profile%201",
    activate: "/api/claude/profiles/profile%201/activate",
    delete: "/api/claude/profiles/profile%201",
  });
});

function createMemoryStorage(initialValues = {}) {
  const data = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };
}
