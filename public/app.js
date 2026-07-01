"use strict";

(function bootstrapHistory() {
  const {
    buildAiSourceLabel,
    AI_TYPE_STORAGE_KEYS,
    buildHistoryApiPaths,
    buildSessionIdMetaValueHtml,
    buildSessionTitlePreview,
    buildTimelineItemHtml,
    buildUsageMetaEntries,
    buildWorkspaceTrackWidths,
    escapeHtml,
    filterUnifiedSessions,
    formatTokenCount,
    readStoredAiType,
    resetHistoryStateForAiType,
    writeStoredAiType,
  } = window.AIAgentDeckModel;

  const DESKTOP_LAYOUT_QUERY = window.matchMedia("(min-width: 1081px)");
  const MIN_WORKSPACE_PANE_WIDTH = 320;

  let state = {
    aiType: readStoredAiType(window.localStorage, AI_TYPE_STORAGE_KEYS.history),
    sessions: [],
    filteredSessions: [],
    selectedIds: new Set(),
    activeSessionId: null,
    activeDetail: null,
    loadingList: false,
    loadingDetail: false,
    deleting: false,
    listError: "",
    editingTitleId: null,
    editingTitleValue: "",
    workspaceLeftWidth: null,
    activeResizeSession: null,
  };

  const elements = collectElements();
  bindEvents();
  syncModeControls();
  clearDetail("请选择一个会话。");
  loadSessions();

  function collectElements() {
    return {
      aiTypeSelect: document.getElementById("ai-type-select"),
      searchInput: document.getElementById("search-input"),
      refreshButton: document.getElementById("refresh-button"),
      workspace: document.querySelector(".workspace"),
      workspaceDivider: document.getElementById("workspace-divider"),
      deleteButton: document.getElementById("delete-button"),
      toggleAll: document.getElementById("toggle-all"),
      sessionRows: document.getElementById("session-rows"),
      sessionCount: document.getElementById("session-count"),
      selectionCount: document.getElementById("selection-count"),
      tableFeedback: document.getElementById("table-feedback"),
      detailTitle: document.getElementById("detail-title"),
      detailSubtitle: document.getElementById("detail-subtitle"),
      detailFeedback: document.getElementById("detail-feedback"),
      detailContent: document.getElementById("detail-content"),
      detailMeta: document.getElementById("detail-meta"),
      timelineList: document.getElementById("timeline-list"),
      deleteDialog: document.getElementById("delete-dialog"),
      deleteDialogCount: document.getElementById("delete-dialog-count"),
      cancelDeleteButton: document.getElementById("cancel-delete-button"),
      confirmDeleteButton: document.getElementById("confirm-delete-button"),
    };
  }

  function bindEvents() {
    elements.aiTypeSelect.addEventListener("change", changeAiType);
    elements.searchInput.addEventListener("input", renderSessions);
    elements.refreshButton.addEventListener("click", loadSessions);
    elements.toggleAll.addEventListener("change", toggleAllVisible);
    elements.deleteButton.addEventListener("click", openDeleteDialog);
    elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    elements.confirmDeleteButton.addEventListener("click", deleteSelectedSessions);
    elements.timelineList.addEventListener("click", handleTimelineActions);
    elements.detailMeta.addEventListener("click", handleDetailMetaActions);
    elements.workspaceDivider.addEventListener("pointerdown", startWorkspaceResize);
    window.addEventListener("resize", syncWorkspaceSplit);
    if (typeof DESKTOP_LAYOUT_QUERY.addEventListener === "function") {
      DESKTOP_LAYOUT_QUERY.addEventListener("change", syncWorkspaceSplit);
    } else if (typeof DESKTOP_LAYOUT_QUERY.addListener === "function") {
      DESKTOP_LAYOUT_QUERY.addListener(syncWorkspaceSplit);
    }
    syncWorkspaceSplit();
  }

  function changeAiType() {
    const nextAiType = elements.aiTypeSelect.value;
    writeStoredAiType(window.localStorage, AI_TYPE_STORAGE_KEYS.history, nextAiType);
    state = resetHistoryStateForAiType(state, nextAiType);
    state.listError = "";
    state.editingTitleId = null;
    state.editingTitleValue = "";
    syncModeControls();
    clearDetail(`已切换到 ${buildAiSourceLabel(state.aiType)}，请选择一个会话。`);
    loadSessions();
  }

  function syncModeControls() {
    elements.aiTypeSelect.value = state.aiType;
  }

  async function loadSessions() {
    const paths = buildHistoryApiPaths(state.aiType);
    state.loadingList = true;
    state.listError = "";
    elements.tableFeedback.textContent = "正在加载会话列表...";
    renderSessions();
    try {
      const payload = await api(paths.list);
      state.sessions = (Array.isArray(payload.sessions) ? payload.sessions : []).map((session) => ({
        ...session,
        aiType: state.aiType,
        source: session.source || state.aiType,
      }));
      state.selectedIds = new Set(
        [...state.selectedIds].filter((sessionId) =>
          state.sessions.some((session) => session.sessionId === sessionId),
        ),
      );
      if (
        state.activeSessionId &&
        !state.sessions.some((session) => session.sessionId === state.activeSessionId)
      ) {
        clearDetail("当前会话已经不存在。");
      }
      renderSessions();
      if (state.activeSessionId) {
        await loadSessionDetail(state.activeSessionId);
      }
    } catch (error) {
      state.listError = `加载失败：${error.message}`;
      renderSessions();
    } finally {
      state.loadingList = false;
      renderSessions();
    }
  }

  function getFilters() {
    return {
      aiType: state.aiType,
      search: elements.searchInput.value,
      source: "all",
    };
  }

  function renderSessions() {
    state.filteredSessions = filterUnifiedSessions(state.sessions, getFilters());
    elements.sessionCount.textContent = `${state.filteredSessions.length} 条`;
    elements.selectionCount.textContent = String(state.selectedIds.size);
    elements.deleteButton.disabled = state.selectedIds.size === 0 || state.deleting;
    elements.toggleAll.checked =
      state.filteredSessions.length > 0 &&
      state.filteredSessions.every((session) => state.selectedIds.has(session.sessionId));
    elements.toggleAll.indeterminate =
      state.filteredSessions.some((session) => state.selectedIds.has(session.sessionId)) &&
      !elements.toggleAll.checked;

    elements.sessionRows.innerHTML = state.filteredSessions.map(renderSessionRow).join("");
    if (state.listError) {
      elements.tableFeedback.textContent = state.listError;
    } else if (state.loadingList) {
      elements.tableFeedback.textContent = "正在加载会话列表...";
    } else {
      elements.tableFeedback.textContent = state.filteredSessions.length
        ? state.aiType === "codex"
          ? "点击会话查看详情；双击标题可重命名 Codex 会话。"
          : "点击会话查看 Claude 对话摘要。"
        : "没有匹配的会话。";
    }

    bindRowEvents();
  }

  function renderSessionRow(session) {
    const isSelected = state.activeSessionId === session.sessionId;
    const isChecked = state.selectedIds.has(session.sessionId);
    const isEditing = state.aiType === "codex" && state.editingTitleId === session.sessionId;
    const title = session.title || "未命名会话";
    const safeSessionId = escapeHtml(session.sessionId);
    const totalTokens = formatTokenCount(session.usage?.totalTokens);
    const rowNote =
      state.aiType === "codex"
        ? session.hasDetailFile
          ? "可查看详情"
          : "缺少详情文件"
        : escapeHtml(session.project || session.model || "-");
    const sourceClass = state.aiType === "claude" ? "claude" : "codex";

    return `
      <tr class="session-row${isSelected ? " selected" : ""}" data-session-id="${safeSessionId}">
        <td>
          <input class="row-checkbox" type="checkbox" data-checkbox-id="${safeSessionId}" ${
            isChecked ? "checked" : ""
          } />
        </td>
        <td><span class="source-pill ${escapeHtml(sourceClass)}">${escapeHtml(buildAiSourceLabel(state.aiType))}</span></td>
        <td><code>${safeSessionId}</code></td>
        <td>${escapeHtml(formatDate(session.updatedAt))}</td>
        <td class="token-cell">${escapeHtml(totalTokens)}</td>
        <td>
          <div class="title-cell">
            ${
              isEditing
                ? `
                  <input class="rename-input" data-rename-input-id="${safeSessionId}" value="${escapeHtml(
                    state.editingTitleValue,
                  )}" />
                  <div class="inline-note">按 Enter 保存，按 Esc 取消</div>
                `
                : `
                  <button class="title-button" type="button" data-open-id="${safeSessionId}" data-edit-id="${safeSessionId}">
                    ${escapeHtml(buildSessionTitlePreview(title, 42))}
                  </button>
                  <div class="inline-note">${rowNote}</div>
                `
            }
          </div>
        </td>
      </tr>
    `;
  }

  function bindRowEvents() {
    document.querySelectorAll("[data-checkbox-id]").forEach((checkbox) => {
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => {
        const sessionId = checkbox.getAttribute("data-checkbox-id");
        if (checkbox.checked) {
          state.selectedIds.add(sessionId);
        } else {
          state.selectedIds.delete(sessionId);
        }
        renderSessions();
      });
    });

    document.querySelectorAll(".session-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const sessionId = row.getAttribute("data-session-id");
        state.activeSessionId = sessionId;
        renderSessions();
        await loadSessionDetail(sessionId);
      });
    });

    document.querySelectorAll("[data-edit-id]").forEach((button) => {
      button.addEventListener("dblclick", (event) => {
        if (state.aiType !== "codex") {
          return;
        }
        event.stopPropagation();
        const sessionId = button.getAttribute("data-edit-id");
        const session = state.sessions.find((item) => item.sessionId === sessionId);
        state.editingTitleId = sessionId;
        state.editingTitleValue = session?.title || "";
        renderSessions();
        const input = document.querySelector(`[data-rename-input-id="${cssEscape(sessionId)}"]`);
        if (input) {
          input.focus();
          input.select();
        }
      });
    });

    document.querySelectorAll("[data-rename-input-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("input", () => {
        state.editingTitleValue = input.value;
      });
      input.addEventListener("keydown", async (event) => {
        if (event.key === "Escape") {
          state.editingTitleId = null;
          state.editingTitleValue = "";
          renderSessions();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          await renameSession(input.getAttribute("data-rename-input-id"), input.value);
        }
      });
    });
  }

  async function renameSession(sessionId, nextTitle) {
    if (state.aiType !== "codex") {
      return;
    }
    const title = nextTitle.trim();
    if (!title) {
      alert("标题不能为空。");
      return;
    }
    try {
      await api(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: { title },
      });
      state.editingTitleId = null;
      state.editingTitleValue = "";
      const session = state.sessions.find((item) => item.sessionId === sessionId);
      if (session) {
        session.title = title;
      }
      renderSessions();
      if (state.activeDetail?.sessionId === sessionId) {
        state.activeDetail.meta = {
          ...state.activeDetail.meta,
          title,
        };
        renderDetail();
      }
    } catch (error) {
      alert(`重命名失败：${error.message}`);
    }
  }

  function toggleAllVisible() {
    if (elements.toggleAll.checked) {
      state.filteredSessions.forEach((session) => state.selectedIds.add(session.sessionId));
    } else {
      state.filteredSessions.forEach((session) => state.selectedIds.delete(session.sessionId));
    }
    renderSessions();
  }

  function openDeleteDialog() {
    if (!state.selectedIds.size) {
      return;
    }
    elements.deleteDialogCount.textContent = `即将永久删除 ${state.selectedIds.size} 个 ${buildAiSourceLabel(state.aiType)} 会话。`;
    elements.deleteDialog.showModal();
  }

  function closeDeleteDialog() {
    elements.deleteDialog.close();
  }

  async function deleteSelectedSessions() {
    const sessionIds = [...state.selectedIds];
    if (!sessionIds.length) {
      return;
    }
    const paths = buildHistoryApiPaths(state.aiType);
    state.deleting = true;
    elements.confirmDeleteButton.disabled = true;
    try {
      const result = await api(paths.delete, {
        method: "DELETE",
        body: { sessionIds },
      });
      const deleted = Array.isArray(result.deleted) ? result.deleted : [];
      state.sessions = state.sessions.filter((session) => !deleted.includes(session.sessionId));
      sessionIds.forEach((sessionId) => state.selectedIds.delete(sessionId));
      if (state.activeSessionId && deleted.includes(state.activeSessionId)) {
        clearDetail("当前会话已删除。");
      }
      closeDeleteDialog();
      renderSessions();
      if (Array.isArray(result.errors) && result.errors.length) {
        alert(
          `部分删除失败：\n${result.errors
            .map((item) => `${item.sessionId}: ${item.message}`)
            .join("\n")}`,
        );
      }
    } catch (error) {
      alert(`删除失败：${error.message}`);
    } finally {
      state.deleting = false;
      elements.confirmDeleteButton.disabled = false;
      renderSessions();
    }
  }

  async function loadSessionDetail(sessionId) {
    const paths = buildHistoryApiPaths(state.aiType, sessionId);
    state.loadingDetail = true;
    elements.detailFeedback.textContent = "正在加载详情...";
    elements.detailFeedback.classList.remove("hidden");
    elements.detailContent.classList.add("hidden");
    try {
      state.activeDetail = await api(paths.detail);
      state.activeSessionId = sessionId;
      renderDetail();
    } catch (error) {
      clearDetail(`详情加载失败：${error.message}`);
    } finally {
      state.loadingDetail = false;
    }
  }

  function renderDetail() {
    const detail = state.activeDetail;
    if (!detail) {
      clearDetail("请选择一个会话。");
      return;
    }

    const session = state.sessions.find((item) => item.sessionId === detail.sessionId);
    const title = detail.meta?.title || session?.title || detail.sessionId;
    elements.detailTitle.textContent = buildSessionTitlePreview(title, 140);
    elements.detailTitle.title = title;
    elements.detailSubtitle.textContent =
      state.aiType === "codex"
        ? `${detail.timeline?.length || 0} 条对话摘要`
        : `${detail.timeline?.length || 0} 条 Claude 摘要`;
    elements.detailMeta.innerHTML = buildMetaHtml(detail, session);
    elements.timelineList.innerHTML = (detail.timeline || []).length
      ? detail.timeline.map((item) => buildTimelineItemHtml(item, { formatDate })).join("")
      : '<div class="feedback muted">没有可展示的对话摘要。</div>';
    elements.detailFeedback.classList.add("hidden");
    elements.detailContent.classList.remove("hidden");
  }

  function buildMetaHtml(detail, session) {
    const entries =
      state.aiType === "codex"
        ? [
            {
              key: "会话 ID",
              valueHtml: buildSessionIdMetaValueHtml(detail.sessionId),
            },
            ["AI 类型", "Codex"],
            ["标题", detail.meta?.title || "-"],
            ["更新时间", formatDate(detail.meta?.updatedAt || detail.meta?.timestamp)],
            ["工作目录", detail.meta?.cwd || "-"],
            ...buildUsageMetaEntries(detail.usage),
          ]
        : [
            {
              key: "会话 ID",
              valueHtml: buildSessionIdMetaValueHtml(detail.sessionId),
            },
            ["AI 类型", "Claude"],
            ["项目", detail.meta?.path || session?.project || "-"],
            ["工作目录", detail.meta?.cwd || "-"],
            ["模型", detail.model || session?.model || "-"],
            ["原始事件", String(detail.totalEvents || 0)],
            ...buildUsageMetaEntries(detail.usage),
          ];

    return entries
      .map((entry) => {
        if (Array.isArray(entry)) {
          const [key, value] = entry;
          return `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value || "-"))}</dd>`;
        }
        return `<dt>${escapeHtml(entry.key)}</dt><dd>${entry.valueHtml}</dd>`;
      })
      .join("");
  }

  async function handleTimelineActions(event) {
    const button = event.target.closest("[data-copy-markdown]");
    if (!button) {
      return;
    }
    const markdown = button.getAttribute("data-copy-markdown") || "";
    const originalLabel = button.textContent;
    button.disabled = true;
    try {
      await copyText(markdown);
      button.textContent = "已复制";
    } catch (error) {
      button.textContent = "复制失败";
      alert(`复制失败：${error.message}`);
    } finally {
      window.setTimeout(() => {
        button.textContent = originalLabel;
        button.disabled = false;
      }, 1200);
    }
  }

  async function handleDetailMetaActions(event) {
    const button = event.target.closest("[data-resume-session-id]");
    if (!button) {
      return;
    }
    const sessionId = button.getAttribute("data-resume-session-id") || "";
    const resumePath = buildHistoryApiPaths(state.aiType, sessionId).resume;
    if (!resumePath) {
      return;
    }
    const originalLabel = button.textContent;
    button.disabled = true;
    try {
      await api(resumePath, { method: "POST" });
      button.textContent = "已启动";
    } catch (error) {
      button.textContent = "启动失败";
      alert(`切换会话失败：${error.message}`);
    } finally {
      window.setTimeout(() => {
        button.textContent = originalLabel;
        button.disabled = false;
      }, 1200);
    }
  }

  function clearDetail(message) {
    state.activeSessionId = null;
    state.activeDetail = null;
    elements.detailTitle.textContent = "会话详情";
    elements.detailTitle.removeAttribute("title");
    elements.detailSubtitle.textContent = "选择左侧会话以查看详情。";
    elements.detailFeedback.textContent = message;
    elements.detailFeedback.classList.remove("hidden");
    elements.detailContent.classList.add("hidden");
  }

  function startWorkspaceResize(event) {
    if (!isDesktopLayout() || event.button !== 0) {
      return;
    }
    const workspaceRect = elements.workspace.getBoundingClientRect();
    if (!workspaceRect.width) {
      return;
    }
    stopWorkspaceResize();
    event.preventDefault();
    document.body.classList.add("workspace-resizing");
    elements.workspaceDivider.classList.add("dragging");
    const pointerId = event.pointerId;
    if (typeof elements.workspaceDivider.setPointerCapture === "function") {
      elements.workspaceDivider.setPointerCapture(pointerId);
    }
    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId === pointerId) {
        applyWorkspaceSplit(moveEvent.clientX);
      }
    };
    const handlePointerEnd = (endEvent) => {
      if (endEvent.pointerId === pointerId) {
        stopWorkspaceResize();
      }
    };
    state.activeResizeSession = {
      pointerId,
      handlePointerMove,
      handlePointerEnd,
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    applyWorkspaceSplit(event.clientX);
  }

  function stopWorkspaceResize() {
    const activeSession = state.activeResizeSession;
    if (!activeSession) {
      document.body.classList.remove("workspace-resizing");
      elements.workspaceDivider.classList.remove("dragging");
      return;
    }
    window.removeEventListener("pointermove", activeSession.handlePointerMove);
    window.removeEventListener("pointerup", activeSession.handlePointerEnd);
    window.removeEventListener("pointercancel", activeSession.handlePointerEnd);
    if (typeof elements.workspaceDivider.releasePointerCapture === "function") {
      try {
        elements.workspaceDivider.releasePointerCapture(activeSession.pointerId);
      } catch (error) {
        // Browser may already have released pointer capture.
      }
    }
    state.activeResizeSession = null;
    document.body.classList.remove("workspace-resizing");
    elements.workspaceDivider.classList.remove("dragging");
  }

  function applyWorkspaceSplit(pointerClientX) {
    if (!isDesktopLayout()) {
      return;
    }
    const workspaceRect = elements.workspace.getBoundingClientRect();
    const dividerWidth = elements.workspaceDivider.getBoundingClientRect().width || 14;
    const requestedLeftWidth = pointerClientX - workspaceRect.left - dividerWidth / 2;
    const split = buildWorkspaceTrackWidths({
      nextLeftWidth: requestedLeftWidth,
      workspaceWidth: workspaceRect.width,
      dividerWidth,
      minPaneWidth: MIN_WORKSPACE_PANE_WIDTH,
    });
    state.workspaceLeftWidth = split.leftWidth;
    elements.workspace.style.setProperty("--workspace-left-width", split.leftTrackWidth);
    elements.workspace.style.setProperty("--workspace-right-width", split.rightTrackWidth);
  }

  function syncWorkspaceSplit() {
    if (!isDesktopLayout()) {
      stopWorkspaceResize();
      elements.workspace.style.removeProperty("--workspace-left-width");
      elements.workspace.style.removeProperty("--workspace-right-width");
      return;
    }
    if (state.workspaceLeftWidth == null) {
      elements.workspace.style.removeProperty("--workspace-left-width");
      elements.workspace.style.removeProperty("--workspace-right-width");
      return;
    }
    const workspaceRect = elements.workspace.getBoundingClientRect();
    const dividerWidth = elements.workspaceDivider.getBoundingClientRect().width || 14;
    const split = buildWorkspaceTrackWidths({
      nextLeftWidth: state.workspaceLeftWidth,
      workspaceWidth: workspaceRect.width,
      dividerWidth,
      minPaneWidth: MIN_WORKSPACE_PANE_WIDTH,
    });
    state.workspaceLeftWidth = split.leftWidth;
    elements.workspace.style.setProperty("--workspace-left-width", split.leftTrackWidth);
    elements.workspace.style.setProperty("--workspace-right-width", split.rightTrackWidth);
  }

  function isDesktopLayout() {
    return DESKTOP_LAYOUT_QUERY.matches;
  }

  async function api(pathname, options) {
    const response = await fetch(pathname, {
      method: options?.method || "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.className = "clipboard-fallback";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("浏览器不支持写入剪贴板。");
    }
  }
})();
