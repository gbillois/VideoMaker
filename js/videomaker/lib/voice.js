// Narration with the author's own key, called straight from the browser:
// Azure Speech (the same Microsoft neural voices) or OpenAI's voices.
// Neither returns word timings, so cues and captions use the take's length.
import { voiceReady } from './settings.js';

export const AZURE_VOICES = {
  'en-US': ['en-US-AndrewNeural', 'en-US-AvaNeural', 'en-US-BrianNeural', 'en-US-EmmaNeural',
    'en-US-AndrewMultilingualNeural', 'en-US-AvaMultilingualNeural'],
  // The first voice of each language is the default (Rémy Multilingual for French).
  'fr-FR': ['fr-FR-RemyMultilingualNeural', 'fr-FR-HenriNeural', 'fr-FR-DeniseNeural',
    'fr-FR-VivienneMultilingualNeural', 'fr-FR-EloiseNeural'],
  'de-DE': ['de-DE-ConradNeural', 'de-DE-KatjaNeural', 'de-DE-FlorianMultilingualNeural',
    'de-DE-SeraphinaMultilingualNeural', 'de-DE-KillianNeural'],
};

// OpenAI's voices speak every language: the same list is offered for each.
export const OPENAI_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
export const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';

const LANGUAGES = Object.keys(AZURE_VOICES);

export class VoiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'VoiceError';
    this.status = status;
  }
}

/** The voices to offer per language for a voice provider ({} when there is no voice). */
export function voicesFor(settings) {
  if (settings.voiceProvider === 'azure') return AZURE_VOICES;
  if (settings.voiceProvider === 'openai') return Object.fromEntries(LANGUAGES.map(language => [language, OPENAI_VOICES]));
  return {};
}

export function isKnownVoice(voice, settings) {
  return Object.values(voicesFor(settings)).some(voices => voices.includes(voice));
}

export function escapeXml(text) {
  // Control characters are exactly what this pattern must strip from SSML.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** "+5%" and friends, bounded to what the voices handle. */
export function normalizeRate(rate) {
  const value = Math.round(Number(String(rate ?? '').replace(/[^\-\d.]/g, '')) || 0);
  const clamped = Math.max(-30, Math.min(40, value));
  return `${clamped >= 0 ? '+' : ''}${clamped}%`;
}

export function buildSsml(text, voice, rate) {
  const language = voice.slice(0, 5);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${language}'>`
    + `<voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
}

function toBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function failure(response, label) {
  let detail = '';
  try { detail = (await response.text()).slice(0, 200); } catch { /* no body */ }
  if (response.status === 401 || response.status === 403) {
    return new VoiceError(`${label} refused the voice key${detail ? ` (${detail})` : ''}.`, 401);
  }
  if (response.status === 429) return new VoiceError(`${label} rate limit reached: try again in a moment.`, 429);
  return new VoiceError(`${label} answered ${response.status}${detail ? `: ${detail}` : ''}.`, 502);
}

async function azureSpeech(text, voice, rate, settings) {
  const region = settings.azureRegion.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(region)) throw new VoiceError('Enter the Azure Speech region (for example westeurope).', 400);
  let response;
  try {
    response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': settings.voiceKey.trim(),
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: buildSsml(text, voice, rate),
    });
  } catch {
    throw new VoiceError(`Could not reach Azure Speech (region ${region}). Check the region and your network.`, 502);
  }
  if (!response.ok) throw await failure(response, 'Azure Speech');
  return new Uint8Array(await response.arrayBuffer());
}

async function openAiSpeech(text, voice, rate, settings) {
  const speed = Math.max(0.25, Math.min(4, 1 + (Number(rate.replace('%', '')) || 0) / 100));
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.voiceKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice, input: text, response_format: 'mp3', speed }),
    });
  } catch {
    throw new VoiceError('Could not reach OpenAI. Check your network.', 502);
  }
  if (!response.ok) throw await failure(response, 'OpenAI');
  return new Uint8Array(await response.arrayBuffer());
}

/** One narration take: { provider, mimeType, audio (base64), words: [] }. */
export async function synthesize(settings, { text, voice, rate }) {
  if (!voiceReady(settings)) throw new VoiceError('Add a voice key in the AI settings (top right), or choose "No voice".', 400);
  const clean = String(text || '').trim().slice(0, 1_500);
  if (!clean) throw new VoiceError('Empty voice-over text.', 400);
  if (!isKnownVoice(voice, settings)) throw new VoiceError('This voice is not available with the chosen voice provider.', 400);
  const bounded = normalizeRate(rate);
  const audio = settings.voiceProvider === 'azure'
    ? await azureSpeech(clean, voice, bounded, settings)
    : await openAiSpeech(clean, voice, bounded, settings);
  if (audio.length < 200) throw new VoiceError('The voice service returned no audio. Check the key and the region.', 502);
  return { provider: settings.voiceProvider, mimeType: 'audio/mpeg', audio: toBase64(audio), words: [] };
}
