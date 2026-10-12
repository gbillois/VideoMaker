// The AI settings dialog: provider, key and model for the script writer, and a
// voice provider and key for the narration. Opened from the AI status button.
import {
  AI_PROVIDERS, VOICE_PROVIDERS, DEFAULT_LOCAL_URL, loadSettings, saveSettings,
} from './lib/settings.js';
import { listModels } from './lib/ai.js';

const $ = id => document.getElementById(id);

const KEY_HINT = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  openrouter: 'sk-or-…',
  local: 'optional',
};

function fill(select, entries, value) {
  select.replaceChildren(...entries.map(([id, label]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    return option;
  }));
  select.value = value;
}

function readForm() {
  return {
    provider: $('set-provider').value,
    apiKey: $('set-key').value.trim(),
    model: $('set-model').value.trim(),
    baseUrl: $('set-base').value.trim() || DEFAULT_LOCAL_URL,
    voiceProvider: $('set-voice-provider').value,
    voiceKey: $('set-voice-key').value.trim(),
    azureRegion: $('set-region').value.trim() || 'westeurope',
  };
}

function status(message, kind) {
  const node = $('set-status');
  node.textContent = message || '';
  node.className = `vm-status${kind ? ` is-${kind}` : ''}`;
}

/** Shows only the fields the chosen providers need. */
function sync() {
  const form = readForm();
  const provider = AI_PROVIDERS[form.provider];
  $('set-base-field').hidden = form.provider !== 'local';
  $('set-key').placeholder = KEY_HINT[form.provider] || '';
  $('set-model').placeholder = provider.model || 'model name';
  const voice = form.voiceProvider;
  $('set-voice-key-field').hidden = voice === 'none';
  $('set-region-field').hidden = voice !== 'azure';
  $('set-voice-hint').textContent = voice === 'azure'
    ? 'Azure Speech: the key and region of your Speech resource. The same Microsoft neural voices.'
    : voice === 'openai'
      ? "OpenAI's voices speak every language. Use an OpenAI API key."
      : 'Without a voice key the film plays with music and captions.';
}

function load() {
  const settings = loadSettings();
  fill($('set-provider'), Object.entries(AI_PROVIDERS).map(([id, item]) => [id, item.label]), settings.provider);
  fill($('set-voice-provider'), Object.entries(VOICE_PROVIDERS).map(([id, item]) => [id, item.label]), settings.voiceProvider);
  $('set-key').value = settings.apiKey;
  $('set-model').value = settings.model;
  $('set-base').value = settings.baseUrl;
  $('set-voice-key').value = settings.voiceKey;
  $('set-region').value = settings.azureRegion;
  $('set-models').replaceChildren();
  status('');
  sync();
}

function open() {
  load();
  $('vm-settings').hidden = false;
  document.body.style.overflow = 'hidden';
  $('set-key').focus();
}

function close() {
  $('vm-settings').hidden = true;
  document.body.style.overflow = '';
}

async function refresh() {
  const form = readForm();
  const needsKey = AI_PROVIDERS[form.provider].needsKey;
  if (needsKey && !form.apiKey) return status('Enter the API key first.', 'error');
  $('set-refresh').disabled = true;
  status('Asking the provider for its models…');
  try {
    const models = await listModels({ ...loadSettings(), ...form });
    $('set-models').replaceChildren(...models.map(id => {
      const option = document.createElement('option');
      option.value = id;
      return option;
    }));
    status(models.length ? `${models.length} models available: pick one in the Model field. The key works.` : 'The key works, but the provider listed no model.', 'ok');
  } catch (error) {
    status(error.message, 'error');
  } finally {
    $('set-refresh').disabled = false;
  }
}

function toggle(inputId, buttonId) {
  const input = $(inputId);
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  $(buttonId).textContent = hidden ? 'Hide' : 'Show';
}

function save() {
  const form = readForm();
  if (form.provider === 'local' && !/^https?:\/\//i.test(form.baseUrl)) return status('Enter the server address (http://…).', 'error');
  saveSettings(form);
  close();
  document.dispatchEvent(new CustomEvent('vm-settings-saved'));
}

function bind() {
  $('set-provider').addEventListener('change', () => { $('set-model').value = ''; $('set-models').replaceChildren(); sync(); });
  $('set-voice-provider').addEventListener('change', sync);
  $('set-key-toggle').addEventListener('click', () => toggle('set-key', 'set-key-toggle'));
  $('set-voice-key-toggle').addEventListener('click', () => toggle('set-voice-key', 'set-voice-key-toggle'));
  $('set-refresh').addEventListener('click', refresh);
  $('set-save').addEventListener('click', save);
  $('set-cancel').addEventListener('click', close);
  $('set-close').addEventListener('click', close);
  $('vm-settings').addEventListener('click', event => { if (event.target === event.currentTarget) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('vm-settings').hidden) close(); });
  window.VM = window.VM || {};
  window.VM.openSettings = open;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
