"use strict";

(function bootstrapProfiles() {
  const {
    AI_TYPE_STORAGE_KEYS,
    buildAiSourceLabel,
    buildClaudeCurrentConfigMetaEntries,
    buildClaudeProfileMetaEntries,
    buildCurrentConfigMetaEntries,
    buildProfileApiPaths,
    buildProfileMetaEntries,
    escapeHtml,
    readStoredAiType,
    sortProfilesForDisplay,
    validateClaudeProfileDraft,
    validateProfileDraft,
    writeStoredAiType,
  } = window.AIAgentDeckModel;

  const state = {
    aiType: readStoredAiType(window.localStorage, AI_TYPE_STORAGE_KEYS.profiles),
    profiles: [],
    activeProfileId: null,
    lastActivatedProfileId: null,
    currentConfig: null,
    hasUnmanagedActiveConfig: false,
    selectedProfileId: null,
    selectedProfile: null,
    draft: createEmptyDraft("codex"),
    formErrors: {},
    loadingList: false,
    loadingDetail: false,
    saving: false,
    activating: false,
    deleting: false,
    listError: "",
  };

  const elements = collectElements();
  bindEvents();
  syncModeControls();
  loadProfiles();

  function collectElements() {
    return {
      aiTypeSelect: document.getElementById("profile-ai-type-select"),
      refreshButton: document.getElementById("profiles-refresh-button"),
      newProfileButton: document.getElementById("new-profile-button"),
      profilesCount: document.getElementById("profiles-count"),
      profilesList: document.getElementById("profiles-list"),
      profilesListFeedback: document.getElementById("profiles-list-feedback"),
      statusText: document.getElementById("profiles-status-text"),
      currentConfig: document.getElementById("profiles-current-config"),
      formTitle: document.getElementById("profile-form-title"),
      formSubtitle: document.getElementById("profile-form-subtitle"),
      form: document.getElementById("profile-form"),
      codexFields: document.getElementById("codex-profile-fields"),
      claudeFields: document.getElementById("claude-profile-fields"),
      nameInput: document.getElementById("profile-name-input"),
      providerInput: document.getElementById("profile-provider-input"),
      apiKeyInput: document.getElementById("profile-api-key-input"),
      baseUrlInput: document.getElementById("profile-base-url-input"),
      modelInput: document.getElementById("profile-model-input"),
      modelReasoningEffortInput: document.getElementById(
        "profile-model-reasoning-effort-input",
      ),
      claudeBaseUrlInput: document.getElementById("claude-profile-base-url-input"),
      claudeApiKeyInput: document.getElementById("claude-profile-api-key-input"),
      claudeDefaultModelInput: document.getElementById(
        "claude-profile-default-model-input",
      ),
      nameError: document.getElementById("profile-name-error"),
      providerError: document.getElementById("profile-provider-error"),
      apiKeyError: document.getElementById("profile-api-key-error"),
      baseUrlError: document.getElementById("profile-base-url-error"),
      claudeBaseUrlError: document.getElementById("claude-profile-base-url-error"),
      claudeApiKeyError: document.getElementById("claude-profile-api-key-error"),
      claudeDefaultModelError: document.getElementById(
        "claude-profile-default-model-error",
      ),
      saveButton: document.getElementById("save-profile-button"),
      copyButton: document.getElementById("copy-profile-button"),
      activateButton: document.getElementById("activate-profile-button"),
      deleteButton: document.getElementById("delete-profile-button"),
      deleteDialog: document.getElementById("profile-delete-dialog"),
      deleteDialogText: document.getElementById("profile-delete-dialog-text"),
      cancelDeleteButton: document.getElementById("cancel-profile-delete-button"),
      confirmDeleteButton: document.getElementById("confirm-profile-delete-button"),
    };
  }

  function bindEvents() {
    elements.aiTypeSelect.addEventListener("change", changeAiType);
    elements.refreshButton.addEventListener("click", () => loadProfiles(state.selectedProfileId));
    elements.newProfileButton.addEventListener("click", startCreatingProfile);
    elements.form.addEventListener("submit", saveProfile);
    elements.copyButton.addEventListener("click", copyProfile);
    elements.activateButton.addEventListener("click", activateProfile);
    elements.deleteButton.addEventListener("click", openDeleteDialog);
    elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    elements.confirmDeleteButton.addEventListener("click", deleteProfile);

    [
      elements.nameInput,
      elements.providerInput,
      elements.apiKeyInput,
      elements.baseUrlInput,
      elements.modelInput,
      elements.modelReasoningEffortInput,
      elements.claudeBaseUrlInput,
      elements.claudeApiKeyInput,
      elements.claudeDefaultModelInput,
    ].forEach((input) => input.addEventListener("input", handleDraftChange));
  }

  function changeAiType() {
    state.aiType = elements.aiTypeSelect.value;
    writeStoredAiType(window.localStorage, AI_TYPE_STORAGE_KEYS.profiles, state.aiType);
    state.profiles = [];
    state.activeProfileId = null;
    state.lastActivatedProfileId = null;
    state.currentConfig = null;
    state.hasUnmanagedActiveConfig = false;
    state.selectedProfileId = null;
    state.selectedProfile = null;
    state.draft = createEmptyDraft(state.aiType);
    state.formErrors = {};
    state.listError = "";
    syncModeControls();
    render();
    loadProfiles();
  }

  function syncModeControls() {
    elements.aiTypeSelect.value = state.aiType;
    const isClaude = state.aiType === "claude";
    elements.codexFields.classList.toggle("hidden", isClaude);
    elements.claudeFields.classList.toggle("hidden", !isClaude);
  }

  async function loadProfiles(nextSelectedId) {
    const paths = buildProfileApiPaths(state.aiType);
    state.loadingList = true;
    state.listError = "";
    render();
    try {
      const payload = await api(paths.list);
      state.profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
      state.activeProfileId = payload.activeProfileId || null;
      state.lastActivatedProfileId = payload.lastActivatedProfileId || null;
      state.currentConfig = payload.currentConfig || null;
      state.hasUnmanagedActiveConfig = Boolean(payload.hasUnmanagedActiveConfig);

      const preferredId =
        nextSelectedId ||
        state.selectedProfileId ||
        state.activeProfileId ||
        state.profiles[0]?.id ||
        null;

      if (preferredId && state.profiles.some((profile) => profile.id === preferredId)) {
        await loadProfileDetail(preferredId);
      } else {
        startCreatingProfile(false);
      }
    } catch (error) {
      state.listError = `加载失败：${error.message}`;
    } finally {
      state.loadingList = false;
      render();
    }
  }

  async function loadProfileDetail(profileId) {
    state.loadingDetail = true;
    render();
    try {
      const detail = await api(buildProfileApiPaths(state.aiType, profileId).detail);
      state.selectedProfileId = profileId;
      state.selectedProfile = detail;
      state.draft = profileToDraft(detail);
      state.formErrors = {};
    } catch (error) {
      alert(`加载方案失败：${error.message}`);
    } finally {
      state.loadingDetail = false;
      render();
    }
  }

  function startCreatingProfile(shouldRender = true) {
    state.selectedProfileId = null;
    state.selectedProfile = null;
    state.draft = createEmptyDraft(state.aiType);
    state.formErrors = {};
    if (shouldRender) {
      render();
      elements.nameInput.focus();
    }
  }

  function handleDraftChange() {
    state.draft =
      state.aiType === "claude"
        ? {
            name: elements.nameInput.value,
            baseUrl: elements.claudeBaseUrlInput.value,
            apiKey: elements.claudeApiKeyInput.value,
            defaultModel: elements.claudeDefaultModelInput.value,
          }
        : {
            name: elements.nameInput.value,
            provider: elements.providerInput.value,
            apiKey: elements.apiKeyInput.value,
            baseUrl: elements.baseUrlInput.value,
            model: elements.modelInput.value,
            modelReasoningEffort: elements.modelReasoningEffortInput.value,
          };
    state.formErrors = {};
    renderForm();
  }

  async function saveProfile(event) {
    event.preventDefault();
    const errors =
      state.aiType === "claude"
        ? validateClaudeProfileDraft(state.draft)
        : validateProfileDraft(state.draft);
    state.formErrors = errors;
    renderForm();
    if (Object.keys(errors).length) {
      return;
    }

    state.saving = true;
    renderForm();
    try {
      const paths = buildProfileApiPaths(state.aiType, state.selectedProfileId);
      const payload = state.selectedProfileId
        ? await api(paths.detail, {
            method: "PATCH",
            body: state.draft,
          })
        : await api(buildProfileApiPaths(state.aiType).list, {
            method: "POST",
            body: state.draft,
          });
      await loadProfiles(payload.id);
    } catch (error) {
      alert(`保存失败：${error.message}`);
    } finally {
      state.saving = false;
      renderForm();
    }
  }

  async function copyProfile() {
    if (!state.selectedProfileId) {
      return;
    }

    state.saving = true;
    renderForm();
    try {
      const payload = await api(buildProfileApiPaths(state.aiType, state.selectedProfileId).copy, {
        method: "POST",
      });
      await loadProfiles(payload.id);
    } catch (error) {
      alert(`复制失败：${error.message}`);
    } finally {
      state.saving = false;
      renderForm();
    }
  }

  async function activateProfile() {
    if (!state.selectedProfileId) {
      alert("请先保存方案，再切换为当前方案。");
      return;
    }
    if (isDraftDirty()) {
      alert("当前有未保存修改，请先保存后再切换。");
      return;
    }
    state.activating = true;
    renderForm();
    try {
      await api(buildProfileApiPaths(state.aiType, state.selectedProfileId).activate, {
        method: "POST",
      });
      await loadProfiles(state.selectedProfileId);
    } catch (error) {
      alert(`切换失败：${error.message}`);
    } finally {
      state.activating = false;
      renderForm();
    }
  }

  function openDeleteDialog() {
    if (!state.selectedProfileId || !state.selectedProfile) {
      return;
    }
    elements.deleteDialogText.textContent = `即将删除 ${buildAiSourceLabel(state.aiType)} 方案“${state.selectedProfile.name}”。`;
    elements.deleteDialog.showModal();
  }

  function closeDeleteDialog() {
    elements.deleteDialog.close();
  }

  async function deleteProfile() {
    if (!state.selectedProfileId || !state.selectedProfile) {
      return;
    }
    state.deleting = true;
    renderForm();
    try {
      await api(buildProfileApiPaths(state.aiType, state.selectedProfileId).delete, {
        method: "DELETE",
      });
      closeDeleteDialog();
      startCreatingProfile(false);
      await loadProfiles();
    } catch (error) {
      alert(`删除失败：${error.message}`);
    } finally {
      state.deleting = false;
      renderForm();
    }
  }

  function render() {
    syncModeControls();
    renderStatus();
    renderList();
    renderForm();
  }

  function renderStatus() {
    if (!state.currentConfig) {
      elements.statusText.textContent =
        state.listError || `正在读取当前 ${buildAiSourceLabel(state.aiType)} 配置...`;
      elements.currentConfig.innerHTML = "";
      return;
    }

    if (state.activeProfileId) {
      const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
      elements.statusText.textContent = activeProfile
        ? `当前正在使用方案：${activeProfile.name}`
        : "当前配置已匹配某个已保存方案。";
    } else if (state.hasUnmanagedActiveConfig) {
      elements.statusText.textContent = "当前配置未绑定到已保存方案。";
    } else {
      elements.statusText.textContent = "当前尚未检测到可识别的生效配置。";
    }

    const entries =
      state.aiType === "claude"
        ? buildClaudeCurrentConfigMetaEntries(state.currentConfig)
        : buildCurrentConfigMetaEntries(state.currentConfig);
    elements.currentConfig.innerHTML = entries
      .map(
        ([key, value]) =>
          `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value || "-"))}</dd>`,
      )
      .join("");
  }

  function renderList() {
    const profiles = sortProfilesForDisplay(state.profiles);
    elements.profilesCount.textContent = `${profiles.length} 条`;

    if (state.listError) {
      elements.profilesListFeedback.textContent = state.listError;
    } else if (state.loadingList) {
      elements.profilesListFeedback.textContent = "正在加载方案列表...";
    } else if (!profiles.length) {
      elements.profilesListFeedback.textContent = `还没有保存的 ${buildAiSourceLabel(state.aiType)} 方案。`;
    } else {
      elements.profilesListFeedback.textContent = "点击左侧方案可查看详情并编辑。";
    }

    elements.profilesList.innerHTML = profiles.map((profile) => renderProfileItem(profile)).join("");
    document.querySelectorAll("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadProfileDetail(button.getAttribute("data-profile-id"));
      });
    });
  }

  function renderProfileItem(profile) {
    const isSelected = state.selectedProfileId === profile.id;
    const entries =
      state.aiType === "claude"
        ? buildClaudeProfileMetaEntries(profile)
        : buildProfileMetaEntries(profile);
    return `
      <button
        class="profile-item${isSelected ? " selected" : ""}"
        type="button"
        data-profile-id="${escapeHtml(profile.id)}"
      >
        <div class="profile-item-heading">
          <strong>${escapeHtml(profile.name)}</strong>
          ${profile.isActive ? '<span class="status-badge">在用</span>' : ""}
        </div>
        <div class="profile-item-meta">AI 类型: ${escapeHtml(buildAiSourceLabel(state.aiType))}</div>
        ${entries.map(([label, value]) => renderProfileMetaLine(label, value)).join("")}
      </button>
    `;
  }

  function renderProfileMetaLine(label, value) {
    return `<div class="profile-item-meta">${escapeHtml(label)}: ${escapeHtml(String(value || "-"))}</div>`;
  }

  function renderForm() {
    const isEditMode = Boolean(state.selectedProfileId);
    const selectedName = state.selectedProfile?.name || "新建方案";

    elements.formTitle.textContent = isEditMode ? selectedName : "新建方案";
    elements.formSubtitle.textContent = isEditMode
      ? state.selectedProfile?.isActive
        ? "该方案当前正在生效。"
        : "可以修改方案信息，或切换为当前方案。"
      : `填写 ${buildAiSourceLabel(state.aiType)} 方案字段后保存。`;

    elements.nameInput.value = state.draft.name || "";
    elements.providerInput.value = state.draft.provider || "Custom";
    elements.apiKeyInput.value = state.draft.apiKey || "";
    elements.baseUrlInput.value = state.draft.baseUrl || "";
    elements.modelInput.value = state.draft.model || "";
    elements.modelReasoningEffortInput.value = state.draft.modelReasoningEffort || "";
    elements.claudeBaseUrlInput.value = state.draft.baseUrl || "";
    elements.claudeApiKeyInput.value = state.draft.apiKey || "";
    elements.claudeDefaultModelInput.value = state.draft.defaultModel || "";

    setFieldError(elements.nameError, state.formErrors.name);
    setFieldError(elements.providerError, state.formErrors.provider);
    setFieldError(elements.apiKeyError, state.formErrors.apiKey);
    setFieldError(elements.baseUrlError, state.formErrors.baseUrl);
    setFieldError(elements.claudeBaseUrlError, state.formErrors.baseUrl);
    setFieldError(elements.claudeApiKeyError, state.formErrors.apiKey);
    setFieldError(elements.claudeDefaultModelError, state.formErrors.defaultModel);

    elements.saveButton.textContent = isEditMode ? "保存修改" : "新增方案";
    elements.saveButton.disabled = state.saving || state.activating || state.deleting;
    elements.copyButton.disabled = !isEditMode || state.saving || state.activating || state.deleting;
    elements.activateButton.disabled =
      !isEditMode || state.saving || state.activating || state.deleting;
    elements.activateButton.textContent = state.activating ? "切换中..." : "切换为当前方案";
    elements.deleteButton.disabled =
      !isEditMode || state.saving || state.activating || state.deleting;
  }

  function setFieldError(element, message) {
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
  }

  function isDraftDirty() {
    if (!state.selectedProfile) {
      return false;
    }
    const current = profileToDraft(state.selectedProfile);
    return Object.keys(current).some((key) => (state.draft[key] || "") !== (current[key] || ""));
  }

  function profileToDraft(profile) {
    if (state.aiType === "claude") {
      return {
        name: profile.name || "",
        baseUrl: profile.baseUrl || "",
        apiKey: profile.apiKey || "",
        defaultModel: profile.defaultModel || "",
      };
    }
    return {
      name: profile.name || "",
      provider: profile.provider || "Custom",
      apiKey: profile.apiKey || "",
      baseUrl: profile.baseUrl || "",
      model: profile.model || "",
      modelReasoningEffort: profile.modelReasoningEffort || "",
    };
  }

  function createEmptyDraft(aiType) {
    if (aiType === "claude") {
      return {
        name: "",
        baseUrl: "",
        apiKey: "",
        defaultModel: "",
      };
    }
    return {
      name: "",
      provider: "Custom",
      apiKey: "",
      baseUrl: "",
      model: "",
      modelReasoningEffort: "",
    };
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
})();
