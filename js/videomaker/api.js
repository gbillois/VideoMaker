// The page's own "API": every step that used to be a server call runs here, in
// the browser, with the author's own keys. It answers with real Response
// objects (JSON, an image, an NDJSON stream), so the page code keeps its shape.
import { analyzeRepository, RepoAccessError } from './lib/github.js';
import { currentSettings, describe, voiceReady } from './lib/settings.js';
import { AiError } from './lib/ai.js';
import { WriterUnavailableError, writeFilm } from './lib/writer.js';
import { synthesize, voicesFor, VoiceError } from './lib/voice.js';
import { VIDEO_LANGUAGES, videoPace, videoPurpose, videoStyle } from './lib/script.js';

const MAX_SCRIPT_IMAGES = 6;
const MAX_IMAGE_BASE64 = 3_500_000;
const MAX_PROXIED_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_HOSTS = new Set([
  'raw.githubusercontent.com', 'github.com', 'user-images.githubusercontent.com', 'private-user-images.githubusercontent.com',
  'camo.githubusercontent.com', 'avatars.githubusercontent.com', 'objects.githubusercontent.com',
  'media.githubusercontent.com',
]);
// A token may only travel to hosts GitHub itself serves repository files from.
const TOKEN_HOSTS = new Set(['raw.githubusercontent.com', 'media.githubusercontent.com']);

export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function asString(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function sniffImageType(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  if (bytes.length > 6 && String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8') return 'image/gif';
  return null;
}

export function parseLanguages(value) {
  const list = Array.isArray(value) ? value : [];
  const unique = [...new Set(list.filter(code => VIDEO_LANGUAGES.includes(String(code))))].slice(0, 3);
  if (!unique.length) throw new ApiError('Pick one to three languages (en-US, fr-FR, de-DE).');
  return unique;
}

export function parseScriptImages(value) {
  const list = Array.isArray(value) ? value.slice(0, MAX_SCRIPT_IMAGES) : [];
  return list.flatMap((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw : {};
    const match = String(item.dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > MAX_IMAGE_BASE64) return [];
    const id = /^img\d{1,2}$/.test(String(item.id)) ? String(item.id) : `img${index + 1}`;
    return [{
      id,
      name: asString(item.name, 80) || id,
      mediaType: match[1],
      data: match[2],
      width: Math.max(1, Math.min(10_000, Math.round(Number(item.width) || 1))),
      height: Math.max(1, Math.min(10_000, Math.round(Number(item.height) || 1))),
    }];
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function config(settings) {
  const ai = describe(settings);
  return {
    languages: VIDEO_LANGUAGES,
    voices: voicesFor(settings),
    ai,
    voiceProvider: settings.voiceProvider,
    voiceReady: voiceReady(settings),
    screenshot: false,
  };
}

async function analyze(body) {
  return json(await analyzeRepository(asString(body.repo, 300), asString(body.token, 300) || undefined));
}

/** Repository pictures fetched here, so the canvas stays exportable (GitHub sends CORS headers). */
async function image(body) {
  const token = asString(body.token, 300);
  let url;
  try {
    url = new URL(asString(body.url, 2_000));
  } catch {
    throw new ApiError('Invalid picture address.');
  }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) throw new ApiError('Only images hosted by GitHub are accepted.');
  let response;
  try {
    response = await fetch(url.toString(), {
      headers: token && TOKEN_HOSTS.has(url.hostname) ? { Authorization: `Bearer ${token}` } : {},
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError('This picture cannot be fetched from the browser.', 502);
  }
  if (!response.ok) throw new ApiError(`Image unavailable (${response.status})`, 502);
  if (response.url && !IMAGE_HOSTS.has(new URL(response.url).hostname)) throw new ApiError('Only images hosted by GitHub are accepted.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_PROXIED_IMAGE_BYTES) throw new ApiError('Image too large', 502);
  const type = sniffImageType(bytes);
  if (!type) throw new ApiError('This file is not a PNG, JPEG, WebP or GIF image', 502);
  return new Response(bytes, { headers: { 'Content-Type': type } });
}

/** NDJSON stream: progress lines, then one result or error line. */
function script(body, settings) {
  const languages = parseLanguages(body.languages);
  const context = asString(body.context, 150_000);
  if (context.length < 40) throw new ApiError('Analyse a repository or add some text first.');
  const input = body.brief && typeof body.brief === 'object' ? body.brief : {};
  const purpose = videoPurpose(input.purpose);
  const brief = {
    languages,
    duration: Math.max(30, Math.min(120, Number(input.duration) || 60)),
    tone: asString(input.tone, 200),
    audience: asString(input.audience, 200),
    notes: asString(input.notes, 2_000),
    productName: asString(input.productName, 60),
    productUrl: asString(input.productUrl, 200),
    brand: asString(input.brand, 40) || 'Wavestone',
    seed: asString(body.repo, 200),
    style: videoStyle(input.style),
    marketing: input.marketing === true,
    purpose,
    pace: videoPace(input.pace, purpose),
    price: input.price === true,
  };
  const images = parseScriptImages(body.images);
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      const send = line => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      (async () => {
        try {
          const film = await writeFilm(settings, { context, images, brief, progress: update => send({ type: 'progress', ...update }) });
          send({ type: 'result', ...film });
        } catch (error) {
          const known = error instanceof WriterUnavailableError || error instanceof AiError || error instanceof Error;
          send({ type: 'error', message: known ? error.message.slice(0, 400) : 'Unexpected error' });
        } finally {
          controller.close();
        }
      })();
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

async function tts(body, settings) {
  return json(await synthesize(settings, { text: body.text, voice: asString(body.voice, 80), rate: body.rate }));
}

const UNAVAILABLE = 'This needs a server and is not available in the browser-only version. Paste the text or upload a screenshot instead.';

/**
 * action: 'config' | 'analyze' | 'image' | 'script' | 'tts' (| 'document' | 'page' | 'screenshot', refused).
 * Always resolves to a Response; failures are { error } with a status.
 */
export async function call(action, body = {}, settings = currentSettings()) {
  try {
    if (action === 'config') return json(config(settings));
    if (action === 'analyze') return await analyze(body);
    if (action === 'image') return await image(body);
    if (action === 'script') return script(body, settings);
    if (action === 'tts') return await tts(body, settings);
    if (action === 'document' || action === 'page' || action === 'screenshot') return json({ error: UNAVAILABLE }, 501);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof ApiError || error instanceof RepoAccessError || error instanceof VoiceError || error instanceof AiError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: error instanceof Error ? error.message.slice(0, 300) : 'Unexpected error' }, 502);
  }
}
