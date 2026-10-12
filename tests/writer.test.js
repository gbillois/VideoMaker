import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectedReplyChars, writeFilm, WriterUnavailableError } from '../js/videomaker/lib/writer.js';
import { extractJson } from '../js/videomaker/lib/json.js';
import { sseResponse, stubFetch, settings, brief, filmJson } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

const claudeReply = text => sseResponse([
  { type: 'message_start', message: { usage: { input_tokens: 10 } } },
  { type: 'content_block_start', content_block: { type: 'text' } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
]);

describe('script writer', () => {
  it('writes a film with the author’s provider and reports its progress', async () => {
    stubFetch(() => claudeReply(`Here you go:\n\`\`\`json\n${filmJson}\n\`\`\``));
    const phases = [];
    const film = await writeFilm(settings(), { context: 'A crisis exercise platform.', images: [], brief, progress: update => phases.push(update.phase) });
    expect(film).toMatchObject({ engine: 'anthropic', model: 'claude-opus-5-5', inputTokens: 10, outputTokens: 5 });
    expect(film.project.scenes.length).toBeGreaterThan(0);
    expect(phases[0]).toBe('reading');
    expect(phases).toContain('writing');
    expect(phases.at(-1)).toBe('checking');
  });

  it('asks the model once more when the first reply is unusable', async () => {
    let attempt = 0;
    const calls = stubFetch(() => claudeReply(++attempt === 1 ? 'not json at all' : filmJson));
    const phases = [];
    const film = await writeFilm(settings(), { context: 'A crisis exercise platform.', images: [], brief, progress: update => phases.push(update.phase) });
    expect(film.project.scenes.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
    expect(phases).toContain('retry');
    expect(JSON.parse(calls[1].init.body).messages[0].content.at(-1).text).toContain('Your previous reply could not be used');
  });

  it('gives up after two unusable replies', async () => {
    const calls = stubFetch(() => claudeReply('{"scenes": []}'));
    await expect(writeFilm(settings(), { context: 'x', images: [], brief })).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });

  it('asks for a key (or a server and a model) before calling anything', async () => {
    const calls = stubFetch(() => claudeReply(filmJson));
    await expect(writeFilm(settings({ apiKey: '' }), { context: 'x', images: [], brief })).rejects.toBeInstanceOf(WriterUnavailableError);
    await expect(writeFilm(settings({ apiKey: '' }), { context: 'x', images: [], brief })).rejects.toThrow(/API key/);
    await expect(writeFilm(settings({ provider: 'local', apiKey: '', model: '' }), { context: 'x', images: [], brief })).rejects.toThrow(/model/);
    expect(calls).toHaveLength(0);
  });

  it('expects a longer reply for more languages and longer films', () => {
    const one = expectedReplyChars({ ...brief, languages: ['fr-FR'], duration: 60 });
    const three = expectedReplyChars({ ...brief, languages: ['fr-FR', 'en-US', 'de-DE'], duration: 60 });
    const longer = expectedReplyChars({ ...brief, languages: ['fr-FR'], duration: 90 });
    expect(one).toBeGreaterThan(3_000);
    expect(three).toBeGreaterThan(one * 2);
    expect(longer).toBeGreaterThan(one);
  });
});

describe('JSON in a model reply', () => {
  it('finds the object in fences, prose and thinking tags', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure! {"a":{"b":"}"}} Hope it helps.')).toBe('{"a":{"b":"}"}}');
    expect(extractJson('<think>draft {"a":0}</think>{"a":2}')).toBe('{"a":2}');
    expect(extractJson('```json\n{"a":1')).toBe('{"a":1');
  });
});
