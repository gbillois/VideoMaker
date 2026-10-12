import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSsml, escapeXml, isKnownVoice, normalizeRate, synthesize, voicesFor, AZURE_VOICES, OPENAI_VOICES } from '../js/videomaker/lib/voice.js';
import { stubFetch, settings } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());

const mp3 = new Uint8Array(400).fill(7);

describe('voice SSML', () => {
  it('escapes the narration and bounds the speaking rate', () => {
    expect(buildSsml('R&D <fast> "ok"', 'fr-FR-HenriNeural', '+5%')).toContain('R&amp;D &lt;fast&gt; &quot;ok&quot;');
    expect(buildSsml('Bonjour', 'fr-FR-HenriNeural', '+5%')).toContain("xml:lang='fr-FR'");
    expect(escapeXml('a\u0001b')).toBe('a b');
    expect(normalizeRate('+80%')).toBe('+40%');
    expect(normalizeRate('-5%')).toBe('-5%');
    expect(normalizeRate(undefined)).toBe('+0%');
  });
});

describe('voice providers', () => {
  it('offers the Microsoft neural voices with Azure and the OpenAI voices for every language with OpenAI', () => {
    expect(voicesFor(settings({ voiceProvider: 'azure' }))).toBe(AZURE_VOICES);
    expect(voicesFor(settings({ voiceProvider: 'openai' }))['de-DE']).toEqual(OPENAI_VOICES);
    expect(voicesFor(settings())).toEqual({});
    expect(isKnownVoice('fr-FR-RemyMultilingualNeural', settings({ voiceProvider: 'azure' }))).toBe(true);
    expect(isKnownVoice('fr-FR-RemyMultilingualNeural', settings({ voiceProvider: 'openai' }))).toBe(false);
  });

  it('calls Azure Speech from the browser with the author’s key and region', async () => {
    const calls = stubFetch(() => new Response(mp3));
    const take = await synthesize(settings({ voiceProvider: 'azure', voiceKey: 'az-key', azureRegion: 'westeurope' }),
      { text: 'Bonjour le monde', voice: 'fr-FR-HenriNeural', rate: '+5%' });
    expect(take).toMatchObject({ provider: 'azure', mimeType: 'audio/mpeg', words: [] });
    expect(atob(take.audio)).toHaveLength(400);
    expect(calls[0].url).toBe('https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(calls[0].init.headers['Ocp-Apim-Subscription-Key']).toBe('az-key');
    expect(calls[0].init.body).toContain('rate=\'+5%\'');
  });

  it('calls OpenAI speech with a speed instead of a rate', async () => {
    const calls = stubFetch(() => new Response(mp3));
    await synthesize(settings({ voiceProvider: 'openai', voiceKey: 'sk-voice' }), { text: 'Hello', voice: 'nova', rate: '+10%' });
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-voice');
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ voice: 'nova', input: 'Hello', response_format: 'mp3', speed: 1.1 });
  });

  it('refuses without a key, with an unknown voice, and explains a refused key', async () => {
    const calls = stubFetch(() => new Response('denied', { status: 401 }));
    await expect(synthesize(settings(), { text: 'Hi', voice: 'nova', rate: '+0%' })).rejects.toThrow(/voice key/);
    const azure = settings({ voiceProvider: 'azure', voiceKey: 'k' });
    await expect(synthesize(azure, { text: 'Hi', voice: 'nova', rate: '+0%' })).rejects.toThrow(/not available/);
    await expect(synthesize({ ...azure, azureRegion: 'bad region!' }, { text: 'Hi', voice: 'fr-FR-HenriNeural', rate: '+0%' })).rejects.toThrow(/region/);
    expect(calls).toHaveLength(0);
    await expect(synthesize(azure, { text: 'Hi', voice: 'fr-FR-HenriNeural', rate: '+0%' })).rejects.toThrow(/refused the voice key/);
  });
});
