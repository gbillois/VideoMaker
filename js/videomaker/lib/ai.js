// Script-writer calls made straight from the browser with the author's own key:
// Claude (Anthropic), OpenAI, OpenRouter, or a local OpenAI-compatible server.
import { AI_PROVIDERS } from './settings.js';

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1';
const OPENAI_URL = 'https://api.openai.com/v1';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
// Thinking counts against max_tokens; three languages of copy plus thinking fit well inside this.
const CLAUDE_MAX_TOKENS = 48_000;
const OTHER_MAX_TOKENS = 16_000;

export function modelFor(settings) {
  return settings.model.trim() || (AI_PROVIDERS[settings.provider] || {}).model || '';
}

function baseFor(settings) {
  if (settings.provider === 'openai') return OPENAI_URL;
  if (settings.provider === 'openrouter') return OPENROUTER_URL;
  return settings.baseUrl.trim().replace(/\/+$/, '');
}

function anthropicHeaders(settings) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': settings.apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function openAiHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'https://videomaker.local';
    headers['X-OpenRouter-Title'] = 'Video Maker';
  }
  return headers;
}

const WHERE = { anthropic: 'Anthropic', openai: 'OpenAI', openrouter: 'OpenRouter', local: 'the local server' };

async function send(settings, url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new AiError(`Could not reach ${WHERE[settings.provider] || 'the AI provider'}. Check the key, the address and your network (the provider must allow requests from a web page).`, 502);
  }
  if (response.ok) return response;
  let detail = '';
  try {
    const body = await response.json();
    detail = (body && body.error && (body.error.message || body.error)) || body.message || '';
  } catch { /* not JSON */ }
  detail = typeof detail === 'string' ? detail.slice(0, 300) : '';
  if (response.status === 401 || response.status === 403) {
    throw new AiError(`${WHERE[settings.provider] || 'The provider'} refused the API key${detail ? ` (${detail})` : ''}.`, 401);
  }
  if (response.status === 429) throw new AiError(`${WHERE[settings.provider] || 'The provider'} rate limit reached: try again in a moment.`, 429);
  throw new AiError(`${WHERE[settings.provider] || 'The provider'} answered ${response.status}${detail ? `: ${detail}` : ''}.`, 502);
}

/** Calls onData(parsedJson) for every `data:` line of a server-sent-events body. */
export async function readSse(response, onData) {
  if (!response.body) throw new AiError('The provider sent an empty reply.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = block => {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      onData(parsed);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');
    let split = buffer.indexOf('\n\n');
    while (split >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      flush(block);
      split = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) flush(buffer);
}

function imageBlocks(settings, images) {
  if (!(AI_PROVIDERS[settings.provider] || {}).vision) return [];
  return images;
}

async function callClaude(settings, { system, material, task, images, onEvent, signal }) {
  const model = modelFor(settings);
  const modern = /^claude-(opus|sonnet|fable)-5/.test(model);
  const body = {
    model,
    max_tokens: modern ? CLAUDE_MAX_TOKENS : OTHER_MAX_TOKENS,
    stream: true,
    system,
    messages: [{
      role: 'user',
      content: [
        ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })),
        { type: 'text', text: material },
        { type: 'text', text: task },
      ],
    }],
  };
  if (modern) {
    body.thinking = { type: 'adaptive' };
    body.output_config = { effort: 'high' };
  }
  const response = await send(settings, `${ANTHROPIC_URL}/messages`, { method: 'POST', headers: anthropicHeaders(settings), body: JSON.stringify(body), signal });
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stop = '';
  await readSse(response, event => {
    if (event.type === 'message_start') inputTokens = (event.message && event.message.usage && event.message.usage.input_tokens) || 0;
    else if (event.type === 'content_block_start') {
      const kind = event.content_block && event.content_block.type;
      if (kind === 'thinking' || kind === 'redacted_thinking') onEvent({ type: 'thinking' });
      else if (kind === 'text') onEvent({ type: 'writing', chars: text.length });
    } else if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
      text += event.delta.text || '';
      onEvent({ type: 'writing', chars: text.length });
    } else if (event.type === 'message_delta') {
      if (event.delta && event.delta.stop_reason) stop = event.delta.stop_reason;
      if (event.usage && event.usage.output_tokens) outputTokens = event.usage.output_tokens;
    } else if (event.type === 'error') {
      throw new AiError((event.error && event.error.message) || 'The provider reported an error.');
    }
  });
  if (stop === 'refusal') throw new AiError('The model declined this request.');
  if (stop === 'max_tokens') throw new AiError('Reply cut off (max_tokens): use fewer languages or a shorter film.');
  return { text, inputTokens, outputTokens };
}

async function callOpenAiCompatible(settings, { system, material, task, images, onEvent, signal }) {
  const model = modelFor(settings);
  const shown = imageBlocks(settings, images);
  const content = [
    ...shown.map(image => ({ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } })),
    { type: 'text', text: `${material}\n\n${task}` },
  ];
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
    [settings.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens']: OTHER_MAX_TOKENS,
  };
  if (settings.provider !== 'local') body.stream_options = { include_usage: true };
  const response = await send(settings, `${baseFor(settings)}/chat/completions`, { method: 'POST', headers: openAiHeaders(settings), body: JSON.stringify(body), signal });
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stop = '';
  onEvent({ type: 'thinking' });
  await readSse(response, event => {
    if (event.error) throw new AiError(typeof event.error === 'string' ? event.error : (event.error.message || 'The provider reported an error.'));
    const choice = event.choices && event.choices[0];
    const piece = choice && choice.delta && choice.delta.content;
    if (piece) {
      text += piece;
      onEvent({ type: 'writing', chars: text.length });
    }
    if (choice && choice.finish_reason) stop = choice.finish_reason;
    if (event.usage) {
      inputTokens = event.usage.prompt_tokens || inputTokens;
      outputTokens = event.usage.completion_tokens || outputTokens;
    }
  });
  if (stop === 'length') throw new AiError('Reply cut off (max_tokens): use fewer languages or a shorter film.');
  if (stop === 'content_filter') throw new AiError('The model declined this request.');
  return { text, inputTokens, outputTokens };
}

/**
 * One completion with the provider the author chose. `onEvent` gets
 * { type: 'thinking' } and { type: 'writing', chars } while the reply streams.
 */
export async function complete(settings, request) {
  const call = { onEvent: () => undefined, ...request };
  const result = settings.provider === 'anthropic' ? await callClaude(settings, call) : await callOpenAiCompatible(settings, call);
  return { ...result, model: modelFor(settings) };
}

/** Model ids the key can use, for the settings list. */
export async function listModels(settings, signal) {
  if (settings.provider === 'anthropic') {
    const response = await send(settings, `${ANTHROPIC_URL}/models?limit=100`, { headers: anthropicHeaders(settings), signal });
    const body = await response.json();
    return (body.data || []).map(model => model.id).filter(Boolean);
  }
  const response = await send(settings, `${baseFor(settings)}/models`, { headers: openAiHeaders(settings), signal });
  const body = await response.json();
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
  const ids = list.map(model => model.id || model.name).filter(Boolean);
  return settings.provider === 'openai'
    ? ids.filter(id => /^(gpt|o\d|chatgpt)/i.test(id) && !/(audio|realtime|search|transcribe|tts|embed|image|moderation|instruct)/i.test(id))
    : ids;
}
