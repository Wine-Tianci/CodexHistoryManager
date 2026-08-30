const path = require("node:path");
const os = require("node:os");
const fsPromises = require("node:fs/promises");
const crypto = require("node:crypto");

const DEFAULT_PROFILE_STORE_FILE_NAME = "ai-agent-deck.profiles.json";
const CLAUDE_BASE_URL_ENV = "ANTHROPIC_BEDROCK_BASE_URL";
const CLAUDE_API_KEY_ENV = "ANTHROPIC_AUTH_TOKEN";
const CLAUDE_MODEL_ENV = "ANTHROPIC_MODEL";

class ClaudeProfileStore {
  constructor({ claudeRoot, profileStoreFileName } = {}) {
    this.claudeRoot = claudeRoot || path.join(os.homedir(), ".claude");
    this.settingsPath = path.join(this.claudeRoot, "settings.json");
    this.profileStorePath = path.join(
      this.claudeRoot,
      profileStoreFileName || DEFAULT_PROFILE_STORE_FILE_NAME,
    );
  }

  async listProfiles() {
    const [data, currentConfig] = await Promise.all([
      this.#readProfileStore(),
      this.readCurrentConfig(),
    ]);
    const activeProfileId = findActiveProfileId(data.profiles, currentConfig);
    return {
      profiles: data.profiles.map((profile) => ({
        ...profile,
        isActive: profile.id === activeProfileId,
      })),
      activeProfileId,
      lastActivatedProfileId: data.lastActivatedProfileId || null,
      currentConfig,
      hasUnmanagedActiveConfig:
        !activeProfileId &&
        Boolean(
          currentConfig.baseUrl ||
            currentConfig.apiKey ||
            currentConfig.defaultModel,
        ),
    };
  }

  async getProfile(profileId) {
    const data = await this.#readProfileStore();
    const profile = data.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error(`profile ${profileId} not found`);
    }
    const activeProfileId = findActiveProfileId(
      data.profiles,
      await this.readCurrentConfig(),
    );
    return {
      ...profile,
      isActive: profile.id === activeProfileId,
    };
  }

  async createProfile(input) {
    const nextProfile = normalizeRequiredStoredProfile({
      id: `profile_${crypto.randomUUID()}`,
      name: input?.name,
      baseUrl: input?.baseUrl,
      apiKey: input?.apiKey,
      defaultModel: input?.defaultModel,
    });
    const data = await this.#readProfileStore();
    data.profiles.push(nextProfile);
    await this.#writeProfileStore(data);
    return nextProfile;
  }

  async copyProfile(profileId) {
    const data = await this.#readProfileStore();
    const sourceProfile = data.profiles.find((profile) => profile.id === profileId);
    if (!sourceProfile) {
      throw new Error(`profile ${profileId} not found`);
    }
    const nextProfile = {
      ...sourceProfile,
      id: `profile_${crypto.randomUUID()}`,
      name: `${sourceProfile.name} copy`,
    };
    data.profiles.push(nextProfile);
    await this.#writeProfileStore(data);
    return nextProfile;
  }

  async updateProfile(profileId, patch) {
    const data = await this.#readProfileStore();
    const activeProfileId = await this.#findActiveProfileId(data.profiles);
    let found = false;
    let updatedProfile = null;
    data.profiles = data.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }
      found = true;
      updatedProfile = normalizeRequiredStoredProfile({
        id: profile.id,
        name: patch?.name ?? profile.name,
        baseUrl: patch?.baseUrl ?? profile.baseUrl,
        apiKey: patch?.apiKey ?? profile.apiKey,
        defaultModel: patch?.defaultModel ?? profile.defaultModel,
      });
      return updatedProfile;
    });
    if (!found) {
      throw new Error(`profile ${profileId} not found`);
    }
    if (activeProfileId === profileId) {
      await this.#writeSettingsProfileSelection(updatedProfile);
      data.lastActivatedProfileId = profileId;
    }
    await this.#writeProfileStore(data);
    return updatedProfile;
  }

  async deleteProfile(profileId) {
    const data = await this.#readProfileStore();
    const nextProfiles = data.profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === data.profiles.length) {
      throw new Error(`profile ${profileId} not found`);
    }
    data.profiles = nextProfiles;
    if (data.lastActivatedProfileId === profileId) {
      data.lastActivatedProfileId = null;
    }
    await this.#writeProfileStore(data);
    return { profileId };
  }

  async activateProfile(profileId) {
    const data = await this.#readProfileStore();
    const profile = data.profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error(`profile ${profileId} not found`);
    }

    await this.#writeSettingsProfileSelection(profile);

    data.lastActivatedProfileId = profileId;
    await this.#writeProfileStore(data);
    return this.listProfiles();
  }

  async readCurrentConfig() {
    try {
      const settings = await readSettingsFile(this.settingsPath, { allowMissing: true });
      const env = normalizeEnvMap(settings.env);
      return {
        baseUrl: env[CLAUDE_BASE_URL_ENV] || "",
        apiKey: env[CLAUDE_API_KEY_ENV] || "",
        defaultModel: env[CLAUDE_MODEL_ENV] || "",
      };
    } catch (error) {
      if (error && error.message && error.message.includes("settings.json")) {
        throw error;
      }
      throw new Error(`settings.json could not be read: ${error.message}`);
    }
  }

  async #readProfileStore() {
    try {
      const content = await fsPromises.readFile(this.profileStorePath, "utf8");
      return normalizeProfileStore(JSON.parse(stripByteOrderMark(content)));
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          version: 1,
          lastActivatedProfileId: null,
          profiles: [],
        };
      }
      throw error;
    }
  }

  async #writeProfileStore(data) {
    const normalized = normalizeProfileStore(data);
    await writeTextAtomic(
      this.profileStorePath,
      `${JSON.stringify(normalized, null, 2)}\n`,
    );
  }

  async #findActiveProfileId(profiles) {
    try {
      return findActiveProfileId(profiles, await this.readCurrentConfig());
    } catch {
      return null;
    }
  }

  async #writeSettingsProfileSelection(profile) {
    const settings = await readSettingsFile(this.settingsPath);
    settings.model = extractModelAlias(profile.defaultModel, settings.model);
    settings.env = {
      ...normalizeEnvMap(settings.env),
      [CLAUDE_BASE_URL_ENV]: profile.baseUrl,
      [CLAUDE_API_KEY_ENV]: profile.apiKey,
      [CLAUDE_MODEL_ENV]: profile.defaultModel,
    };
    await writeTextAtomic(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
}

async function readSettingsFile(settingsPath, { allowMissing = false } = {}) {
  try {
    const raw = await fsPromises.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(stripByteOrderMark(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("settings.json must contain an object");
    }
    return parsed;
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") {
      return {};
    }
    if (error.code === "ENOENT") {
      return {};
    }
    if (error instanceof SyntaxError) {
      throw new Error(`settings.json is not valid JSON: ${error.message}`);
    }
    if (error.message && error.message.includes("settings.json")) {
      throw error;
    }
    throw new Error(`settings.json could not be read: ${error.message}`);
  }
}

function stripByteOrderMark(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function normalizeProfileStore(data) {
  const parsed = data && typeof data === "object" ? data : {};
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
  return {
    version: 1,
    lastActivatedProfileId:
      typeof parsed.lastActivatedProfileId === "string"
        ? parsed.lastActivatedProfileId
        : null,
    profiles: profiles.map(normalizeStoredProfile),
  };
}

function normalizeStoredProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("invalid profile record");
  }
  const env = normalizeEnvMap(profile.env);
  return {
    id: normalizeRequiredString(profile.id, "id"),
    name: normalizeRequiredString(profile.name, "name"),
    baseUrl: normalizeOptionalString(profile.baseUrl ?? env[CLAUDE_BASE_URL_ENV]),
    apiKey: normalizeOptionalString(profile.apiKey ?? env[CLAUDE_API_KEY_ENV]),
    defaultModel: normalizeOptionalString(
      profile.defaultModel ?? env[CLAUDE_MODEL_ENV] ?? profile.model,
    ),
  };
}

function normalizeRequiredStoredProfile(profile) {
  const normalized = normalizeStoredProfile(profile);
  return {
    ...normalized,
    baseUrl: normalizeRequiredString(normalized.baseUrl, "baseUrl"),
    apiKey: normalizeRequiredString(normalized.apiKey, "apiKey"),
    defaultModel: normalizeRequiredString(normalized.defaultModel, "defaultModel"),
  };
}

function normalizeEnvMap(env) {
  const source = env && typeof env === "object" && !Array.isArray(env) ? env : {};
  const entries = Object.entries(source)
    .map(([key, value]) => [normalizeOptionalString(key), normalizeOptionalString(value)])
    .filter(([key, value]) => key && value);
  return Object.fromEntries(entries);
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function findActiveProfileId(profiles, currentConfig) {
  const matched = profiles.find((profile) => {
    return (
      profile.baseUrl === normalizeOptionalString(currentConfig.baseUrl) &&
      profile.apiKey === normalizeOptionalString(currentConfig.apiKey) &&
      profile.defaultModel === normalizeOptionalString(currentConfig.defaultModel)
    );
  });
  return matched ? matched.id : null;
}

function extractModelAlias(defaultModel, existingModel) {
  const value = normalizeOptionalString(defaultModel);
  const lowerValue = value.toLowerCase();
  if (lowerValue.includes("haiku")) {
    return "haiku";
  }
  if (lowerValue.includes("sonnet")) {
    return "sonnet";
  }
  if (lowerValue.includes("opus")) {
    return "opus";
  }
  return normalizeOptionalString(existingModel) || value;
}

async function writeTextAtomic(targetPath, content) {
  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.tmp-${path.basename(targetPath)}-${process.pid}-${Date.now()}`,
  );
  await fsPromises.writeFile(tempPath, content, "utf8");
  await fsPromises.rename(tempPath, targetPath);
}

module.exports = {
  ClaudeProfileStore,
};
