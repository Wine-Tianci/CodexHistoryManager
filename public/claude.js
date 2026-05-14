"use strict";

(function bootstrapClaudeHistory() {
  const {
    buildTimelineItemHtml,
    buildWorkspaceTrackWidths,
    escapeHtml,
    filterClaudeSessions,
  } = window.AIAgentDeckModel;
  const DESKTOP_LAYOUT_QUERY = window.matchMedia("(min-width: 1081px)");
  const MIN_WORKSPACE_PANE_WIDTH = 320;

  const state = {
    sessions: [],
    filteredSessions: [],
    selectedIds: new Set(),
    activeSessionId: null,
    activeDetail: null,
    listError: "",
    workspaceLeftWidth: null,
    activeResizeSession: null,
  };

  const elements = collectElements();
  bindEvents();
  loadSessions();

  function collectElements() {
    return {
      searchInput: document.getElementById("claude-search-input"),
      refreshButton: document.getElementById("claude-refresh-button"),
      deleteButton: document.getElementById("claude-delete-button"),
      toggleAll: document.getElementById("claude-toggle-all"),
      sessionRows: document.getElementById("claude-session-rows"),
      sessionCount: document.getElementById("claude-session-count"),
      selectionCount: document.getElementById("claude-selection-count"),
      tableFeedback: document.getElementById("claude-table-feedback"),
      detailTitle: document.getElementById("claude-detail-title"),
      detailSubtitle: document.getElementById("claude-detail-subtitle"),
      detailFeedback: document.getElementById("claude-detail-feedback"),
      detailContent: document.getElementById("claude-detail-content"),
      detailMeta: document.getElementById("claude-detail-meta"),
      timelineList: document.getElementById("claude-timeline-list"),
      workspace: document.querySelector(".workspace"),
      workspaceDivider: document.getElementById("claude-workspace-divider"),
    };
  }

  function bindEvents() {
    elements.searchInput.addEventListener("input", renderSessions);
    elements.refreshButton.addEventListener("click", loadSessions);
    elements.toggleAll.addEventListener("change", toggleAllVisible);
    elements.deleteButton.addEventListener("click", deleteSelectedSessions);
    elements.workspaceDivider.addEventListener("pointerdown", startWorkspaceResize);
    window.addEventListener("resize", syncWorkspaceSplit);
    if (typeof DESKTOP_LAYOUT_QUERY.addEventListener === "function") {
      DESKTOP_LAYOUT_QUERY.addEventListener("change", syncWorkspaceSplit);
    } else if (typeof DESKTOP_LAYOUT_QUERY.addListener === "function") {
      DESKTOP_LAYOUT_QUERY.addListener(syncWorkspaceSplit);
    }
    syncWorkspaceSplit();
  }

  async function loadSessions() {
    elements.tableFeedback.textContent = "Loading Claude sessions...";
    try {
      const payload = await api("/api/claude/sessions");
      state.sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      state.selectedIds = new Set(
        [...state.selectedIds].filter((sessionId) =>
          state.sessions.some((session) => session.sessionId === sessionId),
        ),
      );
      renderSessions();
      if (state.activeSessionId) {
        await loadDetail(state.activeSessionId);
      }
    } catch (error) {
      state.listError = error.message;
      renderSessions();
    }
  }

  function renderSessions() {
    state.filteredSessions = filterClaudeSessions(state.sessions, {
      search: elements.searchInput.value,
    });
    elements.sessionCount.textContent = `${state.filteredSessions.length} items`;
    elements.selectionCount.textContent = String(state.selectedIds.size);
    elements.deleteButton.disabled = state.selectedIds.size === 0;
    elements.toggleAll.checked =
      state.filteredSessions.length > 0 &&
      state.filteredSessions.every((session) => state.selectedIds.has(session.sessionId));
    elements.toggleAll.indeterminate =
      state.filteredSessions.some((session) => state.selectedIds.has(session.sessionId)) &&
      !elements.toggleAll.checked;

    elements.sessionRows.innerHTML = state.filteredSessions.map(renderRow).join("");
    elements.tableFeedback.textContent = state.listError
      ? state.listError
      : state.filteredSessions.length
        ? "Open a session to inspect timeline items and raw metadata."
        : "No Claude sessions found.";
    bindRowEvents();
  }

  function renderRow(session) {
    const isSelected = state.activeSessionId === session.sessionId;
    const isChecked = state.selectedIds.has(session.sessionId);
    return `
      <tr class="session-row${isSelected ? " selected" : ""}" data-session-id="${escapeHtml(session.sessionId)}">
        <td>
          <input class="row-checkbox" type="checkbox" data-checkbox-id="${escapeHtml(session.sessionId)}" ${
            isChecked ? "checked" : ""
          } />
        </td>
        <td><code>${escapeHtml(session.sessionId)}</code></td>
        <td>${escapeHtml(formatDate(session.updatedAt))}</td>
        <td>${escapeHtml(session.model || "-")}</td>
        <td>
          <div class="title-cell">
            <button class="title-button" type="button" data-open-id="${escapeHtml(session.sessionId)}">
              ${escapeHtml(session.title || "Untitled Session")}
            </button>
            <div class="inline-note">${escapeHtml(session.project || "-")}</div>
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
        await loadDetail(sessionId);
      });
    });
  }

  function toggleAllVisible() {
    if (elements.toggleAll.checked) {
      state.filteredSessions.forEach((session) => state.selectedIds.add(session.sessionId));
    } else {
      state.filteredSessions.forEach((session) => state.selectedIds.delete(session.sessionId));
    }
    renderSessions();
  }

  async function deleteSelectedSessions() {
    const sessionIds = [...state.selectedIds];
    if (!sessionIds.length) {
      return;
    }
    if (!window.confirm(`Delete ${sessionIds.length} Claude session(s)?`)) {
      return;
    }
    try {
      const payload = await api("/api/claude/sessions", {
        method: "DELETE",
        body: { sessionIds },
      });
      state.sessions = state.sessions.filter(
        (session) => !payload.deleted.includes(session.sessionId),
      );
      sessionIds.forEach((sessionId) => state.selectedIds.delete(sessionId));
      if (state.activeSessionId && payload.deleted.includes(state.activeSessionId)) {
        clearDetail("The active Claude session was deleted.");
      }
      renderSessions();
    } catch (error) {
      window.alert(`Delete failed: ${error.message}`);
    }
  }

  async function loadDetail(sessionId) {
    elements.detailFeedback.textContent = "Loading Claude detail...";
    elements.detailFeedback.classList.remove("hidden");
    elements.detailContent.classList.add("hidden");
    try {
      state.activeDetail = await api(`/api/claude/sessions/${encodeURIComponent(sessionId)}`);
      renderDetail();
    } catch (error) {
      clearDetail(`Detail load failed: ${error.message}`);
    }
  }

  function renderDetail() {
    const detail = state.activeDetail;
    if (!detail) {
      clearDetail("No Claude session selected.");
      return;
    }
    const session = state.sessions.find((item) => item.sessionId === detail.sessionId);
    elements.detailTitle.textContent = session?.title || detail.sessionId;
    elements.detailSubtitle.textContent = `${detail.timeline.length} timeline item(s)`;
    elements.detailMeta.innerHTML = [
      ["Session ID", detail.sessionId],
      ["Project", detail.meta?.path || session?.project || "-"],
      ["CWD", detail.meta?.cwd || "-"],
      ["Model", detail.model || session?.model || "-"],
      ["Raw Events", String(detail.totalEvents || 0)],
    ]
      .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
      .join("");
    elements.timelineList.innerHTML = detail.timeline.length
      ? detail.timeline.map((item) => buildTimelineItemHtml(item, { formatDate })).join("")
      : '<div class="feedback muted">No Claude timeline items available.</div>';
    elements.detailFeedback.classList.add("hidden");
    elements.detailContent.classList.remove("hidden");
  }

  function clearDetail(message) {
    state.activeSessionId = null;
    state.activeDetail = null;
    elements.detailTitle.textContent = "Claude Session Detail";
    elements.detailSubtitle.textContent = "Select a session to inspect the transcript summary.";
    elements.detailFeedback.textContent = message;
    elements.detailFeedback.classList.remove("hidden");
    elements.detailContent.classList.add("hidden");
    renderSessions();
  }

  function startWorkspaceResize(event) {
    if (!DESKTOP_LAYOUT_QUERY.matches || event.button !== 0) {
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
    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      applyWorkspaceSplit(moveEvent.clientX);
    };
    const handlePointerEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }
      stopWorkspaceResize();
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
    state.activeResizeSession = null;
    document.body.classList.remove("workspace-resizing");
    elements.workspaceDivider.classList.remove("dragging");
  }

  function applyWorkspaceSplit(pointerClientX) {
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
    if (!DESKTOP_LAYOUT_QUERY.matches) {
      stopWorkspaceResize();
      elements.workspace.style.removeProperty("--workspace-left-width");
      elements.workspace.style.removeProperty("--workspace-right-width");
      return;
    }
    if (state.workspaceLeftWidth == null) {
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
})();
