(function defineAppModel(globalScope) {
  "use strict";

  const markdownRenderer = resolveMarkdownRenderer();

  function sortSessionsByUpdatedAt(sessions) {
    return [...sessions].sort((left, right) => {
      const leftTime = left?.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTime = right?.updatedAt ? Date.parse(right.updatedAt) : 0;
      return rightTime - leftTime;
    });
  }

  function filterSessions(sessions, filters) {
    const search = (filters?.search || "").trim().toLowerCase();
    const source = filters?.source || "all";

    return sortSessionsByUpdatedAt(sessions).filter((session) => {
      if (source !== "all" && session.source !== source) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = `${session.title || ""}\n${session.sessionId || ""}`.toLowerCase();
      return haystack.includes(search);
    });
  }

  function formatTokenCount(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }

    return new Intl.NumberFormat("en-US").format(value);
  }

  function buildUsageMetaEntries(usage) {
    return [
      ["Total Tokens", formatTokenCount(usage?.totalTokens)],
      ["Input Tokens", formatTokenCount(usage?.inputTokens)],
      ["Cached Input", formatTokenCount(usage?.cachedInputTokens)],
      ["Output Tokens", formatTokenCount(usage?.outputTokens)],
      ["Reasoning Output", formatTokenCount(usage?.reasoningOutputTokens)],
    ];
  }

  function sortProfilesForDisplay(profiles) {
    return [...(profiles || [])].sort((left, right) => {
      if (Boolean(left?.isActive) !== Boolean(right?.isActive)) {
        return left?.isActive ? -1 : 1;
      }
      return String(left?.name || "").localeCompare(String(right?.name || ""), "zh-CN");
    });
  }

  function maskApiKey(value) {
    const text = String(value || "");
    if (!text) {
      return "-";
    }
    if (text.length <= 12) {
      return text;
    }
    return `${text.slice(0, 5)}...${text.slice(-4)}`;
  }

  function validateProfileDraft(draft) {
    const errors = {};
    if (!String(draft?.name || "").trim()) {
      errors.name = "名称不能为空。";
    }
    if (!String(draft?.provider || "").trim()) {
      errors.provider = "Provider 不能为空。";
    }
    if (!String(draft?.apiKey || "").trim()) {
      errors.apiKey = "密钥不能为空。";
    }
    if (!String(draft?.baseUrl || "").trim()) {
      errors.baseUrl = "Base URL 不能为空。";
    }
    return errors;
  }

  function clampWorkspaceSplit(options) {
    const dividerWidth = Math.max(0, Number(options?.dividerWidth) || 0);
    const workspaceWidth = Math.max(0, Number(options?.workspaceWidth) || 0);
    const nextLeftWidth = Math.max(0, Number(options?.nextLeftWidth) || 0);
    const totalPaneWidth = Math.max(0, workspaceWidth - dividerWidth);

    if (!totalPaneWidth) {
      return {
        leftWidth: 0,
        rightWidth: 0,
      };
    }

    const configuredMin = Math.max(0, Number(options?.minPaneWidth) || 0);
    const effectiveMin = Math.min(configuredMin, Math.floor(totalPaneWidth / 2));
    const maxLeftWidth = Math.max(effectiveMin, totalPaneWidth - effectiveMin);
    const leftWidth = Math.min(Math.max(nextLeftWidth, effectiveMin), maxLeftWidth);

    return {
      leftWidth,
      rightWidth: Math.max(0, totalPaneWidth - leftWidth),
    };
  }

  function buildWorkspaceTrackWidths(options) {
    const split = clampWorkspaceSplit(options);

    return {
      ...split,
      leftTrackWidth: `${split.leftWidth}px`,
      rightTrackWidth: `${split.rightWidth}px`,
    };
  }

  function buildSessionIdMetaValueHtml(sessionId) {
    const value = String(sessionId || "").trim();
    if (!value) {
      return escapeHtml("-");
    }

    const safeSessionId = escapeHtml(value);
    return [
      '<div class="meta-session-id">',
      `<code>${safeSessionId}</code>`,
      '<button',
      ' class="ghost-button meta-resume-button"',
      ' type="button"',
      ` data-resume-session-id="${safeSessionId}"`,
      ">切换到当前会话</button>",
      "</div>",
    ].join("");
  }

  function renderMarkdownToHtml(markdown) {
    const source = String(markdown || "");
    if (!source) {
      return "";
    }

    const html = typeof markdownRenderer === "function" ? markdownRenderer(source) : escapeHtml(source);
    return sanitizeRenderedMarkdown(html);
  }

  function buildTimelineItemHtml(item, options) {
    const formatDate = typeof options?.formatDate === "function" ? options.formatDate : defaultFormatDate;
    const bodyHtml = renderMarkdownToHtml(item?.text || "");

    return `
      <article class="timeline-item">
        <div class="timeline-item-header">
          <div class="timeline-item-meta">
            <span class="timeline-item-label">${escapeHtml(item?.label || item?.type || "event")}</span>
            <span class="muted">${escapeHtml(formatDate(item?.timestamp))}</span>
          </div>
          <button
            class="ghost-button timeline-copy-button"
            type="button"
            data-copy-markdown="${escapeHtml(item?.text || "")}"
          >复制</button>
        </div>
        <div class="timeline-item-markdown">${bodyHtml}</div>
      </article>
    `;
  }

  function sanitizeRenderedMarkdown(html) {
    return String(html || "").replace(/\s(href|src)="([^"]*)"/gi, (match, attributeName, rawValue) => {
      return isSafeUrl(rawValue) ? ` ${attributeName}="${rawValue}"` : "";
    });
  }

  function isSafeUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
      return false;
    }
    if (
      value.startsWith("#") ||
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../")
    ) {
      return true;
    }

    const protocolMatch = value.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
    if (!protocolMatch) {
      return true;
    }

    const protocol = protocolMatch[1].toLowerCase();
    return protocol === "http" || protocol === "https" || protocol === "mailto" || protocol === "tel";
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function defaultFormatDate(value) {
    return value ? String(value) : "-";
  }

  function resolveMarkdownRenderer() {
    if (typeof globalScope.snarkdown === "function") {
      return globalScope.snarkdown;
    }
    if (typeof module !== "undefined" && module.exports) {
      return require("./vendor/snarkdown.umd.js");
    }
    return null;
  }

  const api = {
    buildSessionIdMetaValueHtml,
    buildUsageMetaEntries,
    buildWorkspaceTrackWidths,
    buildTimelineItemHtml,
    clampWorkspaceSplit,
    escapeHtml,
    filterSessions,
    formatTokenCount,
    maskApiKey,
    renderMarkdownToHtml,
    sortProfilesForDisplay,
    sortSessionsByUpdatedAt,
    validateProfileDraft,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.CodexHistoryModel = api;
})(typeof window !== "undefined" ? window : globalThis);
