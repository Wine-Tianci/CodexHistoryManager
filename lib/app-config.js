"use strict";

const fs = require("node:fs/promises");

async function readAppConfig(options = {}) {
  const configPath = options.configPath;
  if (!configPath) {
    throw new Error("configPath is required");
  }

  try {
    return await readConfigFile(configPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (options.legacyConfigPath) {
        try {
          return await readConfigFile(options.legacyConfigPath);
        } catch (legacyError) {
          if (legacyError.code !== "ENOENT") {
            throw legacyError;
          }
        }
      }
      return createDefaultConfig();
    }
    throw error;
  }
}

async function readConfigFile(configPath) {
  const content = await fs.readFile(configPath, "utf8");
  return normalizeAppConfig(parseConfig(content));
}

function parseConfig(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid tool config JSON: ${error.message}`);
  }
}

function normalizeAppConfig(rawConfig) {
  const terminalPath =
    typeof rawConfig?.terminalPath === "string" ? rawConfig.terminalPath.trim() : "";

  return {
    terminalPath: terminalPath || null,
  };
}

function createDefaultConfig() {
  return {
    terminalPath: null,
  };
}

module.exports = {
  readAppConfig,
};
