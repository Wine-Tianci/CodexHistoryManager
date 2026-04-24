"use strict";

(function bootstrapProfiles() {
  const {
    buildCurrentConfigMetaEntries,
    buildProfileMetaEntries,
    escapeHtml,
    sortProfilesForDisplay,
    validateProfileDraft,
  } = window.CodexHistoryModel;

  const state = {
    profiles: [],
    activeProfileId: null,
    lastActivatedProfileId: null,
    currentConfig: null,
    hasUnmanagedActiveConfig: false,
    selectedProfileId: null,
    selectedProfile: null,
    draft: createEmptyDraft(),
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
  loadProfiles();

  function collectElements() {
    return {
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
      nameInput: document.getElementById("profile-name-input"),
      providerInput: document.getElementById("profile-provider-input"),
      apiKeyInput: document.getElementById("profile-api-key-input"),
      baseUrlInput: document.getElementById("profile-base-url-input"),
      modelInput: document.getElementById("profile-model-input"),
      modelReasoningEffortInput: document.getElementById(
        "profile-model-reasoning-effort-input",
      ),
      nameError: document.getElementById("profile-name-error"),
      providerError: document.getElementById("profile-provider-error"),
      apiKeyError: document.getElementById("profile-api-key-error"),
      baseUrlError: document.getElementById("profile-base-url-error"),
      saveButton: document.getElementById("save-profile-button"),
      activateButton: document.getElementById("activate-profile-button"),
      deleteButton: document.getElementById("delete-profile-button"),
      deleteDialog: document.getElementById("profile-delete-dialog"),
      deleteDialogText: document.getElementById("profile-delete-dialog-text"),
      cancelDeleteButton: document.getElementById("cancel-profile-delete-button"),
      confirmDeleteButton: document.getElementById("confirm-profile-delete-button"),
    };
  }

  function bindEvents() {
    elements.refreshButton.addEventListener("click", () => loadProfiles(state.selectedProfileId));
    elements.newProfileButton.addEventListener("click", startCreatingProfile);
    elements.form.addEventListener("submit", saveProfile);
    elements.activateButton.addEventListener("click", activateProfile);
    elements.deleteButton.addEventListener("click", openDeleteDialog);
    elements.cancelDeleteButton.addEventListener("click", closeDeleteDialog);
    elements.confirmDeleteButton.addEventListener("click", deleteProfile);

    elements.nameInput.addEventListener("input", handleDraftChange);
    elements.providerInput.addEventListener("input", handleDraftChange);
    elements.apiKeyInput.addEventListener("input", handleDraftChange);
    elements.baseUrlInput.addEventListener("input", handleDraftChange);
    elements.modelInput.addEventListener("input", handleDraftChange);
    elements.modelReasoningEffortInput.addEventListener("input", handleDraftChange);
  }

  async function loadProfiles(nextSelectedId) {
    state.loadingList = true;
    state.listError = "";
    render();
    try {
      const payload = await api("/api/profiles");
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
      const detail = await api(`/api/profiles/${encodeURIComponent(profileId)}`);
      state.selectedProfileId = profileId;
      state.selectedProfile = detail;
      state.draft = {
        name: detail.name || "",
        provider: detail.provider || "Custom",
        apiKey: detail.apiKey || "",
        baseUrl: detail.baseUrl || "",
        model: detail.model || "",
        modelReasoningEffort: detail.modelReasoningEffort || "",
      };
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
    state.draft = createEmptyDraft();
    state.formErrors = {};
    if (shouldRender) {
      render();
      elements.nameInput.focus();
    }
  }

  function handleDraftChange() {
    state.draft = {
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
    const errors = validateProfileDraft(state.draft);
    state.formErrors = errors;
    renderForm();
    if (Object.keys(errors).length) {
      return;
    }

    state.saving = true;
    renderForm();
    try {
      const payload = state.selectedProfileId
        ? await api(`/api/profiles/${encodeURIComponent(state.selectedProfileId)}`, {
            method: "PATCH",
            body: state.draft,
          })
        : await api("/api/profiles", {
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

  async function activateProfile() {
    if (!state.selectedProfileId) {
      alert("请先保存方案，再执行切换。");
      return;
    }
    if (isDraftDirty()) {
      alert("当前有未保存修改，请先保存后再切换。");
      return;
    }
    state.activating = true;
    renderForm();
    try {
      await api(`/api/profiles/${encodeURIComponent(state.selectedProfileId)}/activate`, {
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
    elements.deleteDialogText.textContent = `即将删除方案“${state.selectedProfile.name}”。`;
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
      await api(`/api/profiles/${encodeURIComponent(state.selectedProfileId)}`, {
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
    renderStatus();
    renderList();
    renderForm();
  }

  function renderStatus() {
    if (!state.currentConfig) {
      elements.statusText.textContent = state.listError || "正在读取当前 Codex 配置…";
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

    elements.currentConfig.innerHTML = buildCurrentConfigMetaEntries(state.currentConfig)
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
      elements.profilesListFeedback.textContent = "正在加载方案列表…";
    } else if (!profiles.length) {
      elements.profilesListFeedback.textContent = "还没有已保存方案。";
    } else {
      elements.profilesListFeedback.textContent = "点击左侧方案可查看详情并编辑。";
    }

    elements.profilesList.innerHTML = profiles
      .map((profile) => renderProfileItem(profile))
      .join("");

    document.querySelectorAll("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const profileId = button.getAttribute("data-profile-id");
        await loadProfileDetail(profileId);
      });
    });
  }

  function renderProfileItem(profile) {
    const isSelected = state.selectedProfileId === profile.id;
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
        ${buildProfileMetaEntries(profile)
          .map(([label, value]) => renderProfileMetaLine(label, value))
          .join("")}
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
      : "填写名称、密钥和 Base URL 后保存。";

    elements.nameInput.value = state.draft.name;
    elements.providerInput.value = state.draft.provider;
    elements.apiKeyInput.value = state.draft.apiKey;
    elements.baseUrlInput.value = state.draft.baseUrl;
    elements.modelInput.value = state.draft.model;
    elements.modelReasoningEffortInput.value = state.draft.modelReasoningEffort;

    setFieldError(elements.nameError, state.formErrors.name);
    setFieldError(elements.providerError, state.formErrors.provider);
    setFieldError(elements.apiKeyError, state.formErrors.apiKey);
    setFieldError(elements.baseUrlError, state.formErrors.baseUrl);

    elements.saveButton.textContent = isEditMode ? "保存修改" : "新增方案";
    elements.saveButton.disabled = state.saving || state.activating || state.deleting;
    elements.activateButton.disabled =
      !isEditMode || state.saving || state.activating || state.deleting;
    elements.activateButton.textContent = state.activating ? "切换中…" : "切换为当前方案";
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
    return (
      state.draft.name !== state.selectedProfile.name ||
      state.draft.provider !== (state.selectedProfile.provider || "Custom") ||
      state.draft.apiKey !== state.selectedProfile.apiKey ||
      state.draft.baseUrl !== state.selectedProfile.baseUrl ||
      state.draft.model !== (state.selectedProfile.model || "") ||
      state.draft.modelReasoningEffort !==
        (state.selectedProfile.modelReasoningEffort || "")
    );
  }

  function createEmptyDraft() {
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
