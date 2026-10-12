// Test helpers: server-sent-event bodies and a recording fetch.
import { vi } from 'vitest';

/** A Response whose body streams the given events as `data:` lines, in awkward chunks. */
export function sseResponse(events, { chunk = 17, status = 200 } = {}) {
  const text = events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunk) controller.enqueue(bytes.subarray(offset, offset + chunk));
      controller.close();
    },
  }), { status, headers: { 'Content-Type': 'text/event-stream' } });
}

/** Replaces fetch with a handler(url, init) and records every call. */
export function stubFetch(handler) {
  const calls = [];
  vi.stubGlobal('fetch', async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  });
  return calls;
}

export const filmJson = JSON.stringify({
  title: 'Film', productName: 'CrisisMaker',
  scenes: ['hook', 'problem', 'features', 'cta'].map(type => ({
    type,
    copy: {
      'en-US': {
        vo: 'An English sentence.', eyebrow: 'E', title: 'Title', subtitle: 'Sub',
        items: Array.from({ length: type === 'features' ? 3 : type === 'problem' ? 2 : 0 }, (_, i) => ({ title: `t${i}`, text: 'x', value: '' })),
        cues: [],
      },
    },
  })),
});

export const brief = {
  languages: ['en-US'], duration: 60, tone: '', audience: '', notes: '', productName: 'CrisisMaker',
  productUrl: 'https://crisismaker.example', brand: 'Wavestone', seed: 'gbillois/crisismaker',
};

export function memoryStorage() {
  const data = new Map();
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), data };
}

export const settings = (extra = {}) => ({
  provider: 'anthropic', model: '', baseUrl: 'http://127.0.0.1:11434/v1', voiceProvider: 'none', azureRegion: 'westeurope',
  apiKey: 'sk-test', voiceKey: '', ...extra,
});
