// AI and voice settings, as in CrisisMaker: the author brings their own keys.
// Keys live in sessionStorage (this browser tab only) and are never part of a
// project file; the other choices (provider, model, address) persist in localStorage.

export const AI_PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', model: 'claude-opus-5-5', needsKey: true, vision: true },
  openai: { label: 'OpenAI', model: '', needsKey: true, vision: true },
  openrouter: { label: 'OpenRouter', model: 'anthropic/claude-sonnet-5.5', needsKey: true, vision: true },
  local: { label: 'Local server (OpenAI-compatible)', model: '', needsKey: false, vision: false },
};

export const VOICE_PROVIDERS = {
  none: { label: 'No voice (music and captions only)' },
  azure: { label: 'Azure Speech' },
  openai: { label: 'OpenAI voice' },
};

export const DEFAULT_LOCAL_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_AZURE_REGION = 'westeurope';

const PLAIN_KEY = 'videomaker.settings';
const SECRET_KEY = 'videomaker.keys';

export const DEFAULTS = {
  provider: 'anthropic', model: '', baseUrl: DEFAULT_LOCAL_URL,
  voiceProvider: 'none', azureRegion: DEFAULT_AZURE_REGION,
  apiKey: '', voiceKey: '',
};

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch { /* private mode: the settings last for this page only */ }
}

const memory = { ...DEFAULTS };

function stores() {
  return {
    plain: typeof localStorage !== 'undefined' ? localStorage : null,
    secret: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  };
}

/** The current settings (keys included). */
export function loadSettings(storage = stores()) {
  const plain = storage.plain ? read(storage.plain, PLAIN_KEY) : {};
  const secret = storage.secret ? read(storage.secret, SECRET_KEY) : {};
  const settings = { ...DEFAULTS, ...pick(plain, ['provider', 'model', 'baseUrl', 'voiceProvider', 'azureRegion']), ...pick(secret, ['apiKey', 'voiceKey']) };
  if (!AI_PROVIDERS[settings.provider]) settings.provider = DEFAULTS.provider;
  if (!VOICE_PROVIDERS[settings.voiceProvider]) settings.voiceProvider = DEFAULTS.voiceProvider;
  Object.assign(memory, settings);
  return settings;
}

export function saveSettings(settings, storage = stores()) {
  const clean = { ...DEFAULTS, ...settings };
  if (storage.plain) {
    write(storage.plain, PLAIN_KEY, pick(clean, ['provider', 'model', 'baseUrl', 'voiceProvider', 'azureRegion']));
  }
  if (storage.secret) write(storage.secret, SECRET_KEY, pick(clean, ['apiKey', 'voiceKey']));
  Object.assign(memory, clean);
  return clean;
}

/** Settings of this page, also when the browser refuses to store them. */
export function currentSettings() {
  return stores().plain || stores().secret ? loadSettings() : { ...memory };
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (typeof source[key] === 'string') out[key] = source[key];
  return out;
}

/** What the page needs to know without ever exposing a key. */
export function describe(settings) {
  const provider = AI_PROVIDERS[settings.provider] || AI_PROVIDERS.anthropic;
  const model = settings.model.trim() || provider.model;
  const ready = settings.provider === 'local'
    ? !!(settings.baseUrl.trim() && model)
    : !!(settings.apiKey.trim() && model);
  return { provider: settings.provider, label: provider.label, model, ready };
}

export function voiceReady(settings) {
  if (settings.voiceProvider === 'none') return false;
  return !!settings.voiceKey.trim() && (settings.voiceProvider !== 'azure' || !!settings.azureRegion.trim());
}
