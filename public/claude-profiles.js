"use strict";

(function bootstrapClaudeProfiles() {
  const {
    buildClaudeCurrentConfigMetaEntries,
    buildClaudeProfileMetaEntries,
    escapeHtml,
    sortProfilesForDisplay,
    validateClaudeProfileDraft,
  } = window.AIAgentDeckModel;

  const state = {
    profiles: [],
    activeProfileId: null,
    currentConfig: null,
    selectedProfileId: null,
    selectedProfile: null,
    draft: createEmptyDraft(),
    formErrors: {},
    listError: "",
  };

  const elements = collectElements();
  bindEvents();
  loadProfiles();

  function collectElements() {
    return {
      refreshButton: document.getElementById("claude-profiles-refresh-button"),
      newProfileButton: document.getElementById("claude-new-profile-button"),
      profilesCount: document.getElementById("claude-profiles-count"),
      profilesList: document.getElementById("claude-profiles-list"),
      profilesListFeedback: document.getElementById("claude-profiles-list-feedback"),
      statusText: document.getElementById("claude-profiles-status-text"),
      currentConfig: document.getElementById("claude-profiles-current-config"),
      formTitle: document.getElementById("claude-profile-form-title"),
      formSubtitle: document.getElementById("claude-profile-form-subtitle"),
      form: document.getElementById("claude-profile-form"),
      nameInput: document.getElementById("claude-profile-name-input"),
      modelInput: document.getElementById("claude-profile-model-input"),
      envList: document.getElementById("claude-env-list"),
      nameError: document.getElementById("claude-profile-name-error"),
      addEnvButton: document.getElementById("claude-add-env-button"),
      saveButton: document.getElementById("claude-save-profile-button"),
      activateButton: document.getElementById("claude-activate-profile-button"),
      deleteButton: document.getElementById("claude-delete-profile-button"),
    };
  }

  function bindEvents() {
    elements.refreshButton.addEventListener("click", () => loadProfiles(state.selectedProfileId));
    elements.newProfileButton.addEventListener("click", startCreatingProfile);
    elements.addEnvButton.addEventListener("click", addEnvRow);
    elements.form.addEventListener("submit", saveProfile);
    elements.activateButton.addEventListener("click", activateProfile);
    elements.deleteButton.addEventListener("click", deleteProfile);
    elements.nameInput.addEventListener("input", handleDraftChange);
    elements.modelInput.addEventListener("input", handleDraftChange);
    elements.envList.addEventListener("input", handleEnvInput);
    elements.envList.addEventListener("click", handleEnvActions);
  }

  async function loadProfiles(nextSelectedId) {
    try {
      const payload = await api("/api/claude/profiles");
      state.profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
      state.activeProfileId = payload.activeProfileId || null;
      state.currentConfig = payload.currentConfig || null;
      state.listError = "";
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
      state.listError = error.message;
    }
    render();
  }

  async function loadProfileDetail(profileId) {
    try {
      const detail = await api(`/api/claude/profiles/${encodeURIComponent(profileId)}`);
      state.selectedProfileId = profileId;
      state.selectedProfile = detail;
      state.draft = {
        name: detail.name || "",
        model: detail.model || "",
        envRows: envObjectToRows(detail.env || {}),
      };
      state.formErrors = {};
    } catch (error) {
      window.alert(`Profile load failed: ${error.message}`);
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
      ...state.draft,
      name: elements.nameInput.value,
      model: elements.modelInput.value,
    };
    state.formErrors = {};
    renderForm();
  }

  function handleEnvInput() {
    state.draft = {
      ...state.draft,
      envRows: readEnvRowsFromDom(),
    };
    renderForm();
  }

  function handleEnvActions(event) {
    const removeButton = event.target.closest("[data-remove-env-index]");
    if (!removeButton) {
      return;
    }
    const index = Number(removeButton.getAttribute("data-remove-env-index"));
    state.draft.envRows = state.draft.envRows.filter((_, rowIndex) => rowIndex !== index);
    renderForm();
  }

  function addEnvRow() {
    state.draft.envRows.push({ key: "", value: "" });
    renderForm();
  }

  async function saveProfile(event) {
    event.preventDefault();
    const payload = {
      name: elements.nameInput.value,
      model: elements.modelInput.value,
      env: rowsToEnvObject(readEnvRowsFromDom()),
    };
    const errors = validateClaudeProfileDraft(payload);
    state.formErrors = errors;
    renderForm();
    if (Object.keys(errors).length) {
      return;
    }
    try {
      const responsePayload = state.selectedProfileId
        ? await api(`/api/claude/profiles/${encodeURIComponent(state.selectedProfileId)}`, {
            method: "PATCH",
            body: payload,
          })
        : await api("/api/claude/profiles", {
            method: "POST",
            body: payload,
          });
      await loadProfiles(responsePayload.id);
    } catch (error) {
      window.alert(`Save failed: ${error.message}`);
    }
  }

  async function activateProfile() {
    if (!state.selectedProfileId) {
      return;
    }
    if (isDraftDirty()) {
      window.alert("Save the current profile before activating it.");
      return;
    }
    try {
      await api(`/api/claude/profiles/${encodeURIComponent(state.selectedProfileId)}/activate`, {
        method: "POST",
      });
      await loadProfiles(state.selectedProfileId);
    } catch (error) {
      window.alert(`Activation failed: ${error.message}`);
    }
  }

  async function deleteProfile() {
    if (!state.selectedProfileId || !state.selectedProfile) {
      return;
    }
    if (!window.confirm(`Delete profile "${state.selectedProfile.name}"?`)) {
      return;
    }
    try {
      await api(`/api/claude/profiles/${encodeURIComponent(state.selectedProfileId)}`, {
        method: "DELETE",
      });
      startCreatingProfile(false);
      await loadProfiles();
    } catch (error) {
      window.alert(`Delete failed: ${error.message}`);
    }
  }

  function render() {
    renderStatus();
    renderList();
    renderForm();
  }

  function renderStatus() {
    elements.statusText.textContent = state.activeProfileId
      ? "A saved Claude profile is currently active."
      : state.currentConfig
        ? "Current Claude settings are not mapped to a saved profile."
        : state.listError || "Loading Claude settings...";
    elements.currentConfig.innerHTML = buildClaudeCurrentConfigMetaEntries(state.currentConfig || {})
      .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(String(value || "-"))}</dd>`)
      .join("");
  }

  function renderList() {
    const profiles = sortProfilesForDisplay(state.profiles);
    elements.profilesCount.textContent = `${profiles.length} items`;
    elements.profilesListFeedback.textContent = state.listError
      ? state.listError
      : profiles.length
        ? "Select a Claude profile to edit it."
        : "No saved Claude profiles yet.";
    elements.profilesList.innerHTML = profiles
      .map((profile) => {
        const isSelected = state.selectedProfileId === profile.id;
        return `
          <button
            class="profile-item${isSelected ? " selected" : ""}"
            type="button"
            data-profile-id="${escapeHtml(profile.id)}"
          >
            <div class="profile-item-heading">
              <strong>${escapeHtml(profile.name)}</strong>
              ${profile.isActive ? '<span class="status-badge">Active</span>' : ""}
            </div>
            ${buildClaudeProfileMetaEntries(profile)
              .map(
                ([label, value]) =>
                  `<div class="profile-item-meta">${escapeHtml(label)}: ${escapeHtml(String(value || "-"))}</div>`,
              )
              .join("")}
          </button>
        `;
      })
      .join("");
    document.querySelectorAll("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await loadProfileDetail(button.getAttribute("data-profile-id"));
        render();
      });
    });
  }

  function renderForm() {
    const isEditMode = Boolean(state.selectedProfileId);
    elements.formTitle.textContent = isEditMode
      ? state.selectedProfile?.name || "Claude Profile Detail"
      : "New Claude Profile";
    elements.formSubtitle.textContent = isEditMode
      ? "Update model defaults and provider environment variables."
      : "Create a named Claude configuration.";
    elements.nameInput.value = state.draft.name;
    elements.modelInput.value = state.draft.model;
    elements.envList.innerHTML = state.draft.envRows
      .map(
        (row, index) => `
          <div class="env-row">
            <input
              class="env-key-input"
              type="text"
              placeholder="ENV_KEY"
              value="${escapeHtml(row.key)}"
              data-env-key-index="${index}"
            />
            <input
              class="env-value-input"
              type="text"
              placeholder="value"
              value="${escapeHtml(row.value)}"
              data-env-value-index="${index}"
            />
            <button
              class="ghost-button env-remove-button"
              type="button"
              data-remove-env-index="${index}"
            >
              Remove
            </button>
          </div>
        `,
      )
      .join("");
    elements.nameError.textContent = state.formErrors.name || "";
    elements.nameError.classList.toggle("hidden", !state.formErrors.name);
    elements.activateButton.disabled = !isEditMode;
    elements.deleteButton.disabled = !isEditMode;
  }

  function createEmptyDraft() {
    return {
      name: "",
      model: "",
      envRows: [{ key: "", value: "" }],
    };
  }

  function envObjectToRows(env) {
    const rows = Object.entries(env || {}).map(([key, value]) => ({
      key,
      value: String(value || ""),
    }));
    return rows.length ? rows : [{ key: "", value: "" }];
  }

  function rowsToEnvObject(rows) {
    return Object.fromEntries(
      rows
        .map((row) => [String(row.key || "").trim(), String(row.value || "").trim()])
        .filter(([key, value]) => key && value),
    );
  }

  function readEnvRowsFromDom() {
    const rows = [];
    const keyInputs = elements.envList.querySelectorAll("[data-env-key-index]");
    keyInputs.forEach((keyInput) => {
      const index = keyInput.getAttribute("data-env-key-index");
      const valueInput = elements.envList.querySelector(`[data-env-value-index="${index}"]`);
      rows.push({
        key: keyInput.value,
        value: valueInput ? valueInput.value : "",
      });
    });
    return rows.length ? rows : [{ key: "", value: "" }];
  }

  function isDraftDirty() {
    if (!state.selectedProfile) {
      return false;
    }
    const nextEnv = rowsToEnvObject(readEnvRowsFromDom());
    const currentEnv = state.selectedProfile.env || {};
    return (
      elements.nameInput.value !== state.selectedProfile.name ||
      elements.modelInput.value !== (state.selectedProfile.model || "") ||
      JSON.stringify(nextEnv) !== JSON.stringify(currentEnv)
    );
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
