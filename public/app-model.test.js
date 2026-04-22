const assert = require("node:assert/strict");

const {
  buildUsageMetaEntries,
  buildSessionIdMetaValueHtml,
  buildWorkspaceTrackWidths,
  buildTimelineItemHtml,
  clampWorkspaceSplit,
  filterSessions,
  formatTokenCount,
  maskApiKey,
  renderMarkdownToHtml,
  sortProfilesForDisplay,
  sortSessionsByUpdatedAt,
  validateProfileDraft,
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
