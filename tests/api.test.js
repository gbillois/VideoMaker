import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, parseLanguages, parseScriptImages, sniffImageType } from '../js/videomaker/api.js';
import { loadSettings, saveSettings, describe as describeSettings, voiceReady } from '../js/videomaker/lib/settings.js';
import { sseResponse, stubFetch, settings, filmJson, memoryStorage } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

describe('the page’s own API', () => {
  it('describes what the author set up, never a key', async () => {
    const response = await call('config', {}, settings({ voiceProvider: 'azure', voiceKey: 'secret', azureRegion: 'westeurope' }));
    const config = await response.json();
    expect(config).toMatchObject({
      languages: ['en-US', 'fr-FR', 'de-DE'], ai: { provider: 'anthropic', model: 'claude-opus-5-5', ready: true },
      voiceProvider: 'azure', voiceReady: true, screenshot: false,
    });
    expect(config.voices['fr-FR'][0]).toBe('fr-FR-RemyMultilingualNeural');
    expect(JSON.stringify(config)).not.toContain('secret');
    expect(JSON.stringify(config)).not.toContain('sk-test');
    const empty = await (await call('config', {}, settings({ apiKey: '' }))).json();
    expect(empty).toMatchObject({ ai: { ready: false }, voiceReady: false, voices: {} });
  });

  it('refuses what needs a server', async () => {
    for (const action of ['page', 'screenshot', 'document']) {
      const response = await call(action, {}, settings());
      expect(response.status).toBe(501);
      expect((await response.json()).error).toMatch(/server/);
    }
    expect((await call('nothing', {}, settings())).status).toBe(404);
  });

  it('streams the script as NDJSON progress lines, then the result', async () => {
    stubFetch(() => sseResponse([
      { type: 'content_block_start', content_block: { type: 'text' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: filmJson } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
    ]));
    const response = await call('script', {
      repo: 'gbillois/crisismaker', context: 'A crisis exercise platform with scenarios and injects.', languages: ['en-US'],
      brief: { productName: 'CrisisMaker', duration: 60 }, images: [],
    }, settings());
    expect(response.headers.get('Content-Type')).toMatch(/ndjson/);
    const lines = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(lines[0].type).toBe('progress');
    expect(lines.at(-1)).toMatchObject({ type: 'result', engine: 'anthropic', model: 'claude-opus-5-5' });
    expect(lines.at(-1).project.scenes.length).toBeGreaterThan(0);
  });

  it('reports a missing key as an error line, and bad input as an error status', async () => {
    const stream = await call('script', { context: 'A crisis exercise platform with scenarios.', languages: ['fr-FR'], brief: {} }, settings({ apiKey: '' }));
    const last = (await stream.text()).trim().split('\n').map(line => JSON.parse(line)).at(-1);
    expect(last).toMatchObject({ type: 'error' });
    expect(last.message).toMatch(/API key/);
    expect((await call('script', { context: 'short', languages: ['fr-FR'] }, settings())).status).toBe(400);
    expect((await call('script', { context: 'x'.repeat(60), languages: ['xx-XX'] }, settings())).status).toBe(400);
  });

  it('refuses the voice when none is set up', async () => {
    const response = await call('tts', { text: 'Hello', voice: 'nova', rate: '+0%' }, settings());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/voice key/);
  });
});

describe('GitHub pictures and repositories', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);

  it('fetches only pictures hosted by GitHub, and checks their bytes', async () => {
    const calls = stubFetch(() => new Response(png));
    const ok = await call('image', { url: 'https://raw.githubusercontent.com/o/r/main/shot.png', token: 'ghp_x' }, settings());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/png');
    expect(calls[0].init.headers.Authorization).toBe('Bearer ghp_x');
    expect((await call('image', { url: 'https://example.com/x.png' }, settings())).status).toBe(400);
    expect((await call('image', { url: 'http://raw.githubusercontent.com/x.png' }, settings())).status).toBe(400);
    const noToken = await call('image', { url: 'https://avatars.githubusercontent.com/u/1', token: 'ghp_x' }, settings());
    expect(noToken.status).toBe(200);
    expect(calls[1].init.headers.Authorization).toBeUndefined();
    stubFetch(() => new Response('<svg></svg>'));
    expect((await call('image', { url: 'https://raw.githubusercontent.com/o/r/main/a.png' }, settings())).status).toBe(502);
  });

  it('reads a repository with the GitHub API, called from the browser', async () => {
    const calls = stubFetch(url => {
      if (url.endsWith('/repos/o/r')) return Response.json({ full_name: 'o/r', html_url: 'https://github.com/o/r', name: 'r', description: 'A tool', default_branch: 'main', topics: [], language: 'JS' });
      if (url.includes('/readme')) return new Response('# R\nA tool.');
      if (url.includes('/git/trees/')) return Response.json({ tree: [{ path: 'README.md', type: 'blob' }], truncated: false });
      return new Response('', { status: 404 });
    });
    const response = await call('analyze', { repo: 'o/r' }, settings());
    expect(response.status).toBe(200);
    const analysis = await response.json();
    expect(analysis).toMatchObject({ owner: 'o', repo: 'r', name: 'r' });
    expect(analysis.context).toContain('## README');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r');
    expect(Object.keys(calls[0].init.headers)).toEqual(['Accept']);
    stubFetch(() => new Response('{}', { status: 404 }));
    expect((await call('analyze', { repo: 'o/missing' }, settings())).status).toBe(404);
    expect((await call('analyze', { repo: 'not a repo' }, settings())).status).toBe(400);
  });
});

describe('request parsing', () => {
  it('recognises images by their bytes, not their name', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('accepts at most six base64 pictures for the script writer', () => {
    const picture = { id: 'img1', name: 'Dashboard', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', width: 1280, height: 800 };
    const parsed = parseScriptImages([...Array(8)].map((_, i) => ({ ...picture, id: `img${i + 1}` })));
    expect(parsed).toHaveLength(6);
    expect(parsed[0]).toMatchObject({ id: 'img1', mediaType: 'image/jpeg', data: '/9j/AAAA', width: 1280 });
    expect(parseScriptImages([{ ...picture, dataUrl: 'data:text/html;base64,PGI+' }])).toEqual([]);
  });

  it('keeps one to three known languages', () => {
    expect(parseLanguages(['fr-FR', 'fr-FR', 'xx', 'en-US'])).toEqual(['fr-FR', 'en-US']);
    expect(() => parseLanguages([])).toThrow(/language/);
  });
});

describe('settings storage', () => {
  it('keeps keys in the tab only and the other choices on the device', () => {
    const storage = { plain: memoryStorage(), secret: memoryStorage() };
    saveSettings(settings({ provider: 'openrouter', model: 'm', apiKey: 'sk-secret', voiceProvider: 'openai', voiceKey: 'sk-voice' }), storage);
    expect(storage.plain.data.get('videomaker.settings')).not.toContain('sk-');
    expect(storage.secret.data.get('videomaker.keys')).toContain('sk-secret');
    expect(loadSettings(storage)).toMatchObject({ provider: 'openrouter', model: 'm', apiKey: 'sk-secret', voiceProvider: 'openai', voiceKey: 'sk-voice' });
    // a new tab: the choices are back, the keys are gone
    expect(loadSettings({ plain: storage.plain, secret: memoryStorage() })).toMatchObject({ provider: 'openrouter', apiKey: '', voiceKey: '' });
  });

  it('is ready only with a key and a model (or a server and a model)', () => {
    expect(describeSettings(settings()).ready).toBe(true);
    expect(describeSettings(settings({ apiKey: '' })).ready).toBe(false);
    expect(describeSettings(settings({ provider: 'openai' })).ready).toBe(false);
    expect(describeSettings(settings({ provider: 'openai', model: 'gpt-x' })).ready).toBe(true);
    expect(describeSettings(settings({ provider: 'local', apiKey: '', model: 'llama' })).ready).toBe(true);
    expect(voiceReady(settings({ voiceProvider: 'azure', voiceKey: 'k' }))).toBe(true);
    expect(voiceReady(settings({ voiceProvider: 'azure', voiceKey: '' }))).toBe(false);
    expect(voiceReady(settings({ voiceProvider: 'none', voiceKey: 'k' }))).toBe(false);
  });
});
