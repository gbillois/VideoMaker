import { afterEach, describe, expect, it, vi } from 'vitest';
import { complete, listModels, readSse, AiError } from '../js/videomaker/lib/ai.js';
import { sseResponse, stubFetch, settings } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

const request = { system: 'SYS', material: 'MATERIAL', task: 'TASK', images: [{ id: 'img1', mediaType: 'image/png', data: 'AAAA' }] };

describe('server-sent events', () => {
  it('reads data lines split across chunks and ignores [DONE]', async () => {
    const seen = [];
    await readSse(sseResponse([{ a: 1 }, { b: 'é' }, '[DONE]'], { chunk: 3 }), event => seen.push(event));
    expect(seen).toEqual([{ a: 1 }, { b: 'é' }]);
  });
});

describe('Claude with the author’s key', () => {
  const claudeEvents = [
    { type: 'message_start', message: { usage: { input_tokens: 120 } } },
    { type: 'content_block_start', content_block: { type: 'thinking' } },
    { type: 'content_block_start', content_block: { type: 'text' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"a":' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '1}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 33 } },
  ];

  it('streams a reply straight from the browser with the key in the headers', async () => {
    const calls = stubFetch(() => sseResponse(claudeEvents));
    const events = [];
    const reply = await complete(settings(), { ...request, onEvent: event => events.push(event.type) });
    expect(reply).toMatchObject({ text: '{"a":1}', inputTokens: 120, outputTokens: 33, model: 'claude-opus-5-5' });
    expect(events).toContain('thinking');
    expect(events).toContain('writing');
    const [call] = calls;
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.init.headers).toMatchObject({ 'x-api-key': 'sk-test', 'anthropic-dangerous-direct-browser-access': 'true' });
    const body = JSON.parse(call.init.body);
    expect(body).toMatchObject({ model: 'claude-opus-5-5', stream: true, system: 'SYS', thinking: { type: 'adaptive' } });
    expect(body.messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/png', data: 'AAAA' } });
    expect(JSON.stringify(body)).toContain('MATERIAL');
  });

  it('skips adaptive thinking for a model that does not take it', async () => {
    const calls = stubFetch(() => sseResponse(claudeEvents));
    await complete(settings({ model: 'claude-haiku-4-5-20251001' }), request);
    const body = JSON.parse(calls[0].init.body);
    expect(body.thinking).toBeUndefined();
    expect(body.max_tokens).toBe(16_000);
  });

  it('turns a refused key, a rate limit and a cut-off reply into plain messages', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }));
    await expect(complete(settings(), request)).rejects.toThrow(/refused the API key \(invalid x-api-key\)/);
    stubFetch(() => new Response('{}', { status: 429 }));
    await expect(complete(settings(), request)).rejects.toThrow(/rate limit/);
    stubFetch(() => sseResponse([{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }]));
    await expect(complete(settings(), request)).rejects.toThrow(/cut off/);
    stubFetch(() => { throw new TypeError('Failed to fetch'); });
    await expect(complete(settings(), request)).rejects.toBeInstanceOf(AiError);
  });
});

describe('OpenAI-compatible providers', () => {
  const chunks = [
    { choices: [{ delta: { content: '{"a":' } }] },
    { choices: [{ delta: { content: '1}' } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 90, completion_tokens: 12 } },
    '[DONE]',
  ];

  it('calls OpenAI with a bearer key, pictures and a completion-token limit', async () => {
    const calls = stubFetch(() => sseResponse(chunks));
    const reply = await complete(settings({ provider: 'openai', model: 'gpt-test' }), request);
    expect(reply).toMatchObject({ text: '{"a":1}', inputTokens: 90, outputTokens: 12, model: 'gpt-test' });
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(calls[0].init.body);
    expect(body.max_completion_tokens).toBe(16_000);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
  });

  it('calls a local server without a key and without pictures', async () => {
    const calls = stubFetch(() => sseResponse(chunks));
    await complete(settings({ provider: 'local', apiKey: '', model: 'llama', baseUrl: 'http://127.0.0.1:1234/v1/' }), request);
    expect(calls[0].url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    const body = JSON.parse(calls[0].init.body);
    expect(body.max_tokens).toBe(16_000);
    expect(body.stream_options).toBeUndefined();
    expect(body.messages[1].content).toHaveLength(1);
  });

  it('reports a reply cut off by the length limit', async () => {
    stubFetch(() => sseResponse([{ choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] }]));
    await expect(complete(settings({ provider: 'openrouter' }), request)).rejects.toThrow(/cut off/);
  });
});

describe('model lists', () => {
  it('lists Claude models and keeps only chat models for OpenAI', async () => {
    stubFetch(() => Response.json({ data: [{ id: 'claude-a' }, { id: 'claude-b' }] }));
    expect(await listModels(settings())).toEqual(['claude-a', 'claude-b']);
    stubFetch(() => Response.json({ data: [{ id: 'gpt-x' }, { id: 'text-embedding-3' }, { id: 'gpt-4o-mini-tts' }, { id: 'o3' }] }));
    expect(await listModels(settings({ provider: 'openai' }))).toEqual(['gpt-x', 'o3']);
  });
});
