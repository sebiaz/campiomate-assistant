/**
 * Configuration loader for CampioMate Assistant
 * Loads config from config.json (gitignored) with fallback to config.example.json
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const EXAMPLE_CONFIG_PATH = path.join(__dirname, '..', 'config.example.json');

function loadConfig() {
  let config = {};

  // Load example config as defaults
  if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse config.example.json:', e.message);
    }
  }

  // Override with user config if exists
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      config = deepMerge(config, userConfig);
    } catch (e) {
      console.warn('Failed to parse config.json:', e.message);
    }
  }

  // Environment variable overrides
  if (process.env.CAMPIO_BASE_URL) config.baseUrl = process.env.CAMPIO_BASE_URL;
  if (process.env.CAMPIO_HEADLESS !== undefined) config.browser.headless = process.env.CAMPIO_HEADLESS === 'true';
  if (process.env.CAMPIO_AUTO_SUBMIT !== undefined) config.autoSubmit = process.env.CAMPIO_AUTO_SUBMIT === 'true';
  if (process.env.CAMPIO_DRY_RUN !== undefined) config.dryRun = process.env.CAMPIO_DRY_RUN === 'true';
  if (process.env.OPENAI_API_KEY) {
    config.ai.apiKeyEnv = 'OPENAI_API_KEY';
    config.ai.enabled = true;
  }

  return config;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { loadConfig };