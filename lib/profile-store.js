const path = require("node:path");
const os = require("node:os");
const fsPromises = require("node:fs/promises");
const crypto = require("node:crypto");

class ProfileStore {
  constructor({ codexRoot, profileStoreFileName } = {}) {
    this.codexRoot = codexRoot || path.join(os.homedir(), ".codex");
    this.configPath = path.join(this.codexRoot, "config.toml");
    this.authPath = path.join(this.codexRoot, "auth.json");
    this.profileStorePath = path.join(
      this.codexRoot,
      profileStoreFileName || "codex-history-manager.profiles.json",
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
      hasUnmanagedActiveConfig: Boolean(
        currentConfig.baseUrl &&
          currentConfig.apiKey &&
          !activeProfileId,
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
    const nextProfile = {
      id: `profile_${crypto.randomUUID()}`,
      name: normalizeRequiredString(input?.name, "name"),
      provider: normalizeProfileProvider(input?.provider),
      apiKey: normalizeRequiredString(input?.apiKey, "apiKey"),
      baseUrl: normalizeRequiredString(input?.baseUrl, "baseUrl"),
    };
    const data = await this.#readProfileStore();
    data.profiles.push(nextProfile);
    await this.#writeProfileStore(data);
    return nextProfile;
  }

  async updateProfile(profileId, patch) {
    const data = await this.#readProfileStore();
    let found = false;
    data.profiles = data.profiles.map((profile) => {
      if (profile.id !== profileId) {
        return profile;
      }
      found = true;
      return {
        id: profile.id,
        name: normalizeRequiredString(patch?.name ?? profile.name, "name"),
        provider: normalizeProfileProvider(patch?.provider ?? profile.provider),
        apiKey: normalizeRequiredString(patch?.apiKey ?? profile.apiKey, "apiKey"),
        baseUrl: normalizeRequiredString(patch?.baseUrl ?? profile.baseUrl, "baseUrl"),
      };
    });
    if (!found) {
      throw new Error(`profile ${profileId} not found`);
    }
    await this.#writeProfileStore(data);
    return data.profiles.find((profile) => profile.id === profileId);
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

    await this.#writeConfigProviderSelection(profile.provider, profile.baseUrl);
    await this.#writeAuthApiKey(profile.apiKey);

    data.lastActivatedProfileId = profileId;
    await this.#writeProfileStore(data);
    return this.listProfiles();
  }

  async readCurrentConfig() {
    const [configToml, authRaw] = await Promise.all([
      fsPromises.readFile(this.configPath, "utf8"),
      fsPromises.readFile(this.authPath, "utf8"),
    ]);
    const provider = parseModelProvider(configToml);
    const baseUrl = readProviderBaseUrl(configToml, provider);
    const auth = JSON.parse(authRaw);
    if (!auth || typeof auth !== "object") {
      throw new Error("auth.json must contain an object");
    }
    return {
      provider,
      baseUrl,
      apiKey: normalizeRequiredString(auth.OPENAI_API_KEY, "OPENAI_API_KEY"),
    };
  }

  async #readProfileStore() {
    try {
      const content = await fsPromises.readFile(this.profileStorePath, "utf8");
      const parsed = JSON.parse(content);
      return normalizeProfileStore(parsed);
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

  async #writeConfigProviderSelection(provider, baseUrl) {
    const content = await fsPromises.readFile(this.configPath, "utf8");
    const updated = rewriteProviderBaseUrl(rewriteModelProvider(content, provider), provider, baseUrl);
    await writeTextAtomic(this.configPath, updated);
  }

  async #writeAuthApiKey(apiKey) {
    const raw = await fsPromises.readFile(this.authPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("auth.json must contain an object");
    }
    parsed.OPENAI_API_KEY = normalizeRequiredString(apiKey, "OPENAI_API_KEY");
    await writeTextAtomic(this.authPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }
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
  return {
    id: normalizeRequiredString(profile.id, "id"),
    name: normalizeRequiredString(profile.name, "name"),
    provider: normalizeProfileProvider(profile.provider),
    apiKey: normalizeRequiredString(profile.apiKey, "apiKey"),
    baseUrl: normalizeRequiredString(profile.baseUrl, "baseUrl"),
  };
}

function normalizeProfileProvider(value) {
  const provider = typeof value === "undefined" ? "Custom" : value;
  return normalizeRequiredString(provider, "provider");
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function findActiveProfileId(profiles, currentConfig) {
  const matched = profiles.find(
    (profile) =>
      profile.provider === currentConfig.provider &&
      profile.baseUrl === currentConfig.baseUrl &&
      profile.apiKey === currentConfig.apiKey,
  );
  return matched ? matched.id : null;
}

function parseModelProvider(content) {
  const match = String(content || "").match(/^\s*model_provider\s*=\s*"([^"]+)"\s*$/m);
  if (!match) {
    throw new Error("config.toml is missing model_provider");
  }
  return match[1];
}

function readProviderBaseUrl(content, provider) {
  const section = getProviderSection(String(content || ""), provider);
  const baseUrlMatch = section.match(/^\s*base_url\s*=\s*"([^"]+)"\s*$/m);
  if (!baseUrlMatch) {
    throw new Error(`config.toml provider ${provider} is missing base_url`);
  }
  return baseUrlMatch[1];
}

function rewriteModelProvider(content, provider) {
  const source = String(content || "");
  if (!source.match(/^\s*model_provider\s*=\s*"([^"]+)"\s*$/m)) {
    throw new Error("config.toml is missing model_provider");
  }
  return `${source
    .replace(
      /^\s*model_provider\s*=\s*"([^"]+)"\s*$/m,
      `model_provider = "${escapeTomlString(provider)}"`,
    )
    .replace(/\n*$/, "\n")}`;
}

function rewriteProviderBaseUrl(content, provider, baseUrl) {
  const lines = String(content || "").split(/\r?\n/);
  let currentProvider = null;
  let foundBaseUrl = false;

  const nextLines = lines.map((line) => {
    const sectionMatch = line.match(/^\s*\[model_providers\.(?:"([^"]+)"|([^\]]+))\]\s*$/);
    if (sectionMatch) {
      currentProvider = sectionMatch[1] || sectionMatch[2];
      return line;
    }
    if (/^\s*\[/.test(line)) {
      currentProvider = null;
      return line;
    }
    if (currentProvider === provider) {
      const baseUrlMatch = line.match(/^(\s*)base_url\s*=\s*"[^"]*"\s*$/);
      if (baseUrlMatch) {
        foundBaseUrl = true;
        return `${baseUrlMatch[1]}base_url = "${escapeTomlString(baseUrl)}"`;
      }
    }
    return line;
  });

  if (!foundBaseUrl) {
    throw new Error(`config.toml provider ${provider} is missing base_url`);
  }

  return `${nextLines.join("\n").replace(/\n*$/, "\n")}`;
}

function getProviderSection(content, provider) {
  const lines = content.split(/\r?\n/);
  const sectionLines = [];
  let inTargetSection = false;

  for (const line of lines) {
    const sectionMatch = line.match(/^\s*\[model_providers\.(?:"([^"]+)"|([^\]]+))\]\s*$/);
    if (sectionMatch) {
      const currentProvider = sectionMatch[1] || sectionMatch[2];
      if (inTargetSection) {
        break;
      }
      inTargetSection = currentProvider === provider;
      continue;
    }
    if (inTargetSection && /^\s*\[/.test(line)) {
      break;
    }
    if (inTargetSection) {
      sectionLines.push(line);
    }
  }

  if (!sectionLines.length) {
    throw new Error(`config.toml provider ${provider} not found`);
  }

  return sectionLines.join("\n");
}

function escapeTomlString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
  ProfileStore,
};
