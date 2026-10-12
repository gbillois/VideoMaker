// Video Maker audio: narration takes (Azure Speech or OpenAI voices with the
// author's own key, cached per text), original music synthesised per platform, soft foley, and
// the final mix with the music ducked under the voice.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  const RATE = 48000;
  const takeCache = new Map();
  const DB_NAME = 'videomaker-tts';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('takes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGet(key) {
    try {
      const db = await openDb();
      return await new Promise(resolve => {
        const request = db.transaction('takes').objectStore('takes').get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async function dbPut(key, value) {
    try {
      const db = await openDb();
      db.transaction('takes', 'readwrite').objectStore('takes').put(value, key);
    } catch { /* cache is best effort */ }
  }

  async function hash(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function decode(bytes) {
    const ctx = new OfflineAudioContext(1, RATE, RATE);
    return await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  /** One narration take: { buffer, words, duration, provider }. */
  VM.fetchTake = async function (text, voice, rate) {
    const key = await hash(`${voice}|${rate}|${text}`);
    if (takeCache.has(key)) return takeCache.get(key);
    let stored = await dbGet(key);
    if (!stored) {
      const api = await VM.apiReady;
      const response = await api.call('tts', { text, voice, rate });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Voice unavailable (${response.status})`);
      stored = { audio: body.audio, words: body.words || [], provider: body.provider };
      await dbPut(key, stored);
    }
    const buffer = await decode(base64ToBytes(stored.audio));
    const words = stored.words || [];
    const lastWord = words.length ? words[words.length - 1].end : 0;
    const take = {
      buffer, words, provider: stored.provider,
      duration: lastWord ? Math.min(buffer.duration, lastWord + 0.2) : buffer.duration,
    };
    takeCache.set(key, take);
    return take;
  };

  // ── music ────────────────────────────────────────────────────────────────
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Progressions as scale degrees in a major key (0 = I), voiced as triads.
  const PROGRESSIONS = [
    [5, 3, 0, 4], // vi IV I V
    [0, 4, 5, 3], // I V vi IV
    [3, 0, 4, 5], // IV I V vi
    [5, 4, 3, 4], // vi V IV V
  ];
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];

  function triad(root, degree) {
    return [0, 2, 4].map(step => {
      const d = degree + step;
      return root + MAJOR[d % 7] + 12 * Math.floor(d / 7);
    });
  }

  function noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const random = rng(7);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    return buffer;
  }

  function envelope(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function synthMusic(ctx, out, duration, style, seed) {
    if (style === 'none') return;
    const random = rng(seed || 1);
    const calm = style === 'calm';
    const bpm = calm ? 78 + Math.floor(random() * 12) : 96 + Math.floor(random() * 16);
    const beat = 60 / bpm;
    const bar = beat * 4;
    const root = 55 + Math.floor(random() * 8); // G3..D4 major keys
    const progression = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
    const noise = noiseBuffer(ctx, 1);
    const bars = Math.ceil(duration / bar) + 1;

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = calm ? 900 : 1500;
    padFilter.Q.value = 0.6;
    padFilter.connect(out);

    const delay = ctx.createDelay(2);
    delay.delayTime.value = beat * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(out);

    for (let b = 0; b < bars; b++) {
      const t0 = b * bar;
      if (t0 > duration) break;
      const degree = progression[b % progression.length];
      const chord = triad(root, degree);
      const intro = b < 2;
      const outro = t0 > duration - bar * 1.5;
      // pad
      chord.forEach(note => {
        [-7, 7].forEach(detune => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = midi(note);
          osc.detune.value = detune;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.016, t0 + 0.5);
          g.gain.setValueAtTime(0.016, t0 + bar - 0.1);
          g.gain.linearRampToValueAtTime(0.0001, t0 + bar + 0.6);
          osc.connect(g);
          g.connect(padFilter);
          osc.start(t0);
          osc.stop(t0 + bar + 0.7);
        });
      });
      // bass
      const bassNote = chord[0] - 24;
      const bassHits = calm ? [0, 2] : [0, 1.5, 2, 3.5];
      bassHits.forEach(offset => {
        const t = t0 + offset * beat;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midi(bassNote);
        const g = ctx.createGain();
        envelope(g.gain, t, calm ? 0.12 : 0.16, 0.02, beat * 1.1);
        osc.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + beat * 1.3);
      });
      if (intro) continue;
      // arpeggio
      const pattern = calm ? [0, 2, 1, 2] : [0, 1, 2, 1, 2, 1, 0, 2];
      const step = bar / pattern.length;
      pattern.forEach((index, i) => {
        const t = t0 + i * step;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midi(chord[index] + 12);
        const g = ctx.createGain();
        envelope(g.gain, t, calm ? 0.035 : 0.045, 0.005, step * 1.6);
        osc.connect(g);
        g.connect(out);
        g.connect(delay);
        osc.start(t);
        osc.stop(t + step * 2);
      });
      if (calm || outro) continue;
      // soft kick on every beat, airy hats on the off-beats
      for (let k = 0; k < 4; k++) {
        const t = t0 + k * beat;
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const g = ctx.createGain();
        envelope(g.gain, t, 0.32, 0.004, 0.22);
        osc.connect(g);
        g.connect(out);
        osc.start(t);
        osc.stop(t + 0.3);
        const hat = ctx.createBufferSource();
        hat.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7500;
        const hg = ctx.createGain();
        envelope(hg.gain, t + beat / 2, 0.028, 0.002, 0.05);
        hat.connect(hp);
        hp.connect(hg);
        hg.connect(out);
        hat.start(t + beat / 2);
        hat.stop(t + beat / 2 + 0.1);
      }
    }
  }

  function whoosh(ctx, out, t, noise, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.6);
  }

  function pop(ctx, out, t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(1150, t + 0.07);
    const g = ctx.createGain();
    envelope(g.gain, t, 0.05, 0.004, 0.12);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Renders the soundtrack of a timeline. takes: { [sceneId]: take } (may be partial).
   * opts: { music: 'uplifting'|'calm'|'none', musicLevel: 0..1, foley: boolean, seed }
   */
  VM.mixSoundtrack = async function (timeline, takes, opts) {
    const duration = timeline.duration;
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * RATE), RATE);
    const master = ctx.createGain();
    master.gain.value = 0.95;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    const level = 0.5 * (opts.musicLevel === undefined ? 0.6 : opts.musicLevel);
    const music = ctx.createGain();
    music.connect(master);
    const g = music.gain;
    g.setValueAtTime(0.0001, 0);
    g.linearRampToValueAtTime(level, 1.2);
    for (const s of timeline.scenes) {
      if (!s.copy.vo || !(takes && takes[s.scene.id])) continue;
      g.setValueAtTime(level, Math.max(0, s.voStart - 0.3));
      g.linearRampToValueAtTime(level * 0.32, s.voStart);
      g.setValueAtTime(level * 0.32, s.voEnd);
      g.linearRampToValueAtTime(level, s.voEnd + 0.4);
    }
    g.setValueAtTime(level, Math.max(0, duration - 2.5));
    g.linearRampToValueAtTime(0.0001, duration);
    synthMusic(ctx, music, duration, opts.music || 'uplifting', opts.seed);

    const voice = ctx.createGain();
    voice.gain.value = 1.0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    voice.connect(hp);
    hp.connect(master);
    for (const s of timeline.scenes) {
      const take = takes && takes[s.scene.id];
      if (!take) continue;
      const src = ctx.createBufferSource();
      src.buffer = take.buffer;
      src.connect(voice);
      src.start(s.voStart);
    }

    if (opts.foley !== false) {
      const noise = noiseBuffer(ctx, 1);
      const fx = ctx.createGain();
      fx.gain.value = 0.9;
      fx.connect(master);
      timeline.scenes.forEach((s, i) => {
        if (i > 0) whoosh(ctx, fx, Math.max(0, s.start - 0.15), noise, 0.07);
        s.cues.forEach(t => pop(ctx, fx, t));
      });
    }
    return await ctx.startRendering();
  };
})();
