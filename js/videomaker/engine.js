// Video Maker engine: turns a project + voice takes into a timeline, and draws
// any instant of it on a 1920×1080 canvas. The same code drives the live
// preview and the MP4 export, so what you preview is what you download.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  const W = 1920;
  const H = 1080;
  const TRANS = 0.5;
  // The product style travels between scenes with the camera: longer moves.
  const PRODUCT_TRANS = 0.9;
  // The launch style flies over its canvas: a quicker move.
  const LAUNCH_TRANS = 0.8;
  // The showcase style cuts with a whip pan.
  const SHOWCASE_TRANS = 0.45;
  VM.transitionFor = project => {
    const style = project && project.style;
    const trans = style === 'product' ? PRODUCT_TRANS : style === 'launch' ? LAUNCH_TRANS : style === 'showcase' ? SHOWCASE_TRANS : TRANS;
    // A fast cut moves on quicker between scenes.
    return project && project.pace === 'fast' ? Math.round(trans * 0.68 * 100) / 100 : trans;
  };
  const TAIL = 0.7;
  const FAST_TAIL = 0.3;
  const C = {
    indigo: '#451DC7', indigo500: '#5A2BE0', indigo700: '#36169B', indigo800: '#2D1380', indigo900: '#1E0D57',
    indigo950: '#150939', indigo50: '#F1EEFB', indigo100: '#D1CAF2', green: '#04F06A', green300: '#5CF59E',
    green700: '#088A42', green50: '#E1FDED', ink: '#16121F', ink700: '#3A3550', ink500: '#6B6580', ink400: '#817C95',
    ink200: '#CFCCDC', ink100: '#E6E4EE', ink50: '#F5F4F9', white: '#FFFFFF',
  };
  // Per-platform looks inside the Wavestone palette (accent × brand surface).
  const ACCENTS = {
    green: { accent: '#04F06A', rgb: '4,240,106', text: '#088A42', soft: '#E1FDED', on: '#1E0D57' },
  };
  const SURFACES = {
    indigo: ['#5226E0', '#451DC7', '#2D1380'],
    midnight: ['#36169B', '#1E0D57', '#150939'],
    ink: ['#514C63', '#242036', '#16121F'],
  };
  let TH = Object.assign({ surface: SURFACES.indigo }, ACCENTS.green);
  VM.THEME_ACCENTS = Object.keys(ACCENTS);
  VM.THEME_SURFACES = Object.keys(SURFACES);
  VM.SCENE_VARIANTS = {
    hook: 3, problem: 2, reveal: 1, screenshot: 2, features: 3, steps: 2, stats: 2, quote: 1, team: 1, planning: 1, cta: 2,
    emblem: 1, keys: 1, moment: 1, diagram: 1, compare: 1,
  };
  // Scenes only some styles draw in their own way; the others draw their fallback.
  VM.STYLE_SCENES = { slides: ['compare'], product: ['diagram'], launch: ['emblem', 'keys'], showcase: ['emblem', 'moment'] };
  VM.SCENE_FALLBACK = { emblem: 'reveal', keys: 'features', moment: 'quote', diagram: 'steps', compare: 'problem' };
  /** The drawing a style uses for a scene type: its own, else the type's fallback, else features. */
  VM.pickScene = (table, type) => table[type] || table[VM.SCENE_FALLBACK[type]] || table.features;

  let SURFACE_NAME = 'indigo';
  function useTheme(theme) {
    const t = theme || {};
    SURFACE_NAME = SURFACES[t.surface] ? t.surface : 'indigo';
    TH = Object.assign({ surface: SURFACES[t.surface] || SURFACES.indigo, paper: t.paper || 'white' }, ACCENTS[t.accent] || ACCENTS.green);
  }

  const DISPLAY = 'Poppins, "Segoe UI", system-ui, sans-serif';
  const BODY = 'Inter, "Segoe UI", system-ui, sans-serif';
  const BRAND_SCENES = new Set(['hook', 'quote', 'cta', 'stats']);
  const MIN_DURATION = { hook: 3.5, cta: 4.5, reveal: 3.5, screenshot: 4.5, emblem: 3.5, keys: 3.5, moment: 3.2, diagram: 4, compare: 4, team: 4, planning: 4.5 };
  // A fast cut (product pitch default): scenes last as long as their few words, barely more.
  const FAST_MIN_DURATION = { hook: 2.4, cta: 3.6, reveal: 2.4, screenshot: 3.2, emblem: 2.6, keys: 2.8, moment: 2.4, diagram: 3.2, compare: 3, team: 3, planning: 3.4 };

  VM.SIZE = { width: W, height: H };
  /** Output size: the showcase style is vertical (9:16) unless set to landscape; the others are 16:9. */
  VM.frameSize = project => (project && project.style === 'showcase' && project.format !== 'landscape'
    ? { width: 1080, height: 1920 } : { width: W, height: H });
  VM.COLORS = C;
  VM.SCENE_TYPES = ['hook', 'problem', 'reveal', 'screenshot', 'features', 'steps', 'stats', 'quote', 'team', 'planning', 'cta', 'emblem', 'keys', 'moment', 'diagram', 'compare'];

  // ── maths ────────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeBack = p => { const c1 = 1.5; const c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const prog = (t, t0, dur) => clamp((t - t0) / (dur || 0.001), 0, 1);

  VM.normWord = function (text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ß]/g, '');
  };

  // ── timeline ─────────────────────────────────────────────────────────────
  VM.estimateSpeech = function (text) {
    const clean = String(text || '').trim();
    if (!clean) return 0;
    const pauses = (clean.match(/[.!?…]/g) || []).length * 0.35 + (clean.match(/[,;:—–]/g) || []).length * 0.15;
    return clean.length / 15.5 + pauses + 0.2;
  };

  /** Start/end of every spoken token of `text`, from the voice's word timings or estimated. */
  function tokenTimes(text, words, duration) {
    const tokens = String(text || '').split(/\s+/).filter(Boolean);
    const out = [];
    if (words && words.length) {
      let j = 0;
      for (const token of tokens) {
        const norm = VM.normWord(token);
        if (!norm || j >= words.length) {
          const prev = out.length ? out[out.length - 1].end : 0;
          out.push({ token, start: prev, end: prev });
          continue;
        }
        const start = words[j].start;
        let acc = '';
        let end = words[j].end;
        while (j < words.length && acc.length < norm.length) {
          acc += VM.normWord(words[j].text);
          end = words[j].end;
          j++;
        }
        out.push({ token, start, end });
      }
      return out;
    }
    const weights = tokens.map(token => token.length + 2 + (/[.!?…]$/.test(token) ? 7 : /[,;:]$/.test(token) ? 3 : 0));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    for (let i = 0; i < tokens.length; i++) {
      const start = (acc / total) * duration;
      acc += weights[i];
      out.push({ token: tokens[i], start, end: (acc / total) * duration - (weights[i] > tokens[i].length + 2 ? 0.2 : 0) });
    }
    return out;
  }

  function captionChunks(times) {
    const chunks = [];
    let current = [];
    times.forEach((time, index) => {
      current.push(time);
      const ends = /[.!?…]["»”]?$/.test(time.token);
      const soft = /[,;:—–]$/.test(time.token);
      const last = index === times.length - 1;
      if (last || ends || (soft && current.length >= 6) || current.length >= 11) {
        chunks.push({ tokens: current, start: current[0].start, end: current[current.length - 1].end });
        current = [];
      }
    });
    return chunks;
  }

  function cueTimes(copy, times, voDur) {
    const count = (copy.items || []).length;
    const result = [];
    let from = 0;
    for (let i = 0; i < count; i++) {
      const cue = VM.normWord((copy.cues || [])[i]);
      let found = -1;
      if (cue) {
        for (let k = from; k < times.length; k++) {
          const norm = VM.normWord(times[k].token);
          if (norm === cue || (cue.length > 3 && norm.startsWith(cue))) { found = k; break; }
        }
      }
      if (found >= 0) {
        result.push(times[found].start);
        from = found + 1;
      } else {
        result.push(count > 1 ? voDur * (0.12 + 0.72 * i / (count - 1)) : voDur * 0.3);
      }
    }
    // Cues must move forward in time, with room for each entrance.
    for (let i = 1; i < result.length; i++) result[i] = Math.max(result[i], result[i - 1] + 0.35);
    return result;
  }

  /**
   * takes: { [sceneId]: { duration, words } } for this language (optional).
   * Returns absolute times for scenes, cues, captions.
   */
  VM.buildTimeline = function (project, lang, takes) {
    const scenes = [];
    let t = 0;
    const list = project.scenes || [];
    const trans = VM.transitionFor(project);
    const fast = project.pace === 'fast';
    const tail = fast ? FAST_TAIL : TAIL;
    const minimum = fast ? FAST_MIN_DURATION : MIN_DURATION;
    // The next voice starts as the camera settles, a breath after the previous one.
    const lead = fast ? Math.max(0.35, trans - 0.05) : 0.55;
    list.forEach((scene, index) => {
      const copy = (scene.copy && scene.copy[lang]) || { vo: '', items: [], cues: [] };
      const take = takes && takes[scene.id];
      const voDur = take ? take.duration : VM.estimateSpeech(copy.vo);
      const start = index === 0 ? 0 : t - trans;
      const voStart = start + (index === 0 ? (fast ? 0.5 : 0.7) : lead);
      const last = index === list.length - 1;
      let end = Math.max(voStart + voDur + tail, start + (minimum[scene.type] || (fast ? 2.0 : 3.2)));
      if (last) end += 1.6;
      const times = tokenTimes(copy.vo, take && take.words, voDur).map(time => ({
        token: time.token, start: voStart + time.start, end: voStart + time.end,
      }));
      scenes.push({
        index, scene, copy, start, end, voStart, voEnd: voStart + voDur, voDur,
        tokens: times,
        captions: captionChunks(times),
        cues: cueTimes(copy, times.map(time => ({ token: time.token, start: time.start - voStart })), voDur).map(c => voStart + c),
      });
      t = end;
    });
    return { lang, scenes, duration: t, trans };
  };

  // ── text ─────────────────────────────────────────────────────────────────
  function font(ctx, weight, size, family) {
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
  }

  /** Words of `text`; words inside *asterisks* carry the accent. */
  function richWords(text) {
    const words = [];
    // a line break typed in a field forces a new line on screen
    String(text || '').replace(/\r/g, '').split('\n').forEach((row, r) => {
      if (r > 0) words.push({ word: '', br: true });
      row.split(/(\*[^*]+\*)/).forEach(part => {
        const accent = /^\*[^*]+\*$/.test(part);
        part.replace(/\*/g, '').split(/[ \t]+/).filter(Boolean).forEach(word => words.push({ word, accent }));
      });
    });
    return words;
  }

  function layoutRich(ctx, text, maxWidth) {
    const words = richWords(text);
    const space = ctx.measureText(' ').width;
    const lines = [];
    let line = [];
    let width = 0;
    for (const item of words) {
      if (item.br) {
        // a second line break in a row leaves an empty line
        lines.push({ words: line, width });
        line = [];
        width = 0;
        continue;
      }
      const w = ctx.measureText(item.word).width;
      if (line.length && width + space + w > maxWidth) {
        lines.push({ words: line, width });
        line = [];
        width = 0;
      }
      item.x = line.length ? width + space : 0;
      item.w = w;
      width = line.length ? width + space + w : w;
      line.push(Object.assign({}, item));
    }
    if (line.length) lines.push({ words: line, width });
    return lines;
  }

  /** Largest size (from `sizes`) at which `text` fits in maxLines lines. */
  function fitRich(ctx, text, maxWidth, maxLines, sizes, weight, family) {
    for (const size of sizes) {
      font(ctx, weight, size, family);
      const lines = layoutRich(ctx, text, maxWidth);
      if (lines.length <= maxLines && lines.every(l => l.width <= maxWidth)) return { size, lines };
    }
    const size = sizes[sizes.length - 1];
    font(ctx, weight, size, family);
    return { size, lines: layoutRich(ctx, text, maxWidth).slice(0, maxLines) };
  }

  /**
   * Draws laid-out lines. `reveal(i)` gives each word's entrance progress (0..1),
   * i counting words across lines. align: 'left' | 'center'.
   */
  function drawLines(ctx, fit, x, y, opts) {
    const lh = fit.size * (opts.leading || 1.14);
    let index = 0;
    fit.lines.forEach((line, li) => {
      const ox = opts.align === 'center' ? x - line.width / 2 : x;
      line.words.forEach(item => {
        const p = opts.reveal ? opts.reveal(index) : 1;
        index++;
        if (p <= 0) return;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 1.4, 0, 1);
        ctx.fillStyle = item.accent ? (opts.accent || TH.accent) : opts.color;
        ctx.fillText(item.word, ox + item.x, y + li * lh + (1 - easeOut(p)) * fit.size * 0.45);
        ctx.restore();
      });
    });
    return fit.lines.length * lh;
  }

  function textBlock(ctx, text, x, y, maxWidth, opts) {
    if (!text) return 0;
    const fit = fitRich(ctx, text, maxWidth, opts.maxLines || 3, opts.sizes, opts.weight || 400, opts.family || BODY);
    ctx.textBaseline = 'top';
    return drawLines(ctx, fit, x, y, opts);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function shadowCard(ctx, x, y, w, h, fill, radius, strong) {
    ctx.save();
    ctx.shadowColor = strong ? 'rgba(69,29,199,0.28)' : 'rgba(22,18,31,0.10)';
    ctx.shadowBlur = strong ? 40 : 28;
    ctx.shadowOffsetY = strong ? 16 : 10;
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
  }

  // ── backgrounds and chrome ─────────────────────────────────────────────
  function brandBackground(ctx, t, s) {
    const g = ctx.createRadialGradient(W * 0.25, H * 0.15, 0, W * 0.25, H * 0.15, W * 1.15);
    g.addColorStop(0, TH.surface[0]);
    g.addColorStop(0.38, TH.surface[1]);
    g.addColorStop(1, TH.surface[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const local = t - s.start;
    const draw = easeInOut(prog(local, 0.1, 1.6));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = TH.accent;
    ctx.lineWidth = 9;
    const rot = local * 0.018;
    ctx.beginPath();
    ctx.arc(W * 0.9, H * 1.06, 620, Math.PI * 1.02 + rot, Math.PI * 1.02 + rot + Math.PI * 0.62 * draw);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W * 0.9, H * 1.06, 700, Math.PI * 1.0 - rot, Math.PI * 1.0 - rot + Math.PI * 0.7 * draw);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W * 0.04, -H * 0.1, 360, Math.PI * 0.05 + rot, Math.PI * 0.05 + rot + Math.PI * 0.55 * draw);
    ctx.stroke();
    ctx.restore();
  }

  function lightBackground(ctx, t, s) {
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, W, H);
    const local = t - s.start;
    const g = ctx.createRadialGradient(W * 0.92, H * 0.08, 0, W * 0.92, H * 0.08, 760);
    g.addColorStop(0, 'rgba(209,202,242,0.55)');
    g.addColorStop(1, 'rgba(209,202,242,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(207,204,220,0.55)';
    const drift = (local * 6) % 48;
    for (let y = 24; y < H; y += 48) {
      for (let x = 24 - drift; x < W; x += 48) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  function eyebrow(ctx, text, x, y, t, t0, onBrand, align) {
    if (!text) return;
    const p = easeOut(prog(t, t0, 0.6));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    font(ctx, 700, 26, BODY);
    ctx.letterSpacing = '4px';
    ctx.textBaseline = 'top';
    ctx.fillStyle = onBrand ? C.white : C.ink;
    const label = text.toUpperCase();
    const w = ctx.measureText(label).width;
    const x0 = align === 'center' ? x - w / 2 : x;
    ctx.fillText(label, x0, y + (1 - p) * 14);
    ctx.fillStyle = TH.accent;
    ctx.fillRect(x0, y + 40, w * easeOut(prog(t, t0 + 0.2, 0.7)), 5);
    ctx.restore();
  }

  function heading(ctx, text, x, y, maxWidth, t, t0, opts) {
    ctx.save();
    ctx.letterSpacing = '-1px';
    const fit = fitRich(ctx, text, maxWidth, opts.maxLines || 2, opts.sizes || [72, 64, 56, 50], opts.weight || 700, DISPLAY);
    ctx.textBaseline = 'top';
    const height = drawLines(ctx, fit, x, y, {
      color: opts.color, accent: opts.accent, align: opts.align, leading: 1.1,
      reveal: i => prog(t, t0 + i * (opts.stagger || 0.05), 0.55),
    });
    ctx.restore();
    return height;
  }

  // Official Wavestone logos (assets/videomaker/logo, from the brand kit),
  // rasterised once and cropped to their ink so they can be sized by height.
  const LOGOS = {};
  const LOGO_FILES = {
    'wordmark-indigo': 'logo-wordmark-indigo.svg', 'wordmark-white': 'logo-wordmark-white.svg',
    'lockup-indigo': 'logo-lockup-indigo.svg', 'lockup-white': 'logo-lockup-white.svg',
  };

  async function rasterLogo(file) {
    const text = await (await fetch(`assets/videomaker/logo/${file}`)).text();
    const box = (text.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , vw, vh] = (box || '0 0 1000 250').split(/\s+/).map(Number);
    const width = 2400;
    const height = Math.round(width * vh / vw);
    const sized = text.replace('<svg ', `<svg width="${width}" height="${height}" `);
    // A data: URL, because the site CSP allows data: images but not blob: ones.
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
    const img = new Image();
    img.src = url;
    await img.decode();
    const full = document.createElement('canvas');
    full.width = width;
    full.height = height;
    const fctx = full.getContext('2d');
    fctx.drawImage(img, 0, 0, width, height);
    const data = fctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, x1 - x0 + 1);
    crop.height = Math.max(1, y1 - y0 + 1);
    crop.getContext('2d').drawImage(full, -x0, -y0);
    return crop;
  }

  VM.brandReady = async function () {
    await Promise.all(Object.entries(LOGO_FILES).map(async ([key, file]) => {
      if (LOGOS[key]) return;
      try { LOGOS[key] = await rasterLogo(file); } catch { /* falls back to text */ }
    }));
  };

  /** Draws the official logo, `height` px tall; (x, y) is the top-left corner (or top-centre). Returns its width. */
  function drawLogo(ctx, kind, onBrand, x, y, height, align) {
    const logo = LOGOS[`${kind}-${onBrand ? 'white' : 'indigo'}`];
    if (!logo) {
      font(ctx, 700, height * 1.1, DISPLAY);
      ctx.textBaseline = 'top';
      ctx.fillStyle = onBrand ? C.white : C.indigo;
      const w = ctx.measureText('WAVESTONE').width;
      ctx.fillText('WAVESTONE', align === 'center' ? x - w / 2 : x, y);
      return w;
    }
    const w = logo.width * height / logo.height;
    ctx.drawImage(logo, align === 'center' ? x - w / 2 : x, y, w, height);
    return w;
  }
  VM.drawLogo = drawLogo;

  function brandMark(ctx, project, x, y, height, onBrand) {
    if (!project.brand) return;
    if (/wavestone/i.test(project.brand)) {
      drawLogo(ctx, 'wordmark', onBrand, x, y, height);
      return;
    }
    font(ctx, 700, height * 1.2, DISPLAY);
    ctx.textBaseline = 'top';
    ctx.fillStyle = onBrand ? C.white : C.indigo;
    ctx.fillText(project.brand, x, y);
  }
  VM.brandMark = brandMark;

  function chrome(ctx, timeline, t, active, env) {
    const onBrand = BRAND_SCENES.has(active.scene.type);
    const project = env.project;
    ctx.save();
    brandMark(ctx, project, 80, 66, 28, onBrand);
    if (project.productName) {
      font(ctx, 600, 22, BODY);
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'right';
      ctx.fillStyle = onBrand ? 'rgba(255,255,255,0.72)' : C.ink500;
      ctx.fillText(project.productName.toUpperCase(), W - 80, 86);
    }
    ctx.restore();
    // progress
    ctx.fillStyle = onBrand ? 'rgba(255,255,255,0.14)' : C.ink100;
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = TH.accent;
    ctx.fillRect(0, H - 6, W * clamp(t / timeline.duration, 0, 1), 6);
  }

  function captionChunk(s, t) {
    const chunk = s.captions.find(c => t >= c.start - 0.05 && t <= c.end + 0.35);
    return chunk && t <= s.voEnd + 0.35 ? chunk : null;
  }

  /**
   * Default captions: light text straight on the picture (no box), a soft
   * halo for legibility, upcoming words fainter. `onDark` picks the colours.
   */
  function subtleCaptions(ctx, s, t, onDark) {
    const chunk = captionChunk(s, t);
    if (!chunk) return;
    ctx.save();
    font(ctx, 500, 34, BODY);
    ctx.textBaseline = 'alphabetic';
    const space = ctx.measureText(' ').width;
    const lines = [];
    let line = [];
    let width = 0;
    for (const token of chunk.tokens) {
      const w = ctx.measureText(token.token).width;
      if (line.length && width + space + w > 1380) { lines.push({ line, width }); line = []; width = 0; }
      line.push({ token, x: line.length ? width + space : 0, w });
      width = line.length > 1 ? width + space + w : w;
    }
    if (line.length) lines.push({ line, width });
    const lineH = 46;
    const y0 = H - 58 - (lines.length - 1) * lineH;
    ctx.globalAlpha = Math.min(prog(t, chunk.start - 0.05, 0.15), 1 - prog(t, chunk.end + 0.2, 0.15));
    ctx.lineJoin = 'round';
    lines.forEach((l, li) => {
      const x0 = W / 2 - l.width / 2;
      l.line.forEach(item => {
        const x = x0 + item.x;
        const y = y0 + li * lineH;
        const spoken = t >= item.token.start;
        if (onDark) {
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = spoken ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.5)';
        } else {
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 7;
          ctx.strokeText(item.token.token, x, y);
          ctx.fillStyle = spoken ? 'rgba(22,18,31,0.92)' : 'rgba(22,18,31,0.42)';
        }
        ctx.fillText(item.token.token, x, y);
      });
    });
    ctx.restore();
  }
  VM.subtleCaptions = subtleCaptions;

  function captions(ctx, s, t) {
    const chunk = captionChunk(s, t);
    if (!chunk) return;
    ctx.save();
    font(ctx, 600, 40, BODY);
    ctx.textBaseline = 'top';
    const space = ctx.measureText(' ').width;
    const maxWidth = 1480;
    const lines = [];
    let line = [];
    let width = 0;
    for (const token of chunk.tokens) {
      const w = ctx.measureText(token.token).width;
      if (line.length && width + space + w > maxWidth) { lines.push({ line, width }); line = []; width = 0; }
      line.push({ token, x: line.length ? width + space : 0, w });
      width = line.length > 1 ? width + space + w : w;
    }
    if (line.length) lines.push({ line, width });
    const boxW = Math.max(...lines.map(l => l.width)) + 56;
    const boxH = lines.length * 52 + 28;
    const y0 = H - 60 - boxH;
    const fade = Math.min(prog(t, chunk.start - 0.05, 0.15), 1 - prog(t, chunk.end + 0.2, 0.15));
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(21,9,57,0.80)';
    roundRect(ctx, W / 2 - boxW / 2, y0, boxW, boxH, 14);
    ctx.fill();
    lines.forEach((l, li) => {
      const x0 = W / 2 - l.width / 2;
      l.line.forEach(item => {
        ctx.fillStyle = t >= item.token.start ? C.white : 'rgba(255,255,255,0.5)';
        ctx.fillText(item.token.token, x0 + item.x, y0 + 16 + li * 52);
      });
    });
    ctx.restore();
  }

  // ── scenes ───────────────────────────────────────────────────────────────
  function cueEntrance(s, i) {
    return s.cues[i] !== undefined ? s.cues[i] - 0.1 : s.voStart + 0.4 + i * 0.6;
  }

  function drawHook(ctx, s, t, env) {
    brandBackground(ctx, t, s);
    const c = s.copy;
    const variant = env.scene.variant || 0;
    const image = variant === 2 ? env.images.get(env.scene.image) : null;
    const centered = variant === 1;
    const x = centered ? W / 2 : 160;
    const align = centered ? 'center' : 'left';
    const maxW = image ? 860 : centered ? 1560 : 1480;
    const top = image ? 330 : 300;
    eyebrow(ctx, c.eyebrow, x, top, t, s.start + 0.2, true, align);
    const h = heading(ctx, c.title, x, top + 80, maxW, t, s.start + 0.45, {
      color: C.white, accent: TH.accent, sizes: image ? [96, 86, 76, 66] : [112, 100, 90, 80, 70], weight: 800, maxLines: 3, stagger: 0.07, align,
    });
    if (c.subtitle) {
      const t0 = Math.max(s.start + 1.2, s.voStart + s.voDur * 0.45);
      ctx.save();
      ctx.globalAlpha *= easeOut(prog(t, t0, 0.7));
      textBlock(ctx, c.subtitle, x, top + 80 + h + 40, image ? 820 : 1300, { sizes: [42, 38, 34], weight: 500, color: 'rgba(255,255,255,0.82)', maxLines: 3, align });
      ctx.restore();
    }
    if (image) {
      const p = easeOut(prog(t, s.start + 0.8, 1.2));
      const f = fitFrame(image, 820, 660);
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.translate(1080 + f.w / 2 + (1 - p) * 260, 560);
      ctx.rotate((-3 + (1 - p) * 4) * Math.PI / 180);
      browserFrame(ctx, -f.w / 2, -f.h / 2, f.w, f.h, env.project.productUrl, image);
      ctx.restore();
    }
  }

  function drawProblem(ctx, s, t, env) {
    if (env.scene.variant === 1) return drawProblemList(ctx, s, t, env);
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    heading(ctx, c.title, 140, 232, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
    const items = c.items || [];
    const n = Math.max(1, items.length);
    const gap = 36;
    const cw = (1640 - gap * (n - 1)) / n;
    const y = 450;
    const ch = 380;
    items.forEach((item, i) => {
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 0.6);
      if (p <= 0) return;
      const x = 140 + i * (cw + gap);
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
      ctx.translate(0, (1 - easeOut(p)) * 60);
      shadowCard(ctx, x, y, cw, ch, C.white, 18);
      ctx.strokeStyle = C.ink100;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, cw, ch, 18);
      ctx.stroke();
      ctx.fillStyle = C.ink50;
      ctx.beginPath();
      ctx.arc(x + 70, y + 76, 40, 0, Math.PI * 2);
      ctx.fill();
      VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'alert', x + 70, y + 76, 40, C.ink700, 2);
      const th = textBlock(ctx, item.title, x + 34, y + 146, cw - 68, { sizes: [36, 32, 28], weight: 600, family: DISPLAY, color: C.ink, maxLines: 2 });
      textBlock(ctx, item.text, x + 34, y + 160 + th, cw - 68, { sizes: [26, 24, 22], color: C.ink500, maxLines: 4 });
      ctx.restore();
    });
  }

  /** Slides "compare": before and after, two panels side by side with an arrow between them. */
  function drawCompare(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    heading(ctx, c.title, 140, 232, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
    const items = (c.items || []).slice(0, 2);
    const y = 440;
    const w = 740;
    const h = 440;
    const after = prog(t, cueEntrance(s, 1), 0.6);
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.6);
      if (p <= 0) return;
      const x = i ? 1040 : 140;
      const good = i === 1;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1) * (good ? 1 : 1 - 0.4 * after);
      ctx.translate((1 - easeOut(p)) * (good ? 80 : -80), 0);
      if (good) {
        ctx.save();
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, TH.surface[0]);
        g.addColorStop(1, TH.surface[2]);
        ctx.shadowColor = 'rgba(45,19,128,0.35)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 16;
        ctx.fillStyle = g;
        roundRect(ctx, x, y, w, h, 20);
        ctx.fill();
        ctx.restore();
      } else {
        shadowCard(ctx, x, y, w, h, C.ink50, 20);
      }
      ctx.fillStyle = good ? TH.accent : C.ink200;
      ctx.beginPath();
      ctx.arc(x + 76, y + 80, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = good ? TH.on : C.white;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (good) { ctx.moveTo(x + 58, y + 80); ctx.lineTo(x + 71, y + 94); ctx.lineTo(x + 96, y + 66); } else {
        ctx.moveTo(x + 62, y + 66); ctx.lineTo(x + 90, y + 94); ctx.moveTo(x + 90, y + 66); ctx.lineTo(x + 62, y + 94);
      }
      ctx.stroke();
      const th = textBlock(ctx, item.title, x + 40, y + 150, w - 80, { sizes: [44, 40, 36], weight: 700, family: DISPLAY, color: good ? C.white : C.ink700, maxLines: 2 });
      textBlock(ctx, item.text, x + 40, y + 168 + th, w - 80, { sizes: [30, 28, 26], color: good ? 'rgba(255,255,255,0.86)' : C.ink500, maxLines: 4 });
      ctx.restore();
    });
    if (after > 0) {
      ctx.save();
      ctx.globalAlpha *= after;
      ctx.fillStyle = TH.accent;
      ctx.beginPath();
      ctx.arc(960, y + h / 2, 46, 0, Math.PI * 2);
      ctx.fill();
      font(ctx, 800, 44, DISPLAY);
      ctx.fillStyle = TH.on;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('→', 960, y + h / 2 + 2);
      ctx.restore();
    }
  }

  /** Rounded lozenge (a square on its point) of half-diagonal r, centred on 0,0. */
  function lozengePath(ctx, r) {
    const round = r * 0.28;
    const pts = [[0, -r], [r, 0], [0, r], [-r, 0]];
    ctx.beginPath();
    ctx.moveTo((pts[3][0] + pts[0][0]) / 2, (pts[3][1] + pts[0][1]) / 2);
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, round);
    }
    ctx.closePath();
  }

  /**
   * A flat-shaded 3D lozenge (the product's emblem): an extruded face that
   * turns into place as p goes to 1, then sways gently. label goes on the face.
   * opts: { face, side, edge, ink, time }
   */
  function emblem3d(ctx, cx, cy, size, p, label, opts) {
    if (p <= 0) return;
    const o = opts || {};
    const q = clamp(p, 0, 1);
    const spin = (1 - easeOut(q)) * Math.PI * 0.85 + Math.sin((o.time || 0) * 1.1) * 0.1;
    const sx = Math.max(0.06, Math.abs(Math.cos(spin)));
    const r = size / 2;
    const depth = size * 0.17;
    const dx = Math.sin(spin) * depth * 1.4 + depth * 0.45;
    const dy = depth * 0.95;
    const k = lerp(0.55, 1, easeBack(q));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.globalAlpha *= clamp(q * 2.5, 0, 1);
    // soft floor shadow
    const shadow = ctx.createRadialGradient(dx * 0.6, r + dy * 1.2, 0, dx * 0.6, r + dy * 1.2, r * 1.1);
    shadow.addColorStop(0, 'rgba(0,0,0,0.35)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-r * 1.5, r * 0.6, r * 3.2, r * 1.3);
    // extrusion: the side, in flat steps
    const steps = 18;
    for (let i = steps; i >= 1; i--) {
      ctx.save();
      ctx.translate(dx * i / steps, dy * i / steps);
      ctx.scale(sx, 1);
      lozengePath(ctx, r);
      ctx.fillStyle = i === steps ? (o.edge || '#140A3D') : (o.side || '#2D1380');
      ctx.fill();
      ctx.restore();
    }
    // the face
    ctx.save();
    ctx.scale(sx, 1);
    lozengePath(ctx, r);
    ctx.fillStyle = o.face || '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = size * 0.012;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();
    if (label && sx > 0.35) {
      ctx.globalAlpha *= clamp((sx - 0.35) / 0.4, 0, 1);
      font(ctx, 800, size * 0.24, DISPLAY);
      ctx.letterSpacing = `${-size * 0.008}px`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = o.ink || '#2D1380';
      ctx.fillText(label, 0, size * 0.015);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = TH.accent;
      ctx.beginPath();
      ctx.arc(r * 0.34, -r * 0.34, size * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  /** Two letters for a product mark: "CrisisMaker" gives "CM". */
  function initials(name) {
    const parts = String(name || 'AI').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+|(?=[A-Z][a-z])/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'AI').slice(0, 2)).toUpperCase();
  }

  /** A person's initials: first and last word of their name ("Jean-Marc Dupont" → JD). */
  function personInitials(name) {
    const parts = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }

  /** A round portrait with initials: fill, initials colour and an optional ring. */
  function avatar(ctx, cx, cy, r, name, opts) {
    const o = opts || {};
    ctx.save();
    if (o.shadow) {
      ctx.shadowColor = o.shadow;
      ctx.shadowBlur = r * 0.5;
      ctx.shadowOffsetY = r * 0.16;
    }
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, o.from || C.indigo500);
    g.addColorStop(1, o.to || C.indigo900);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (o.ring) {
      ctx.save();
      ctx.strokeStyle = o.ring;
      ctx.lineWidth = Math.max(3, r * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, r + ctx.lineWidth * 1.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    font(ctx, 700, Math.round(r * 0.72), o.family || DISPLAY);
    ctx.fillStyle = o.ink || C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(personInitials(name), cx, cy + r * 0.04);
    ctx.restore();
  }

  /**
   * Where each phase sits on the time axis (0..1). Numbered periods ("W1-W4", "S5-S12", "M1-M3",
   * "Sem. 3 à 6") give a true scale when every phase has one; otherwise the phases cascade evenly.
   */
  function planSpans(items) {
    const n = Math.max(1, items.length);
    const parsed = items.map(item => {
      const v = String(item.value || '');
      const range = v.match(/(\d+)\s*(?:[-–—>]|à|au|to|bis)\s*[^\d\s]{0,5}\s*(\d+)/i);
      if (range) return [Number(range[1]), Number(range[2])];
      const one = v.match(/^\s*[^\d\s]{0,5}\s*(\d+)\s*$/);
      return one ? [Number(one[1]), Number(one[1])] : null;
    });
    const scaled = parsed.every(p => p && p[1] >= p[0] && p[1] <= 156);
    if (!scaled) return { spans: items.map((_, i) => ({ a: i / n, b: (i + 1) / n })), ticks: [] };
    const first = Math.min(...parsed.map(p => p[0])) - 1;
    const last = Math.max(...parsed.map(p => p[1]));
    const range = Math.max(1, last - first);
    const prefix = (String(items[0].value || '').match(/^\s*([^\d\s]{0,5})\s*\d/) || [])[1] || '';
    const step = range <= 12 ? 1 : range <= 24 ? 2 : range <= 52 ? 4 : 8;
    const ticks = [];
    for (let k = first + 1; k <= last; k += step) ticks.push({ f: (k - 1 - first) / range, label: `${prefix}${k}` });
    return { spans: parsed.map(p => ({ a: (p[0] - 1 - first) / range, b: (p[1] - first) / range })), ticks };
  }

  /**
   * Planning, shared by every style: a Gantt chart whose bars grow on their cue words.
   * g: { x, y, w, h, labelW (0 puts each label above its bar), u }; look: colours and bar style.
   */
  function drawPlanning(ctx, s, t, g, look) {
    const items = (s.copy.items || []).slice(0, 5);
    if (!items.length) return;
    const u = g.u || 1;
    const plan = planSpans(items);
    const stacked = !g.labelW;
    const ax = g.x + (stacked ? 0 : g.labelW + 40 * u);
    const aw = g.x + g.w - ax;
    const n = items.length;
    const rowH = Math.min((stacked ? 190 : 124) * u, g.h / n);
    const barH = Math.min(64 * u, rowH * (stacked ? 0.36 : 0.56));
    let latest = -1;
    items.forEach((_, i) => { if (t >= cueEntrance(s, i)) latest = i; });
    // time scale and guides
    const gp = prog(t, s.start + 0.2, 0.6);
    ctx.save();
    ctx.globalAlpha *= gp;
    ctx.strokeStyle = look.grid;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(ax, g.y + n * rowH);
    ctx.lineTo(ax + aw * easeOut(gp), g.y + n * rowH);
    ctx.stroke();
    font(ctx, 600, 20 * u, BODY);
    ctx.fillStyle = look.tick;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    plan.ticks.forEach(tick => {
      const x = ax + tick.f * aw;
      ctx.globalAlpha = gp * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, g.y - 6 * u);
      ctx.lineTo(x, g.y + n * rowH);
      ctx.stroke();
      ctx.globalAlpha = gp;
      ctx.fillText(tick.label, x + (aw / Math.max(1, plan.ticks.length)) / 2, g.y + n * rowH + 12 * u);
    });
    ctx.restore();
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.7);
      if (p <= 0) return;
      const lit = i === latest;
      const span = plan.spans[i];
      const top = g.y + i * rowH;
      const by = stacked ? top + rowH - barH - 18 * u : top + (rowH - barH) / 2;
      const bx = ax + span.a * aw;
      const full = Math.max(barH, (span.b - span.a) * aw);
      const bw = Math.max(barH * 0.6, full * easeInOut(clamp(p * 1.2, 0, 1)));
      // label: phase name, then what it delivers
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2, 0, 1);
      const lx = g.x;
      const ly = stacked ? top : top + rowH / 2 - (item.text ? 34 * u : 18 * u);
      const lw = stacked ? g.w : g.labelW;
      const th = textBlock(ctx, item.title, lx, ly, lw, { sizes: [34 * u, 30 * u, 27 * u], weight: 700, family: look.display || DISPLAY, color: lit ? look.nameLit || look.name : look.name, maxLines: 1 });
      textBlock(ctx, item.text, lx, ly + th + 4 * u, lw, { sizes: [22 * u, 20 * u], color: look.muted, maxLines: 1 });
      ctx.restore();
      // the bar
      ctx.save();
      ctx.globalAlpha *= clamp(p * 3, 0, 1);
      const r = look.radius === undefined ? barH / 2 : look.radius * u;
      if (look.ink) {
        ctx.fillStyle = look.ink;
        roundRect(ctx, bx + 6 * u, by + 6 * u, bw, barH, r);
        ctx.fill();
      }
      if (lit && look.glow) { ctx.shadowColor = look.glow; ctx.shadowBlur = 30 * u; }
      const colors = lit ? look.barLit : look.bar;
      const grad = ctx.createLinearGradient(bx, by, bx + bw, by + barH);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1]);
      ctx.fillStyle = grad;
      roundRect(ctx, bx, by, bw, barH, r);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (look.ink || look.edge) {
        ctx.strokeStyle = look.ink || look.edge;
        ctx.lineWidth = (look.ink ? 3.5 : 2) * u;
        ctx.stroke();
      }
      // its period, inside the bar when it fits, else after it
      if (item.value && p > 0.5) {
        font(ctx, 700, 22 * u, BODY);
        const vw = ctx.measureText(item.value).width;
        const inside = vw + 36 * u < bw;
        ctx.globalAlpha *= clamp((p - 0.5) * 3, 0, 1);
        const after = bx + bw + 14 * u + barH * 0.4;
        // outside the bar: after it, or before it when it would leave the chart
        const before = !inside && after + vw > g.x + g.w;
        ctx.fillStyle = inside ? (lit ? look.onLit : look.onBar) : look.muted;
        ctx.textAlign = before ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.value, inside ? bx + 18 * u : before ? bx - 14 * u : after, by + barH / 2 + 1);
      }
      // a milestone lozenge closes the phase
      if (p >= 1) {
        const m = prog(t, cueEntrance(s, i) + 0.7, 0.35);
        const mr = barH * 0.42 * easeBack(m);
        if (mr > 0) {
          ctx.save();
          ctx.translate(bx + bw, by + barH / 2);
          ctx.fillStyle = lit ? look.milestoneLit || look.milestone : look.milestone;
          lozengePath(ctx, mr);
          ctx.fill();
          if (look.ink) { ctx.strokeStyle = look.ink; ctx.lineWidth = 3 * u; ctx.stroke(); }
          ctx.restore();
        }
      }
      ctx.restore();
    });
  }

  function drawPlanningSlide(ctx, s, t) {
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 150, t, s.start + 0.15, false);
    const h = heading(ctx, c.title, 140, 212, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 1 });
    if (c.subtitle) {
      ctx.save();
      ctx.globalAlpha *= easeOut(prog(t, s.start + 0.6, 0.5));
      textBlock(ctx, c.subtitle, 140, 232 + (h || 64), 1500, { sizes: [32, 28], color: C.ink500, maxLines: 1 });
      ctx.restore();
    }
    drawPlanning(ctx, s, t, { x: 140, y: 420, w: 1640, h: 520, labelW: 460 }, {
      name: C.ink, nameLit: C.indigo, muted: C.ink500, grid: C.ink200, tick: C.ink500,
      bar: [C.indigo50, C.indigo100], barLit: [TH.surface[0], TH.surface[2]], onBar: C.indigo800, onLit: C.white,
      milestone: C.indigo, milestoneLit: TH.accent,
    });
  }

  /** Team: portraits in a row, each popping in on its cue, name and role below. */
  function drawTeam(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    heading(ctx, c.title, 140, 232, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
    const items = (c.items || []).slice(0, 6);
    const n = Math.max(1, items.length);
    const gap = 40;
    const cw = Math.min(360, (1640 - gap * (n - 1)) / n);
    const x0 = 960 - (n * cw + (n - 1) * gap) / 2;
    const r = Math.min(110, cw * 0.34);
    const cy = 540;
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.6);
      if (p <= 0) return;
      const cx = x0 + i * (cw + gap) + cw / 2;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.6, 0, 1);
      const k = lerp(0.6, 1, easeBack(p));
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      avatar(ctx, cx, cy, r, item.title, {
        from: i ? C.indigo500 : TH.surface[0], to: i ? C.indigo900 : TH.surface[2],
        ring: i ? null : TH.accent, shadow: 'rgba(45,19,128,0.28)',
      });
      ctx.restore();
      const q = prog(t, cueEntrance(s, i) + 0.2, 0.5);
      if (q <= 0) return;
      ctx.save();
      ctx.globalAlpha *= q;
      ctx.translate(0, (1 - easeOut(q)) * 16);
      const th = textBlock(ctx, item.title, cx, cy + r + 44, cw, { sizes: [34, 30, 26, 24], weight: 700, family: DISPLAY, color: C.ink, maxLines: 2, align: 'center' });
      textBlock(ctx, item.text, cx, cy + r + 58 + th, cw, { sizes: [24, 22, 20], color: C.ink500, maxLines: 3, align: 'center' });
      ctx.restore();
    });
  }

  function browserFrame(ctx, x, y, w, h, url, image, onDraw) {
    shadowCard(ctx, x, y, w, h, C.white, 16, true);
    ctx.save();
    roundRect(ctx, x, y, w, h, 16);
    ctx.clip();
    ctx.fillStyle = C.ink50;
    ctx.fillRect(x, y, w, 44);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 28 + i * 22, y + 22, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    if (url) {
      ctx.fillStyle = C.white;
      roundRect(ctx, x + 110, y + 9, Math.min(w - 160, 620), 26, 13);
      ctx.fill();
      font(ctx, 500, 16, BODY);
      ctx.fillStyle = C.ink500;
      ctx.textBaseline = 'middle';
      ctx.fillText(url.replace(/^https?:\/\//, '').slice(0, 60), x + 128, y + 23);
    }
    if (image) ctx.drawImage(image, x, y + 44, w, h - 44);
    else {
      ctx.fillStyle = C.indigo50;
      ctx.fillRect(x, y + 44, w, h - 44);
    }
    if (onDraw) onDraw();
    ctx.restore();
    ctx.strokeStyle = C.ink100;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 16);
    ctx.stroke();
  }

  /** Frame size for an image fitted in a box, keeping its aspect ratio (+44 px bar). */
  function fitFrame(image, maxW, maxH) {
    const iw = image ? image.width : 16;
    const ih = image ? image.height : 10;
    const scale = Math.min(maxW / iw, (maxH - 44) / ih);
    return { w: iw * scale, h: ih * scale + 44 };
  }

  function drawReveal(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    const c = s.copy;
    const image = env.images.get(env.scene.image);
    const withImage = !!image;
    const x = withImage ? 140 : W / 2;
    const align = withImage ? 'left' : 'center';
    const maxW = withImage ? 760 : 1500;
    eyebrow(ctx, c.eyebrow, x, withImage ? 300 : 300, t, s.start + 0.2, false, align);
    const h = heading(ctx, c.title || env.project.productName, x, 370, maxW, t, s.start + 0.4, {
      color: C.indigo, accent: TH.text, sizes: withImage ? [110, 96, 84, 72] : [150, 130, 112, 96], weight: 800, maxLines: 2, align, stagger: 0.09,
    });
    const barP = easeOut(prog(t, s.start + 0.9, 0.8));
    ctx.fillStyle = TH.accent;
    ctx.fillRect(align === 'center' ? x - 110 * barP : x, 390 + h, 220 * barP, 10);
    if (c.subtitle) {
      ctx.save();
      ctx.globalAlpha *= easeOut(prog(t, Math.max(s.start + 1.1, s.voStart + s.voDur * 0.35), 0.7));
      textBlock(ctx, c.subtitle, x, 430 + h, maxW, { sizes: [44, 40, 36, 32], weight: 500, color: C.ink700, maxLines: 3, align });
      ctx.restore();
    }
    if (withImage) {
      const p = easeOut(prog(t, s.start + 0.6, 1.1));
      const f = fitFrame(image, 880, 640);
      const fx = 960 + (1 - p) * 300;
      const fy = 540 - f.h / 2 + 20;
      ctx.save();
      ctx.globalAlpha *= p;
      browserFrame(ctx, fx, fy, f.w, f.h, env.project.productUrl, image);
      ctx.restore();
    }
  }

  function drawScreenshot(ctx, s, t, env) {
    if (env.scene.variant === 1 && env.images.get(env.scene.image)) return drawScreenshotList(ctx, s, t, env);
    ctx.fillStyle = C.ink50;
    ctx.fillRect(0, 0, W, H);
    lightBackground(ctx, t, s);
    const c = s.copy;
    const scene = env.scene;
    const image = env.images.get(scene.image);
    const f = fitFrame(image, 1500, 660);
    const fx = W / 2 - f.w / 2;
    const fy = 250 + (660 - f.h) / 2;
    const imgX = fx;
    const imgY = fy + 44;
    const imgW = f.w;
    const imgH = f.h - 44;
    // camera: push into the focus region, from the first cue (or a third into the voice)
    const focus = scene.focus;
    const zoomStart = s.cues.length ? s.cues[0] - 0.6 : s.voStart + s.voDur * 0.3;
    const z = focus ? easeInOut(prog(t, zoomStart, 1.4)) : 0;
    let S = 1;
    let fcx = fx + f.w / 2;
    let fcy = fy + f.h / 2;
    if (focus) {
      // Never enlarge a picture much beyond its own resolution: it would blur.
      const native = image ? Math.max(1, 1.25 * image.width / imgW) : 1;
      const target = Math.min(2.4, native, 1500 / (focus.w * imgW), 640 / (focus.h * imgH));
      S = lerp(1, Math.max(1, target), z);
      fcx = lerp(fx + f.w / 2, imgX + (focus.x + focus.w / 2) * imgW, z);
      fcy = lerp(fy + f.h / 2, imgY + (focus.y + focus.h / 2) * imgH, z);
    }
    const cx = W / 2;
    const cy = 250 + 330;
    const toScreen = (wx, wy) => ({ x: cx + (wx - fcx) * S, y: cy + (wy - fcy) * S });
    const enter = easeOut(prog(t, s.start + 0.2, 0.9));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 222, W, 700);
    ctx.clip();
    ctx.globalAlpha *= enter;
    ctx.translate(cx, cy + (1 - enter) * 80);
    ctx.scale(S, S);
    ctx.translate(-fcx, -fcy);
    browserFrame(ctx, fx, fy, f.w, f.h, env.project.productUrl, image);
    ctx.restore();

    // callouts in screen space, so their text never scales
    (c.items || []).forEach((item, i) => {
      const point = (scene.points || [])[i];
      if (!point || !item.title) return;
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 0.5);
      if (p <= 0) return;
      const sp = toScreen(imgX + point.x * imgW, imgY + point.y * imgH);
      const visible = sp.x > 20 && sp.x < W - 20 && sp.y > 230 && sp.y < 915;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.6, 0, 1);
      font(ctx, 600, 30, DISPLAY);
      const tw = ctx.measureText(item.title).width;
      font(ctx, 400, 22, BODY);
      const sub = item.text || '';
      const sw = Math.min(460, ctx.measureText(sub).width);
      const cw = Math.min(520, Math.max(tw, sw) + 48);
      const chh = sub ? 112 : 70;
      const right = sp.x < W / 2;
      const px = visible ? sp.x : clamp(sp.x, 60, W - 60);
      const py = visible ? sp.y : clamp(sp.y, 260, 880);
      const bx = clamp(right ? px + 70 : px - 70 - cw, 40, W - 40 - cw);
      const by = clamp(py - chh / 2, 240, 900 - chh);
      if (visible) {
        const pulse = (t - t0) % 1.6 / 1.6;
        ctx.strokeStyle = `rgba(${TH.rgb},${0.8 * (1 - pulse)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 14 + pulse * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = TH.accent;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 11 * easeBack(p), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = TH.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(right ? bx : bx + cw, by + chh / 2);
        ctx.stroke();
      }
      ctx.translate(bx + cw / 2, by + chh / 2);
      ctx.scale(lerp(0.85, 1, easeBack(p)), lerp(0.85, 1, easeBack(p)));
      ctx.translate(-(bx + cw / 2), -(by + chh / 2));
      shadowCard(ctx, bx, by, cw, chh, C.indigo, 14, true);
      ctx.fillStyle = TH.accent;
      ctx.fillRect(bx, by + 14, 6, chh - 28);
      ctx.textBaseline = 'top';
      font(ctx, 600, 30, DISPLAY);
      ctx.fillStyle = C.white;
      ctx.fillText(item.title, bx + 26, by + 16, cw - 44);
      if (sub) {
        font(ctx, 400, 22, BODY);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fillText(sub, bx + 26, by + 62, cw - 44);
      }
      ctx.restore();
    });

    // title band over the frame
    eyebrow(ctx, c.eyebrow, 140, 128, t, s.start + 0.1, false);
    heading(ctx, c.title, 140, 180 - (c.eyebrow ? 0 : 30), 1640, t, s.start + 0.25, { color: C.indigo, accent: TH.text, sizes: [48, 44, 40], maxLines: 1 });
  }

  function drawFeatures(ctx, s, t, env) {
    if (env.scene.variant === 1) return drawFeaturesGrid(ctx, s, t, env);
    if (env.scene.variant === 2 && env.images.get(env.scene.image)) return drawFeaturesSplit(ctx, s, t, env);
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    heading(ctx, c.title, 140, 232, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
    const items = c.items || [];
    const n = Math.max(1, items.length);
    const gap = 32;
    const cw = (1640 - gap * (n - 1)) / n;
    const y = 440;
    const ch = 420;
    let latest = -1;
    items.forEach((_, i) => { if (t >= cueEntrance(s, i)) latest = i; });
    items.forEach((item, i) => {
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 0.55);
      if (p <= 0) return;
      const x = 140 + i * (cw + gap);
      const current = i === latest;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
      const k = lerp(0.9, 1, easeBack(p));
      ctx.translate(x + cw / 2, y + ch / 2);
      ctx.scale(k, k);
      ctx.translate(-(x + cw / 2), -(y + ch / 2));
      shadowCard(ctx, x, y, cw, ch, C.white, 18, current);
      ctx.strokeStyle = current ? C.indigo : C.ink100;
      ctx.lineWidth = current ? 3 : 2;
      roundRect(ctx, x, y, cw, ch, 18);
      ctx.stroke();
      ctx.fillStyle = TH.soft;
      ctx.beginPath();
      ctx.arc(x + 76, y + 82, 46, 0, Math.PI * 2);
      ctx.fill();
      VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 76, y + 82, 46, TH.text, 2.2);
      const th = textBlock(ctx, item.title, x + 36, y + 158, cw - 72, { sizes: [36, 32, 28], weight: 600, family: DISPLAY, color: C.ink, maxLines: 2 });
      textBlock(ctx, item.text, x + 36, y + 172 + th, cw - 72, { sizes: [26, 24, 22], color: C.ink500, maxLines: 4 });
      ctx.restore();
    });
  }

  function drawSteps(ctx, s, t, env) {
    if (env.scene.variant === 1) return drawStepsVertical(ctx, s, t, env);
    lightBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    heading(ctx, c.title, 140, 232, 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
    const items = c.items || [];
    const n = Math.max(1, items.length);
    const x0 = 300;
    const x1 = 1620;
    const cy = 540;
    const r = 74;
    const xs = items.map((_, i) => (n === 1 ? W / 2 : lerp(x0, x1, i / (n - 1))));
    // connectors
    for (let i = 0; i < n - 1; i++) {
      const a = xs[i] + r + 14;
      const b = xs[i + 1] - r - 14;
      ctx.strokeStyle = C.ink200;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(a, cy);
      ctx.lineTo(b, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      const fill = easeInOut(prog(t, cueEntrance(s, i + 1) - 0.5, 0.5));
      if (fill > 0) {
        ctx.strokeStyle = TH.accent;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(a, cy);
        ctx.lineTo(lerp(a, b, fill), cy);
        ctx.stroke();
        if (fill < 1) {
          ctx.fillStyle = TH.accent;
          ctx.beginPath();
          ctx.arc(lerp(a, b, fill), cy, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    let latest = -1;
    items.forEach((_, i) => { if (t >= cueEntrance(s, i)) latest = i; });
    items.forEach((item, i) => {
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 0.55);
      const x = xs[i];
      const done = i < latest;
      const current = i === latest;
      ctx.save();
      ctx.globalAlpha *= p > 0 ? 1 : 0.35;
      ctx.fillStyle = current ? C.indigo : done ? C.white : C.white;
      ctx.strokeStyle = current ? C.indigo : done ? TH.text : C.ink200;
      ctx.lineWidth = 4;
      const k = p > 0 ? lerp(0.8, 1, easeBack(p)) : 0.8;
      ctx.beginPath();
      ctx.arc(x, cy, r * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      VM.drawIcon(ctx, done ? 'check' : ((env.scene.icons || [])[i] || 'spark'), x, cy, 58 * k,
        current ? C.white : done ? TH.text : C.ink400, 2.2);
      font(ctx, 700, 22, BODY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = current ? C.indigo : C.ink400;
      ctx.letterSpacing = '3px';
      ctx.fillText(String(i + 1).padStart(2, '0'), x, cy - r - 44);
      ctx.letterSpacing = '0px';
      ctx.restore();
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= easeOut(p);
      const colW = Math.min(400, (x1 - x0) / Math.max(1, n - 1) - 30);
      const th = textBlock(ctx, item.title, x, cy + r + 36, colW, { sizes: [34, 30, 28], weight: 600, family: DISPLAY, color: current ? C.indigo : C.ink, maxLines: 2, align: 'center' });
      textBlock(ctx, item.text, x, cy + r + 48 + th, colW, { sizes: [24, 22, 20], color: C.ink500, maxLines: 3, align: 'center' });
      ctx.restore();
    });
  }

  function countUp(value, p) {
    const match = String(value).match(/^(.*?)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!match) return value;
    const [, prefix, number, suffix] = match;
    const decimals = (number.split(/[.,]/)[1] || '').length;
    const target = parseFloat(number.replace(',', '.'));
    const current = (target * easeOut(p)).toFixed(decimals);
    return `${prefix}${number.includes(',') ? current.replace('.', ',') : current}${suffix}`;
  }

  function drawStats(ctx, s, t, env) {
    if (env.scene.variant === 1) return drawStatsHero(ctx, s, t);
    brandBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 160, 190, t, s.start + 0.15, true);
    heading(ctx, c.title, 160, 250, 1500, t, s.start + 0.3, { color: C.white, accent: TH.accent, sizes: [60, 54, 48], maxLines: 2 });
    const items = c.items || [];
    const n = Math.max(1, items.length);
    const colW = 1600 / n;
    items.forEach((item, i) => {
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 1.2);
      if (p <= 0) return;
      const x = 160 + i * colW;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 3, 0, 1);
      font(ctx, 800, n === 1 ? 220 : n === 2 ? 180 : 150, DISPLAY);
      ctx.textBaseline = 'alphabetic';
      ctx.letterSpacing = '-4px';
      ctx.fillStyle = TH.accent;
      ctx.fillText(countUp(item.value || item.title, p), x, 660, colW - 40);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, 700, (colW - 80) * easeOut(prog(t, t0 + 0.3, 0.8)), 2);
      textBlock(ctx, item.title, x, 730, colW - 80, { sizes: [34, 30, 26], weight: 500, color: 'rgba(255,255,255,0.88)', maxLines: 3 });
      ctx.restore();
    });
  }

  function drawQuote(ctx, s, t) {
    brandBackground(ctx, t, s);
    const c = s.copy;
    const p = easeOut(prog(t, s.start + 0.2, 0.8));
    ctx.save();
    ctx.globalAlpha *= p;
    font(ctx, 800, 360, DISPLAY);
    ctx.textBaseline = 'top';
    ctx.fillStyle = TH.accent;
    ctx.fillText('“', 120, 110 - (1 - p) * 40);
    ctx.restore();
    const h = heading(ctx, c.title, 200, 360, 1480, t, s.start + 0.5, {
      color: C.white, accent: TH.accent, sizes: [72, 64, 56, 50, 44], weight: 700, maxLines: 5, stagger: 0.035,
    });
    if (c.subtitle) {
      ctx.save();
      ctx.globalAlpha *= easeOut(prog(t, s.voStart + s.voDur * 0.6, 0.7));
      ctx.fillStyle = TH.accent;
      ctx.fillRect(200, 400 + h, 60, 5);
      textBlock(ctx, c.subtitle, 280, 386 + h, 1200, { sizes: [32, 28], weight: 600, color: 'rgba(255,255,255,0.85)', maxLines: 1 });
      ctx.restore();
    }
  }

  function drawCta(ctx, s, t, env) {
    brandBackground(ctx, t, s);
    const c = s.copy;
    const centered = env.scene.variant === 1;
    const x = centered ? W / 2 : 160;
    const align = centered ? 'center' : 'left';
    const top = centered ? 300 : 250;
    eyebrow(ctx, c.eyebrow, x, top, t, s.start + 0.2, true, align);
    const h = heading(ctx, c.title, x, top + 70, centered ? 1600 : 1500, t, s.start + 0.4, {
      color: C.white, accent: TH.accent, sizes: [104, 92, 80, 70], weight: 800, maxLines: 2, stagger: 0.07, align,
    });
    let y = top + 70 + h + 30;
    if (c.subtitle) {
      ctx.save();
      ctx.globalAlpha *= easeOut(prog(t, s.start + 1.0, 0.7));
      y += textBlock(ctx, c.subtitle, x, y, 1300, { sizes: [40, 36, 32], weight: 500, color: 'rgba(255,255,255,0.85)', maxLines: 2, align }) + 40;
      ctx.restore();
    }
    const url = (env.project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (url) {
      const p = prog(t, s.start + 1.4, 0.6);
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
      font(ctx, 600, 40, DISPLAY);
      const w = ctx.measureText(url).width + 80;
      const k = lerp(0.85, 1, easeBack(p));
      ctx.translate(centered ? x - (w * k) / 2 : x, y);
      ctx.scale(k, k);
      ctx.fillStyle = TH.accent;
      roundRect(ctx, 0, 0, w, 84, 42);
      ctx.fill();
      ctx.fillStyle = TH.on;
      ctx.textBaseline = 'middle';
      ctx.fillText(url, 40, 44);
      ctx.restore();
    }
    // closing fade to the brand surface, with the wordmark
    const out = prog(t, s.end - 0.7, 0.7);
    if (out > 0) {
      ctx.save();
      ctx.globalAlpha = out;
      ctx.fillStyle = TH.surface[2];
      ctx.fillRect(0, 0, W, H);
      if (env.project.brand && /wavestone/i.test(env.project.brand)) drawLogo(ctx, 'lockup', true, W / 2, H / 2 - 150, 300, 'center');
      ctx.restore();
    }
  }

  // ── layout variants ──────────────────────────────────────────────────────
  function titleBlock(ctx, s, t, maxW) {
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.15, false);
    return heading(ctx, c.title, 140, 232, maxW || 1500, t, s.start + 0.3, { color: C.indigo, accent: TH.text, sizes: [64, 56, 50], maxLines: 2 });
  }

  function latestCue(s, t, count) {
    let latest = -1;
    for (let i = 0; i < count; i++) if (t >= cueEntrance(s, i)) latest = i;
    return latest;
  }

  function sideImage(ctx, s, t, env, x, maxW, maxH, cy) {
    const image = env.images.get(env.scene.image);
    if (!image) return false;
    const p = easeOut(prog(t, s.start + 0.5, 1.0));
    const f = fitFrame(image, maxW, maxH);
    ctx.save();
    ctx.globalAlpha *= p;
    browserFrame(ctx, x + (maxW - f.w) / 2 + (1 - p) * 200, cy - f.h / 2, f.w, f.h, env.project.productUrl, image);
    ctx.restore();
    return true;
  }

  /** Rows of icon + title + text; used by the problem list and split features. */
  function rows(ctx, s, t, env, x, y, width, height, opts) {
    const items = s.copy.items || [];
    const n = Math.max(1, items.length);
    const rowH = height / n;
    const latest = latestCue(s, t, items.length);
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.55);
      if (p <= 0) return;
      const ry = y + i * rowH;
      const current = i === latest;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1) * (current || latest < 0 ? 1 : 0.62);
      ctx.translate((1 - easeOut(p)) * -60, 0);
      if (opts.numbered) {
        font(ctx, 800, 64, DISPLAY);
        ctx.textBaseline = 'top';
        ctx.fillStyle = current ? TH.text : C.ink200;
        ctx.fillText(String(i + 1).padStart(2, '0'), x, ry);
      } else {
        ctx.fillStyle = current ? C.indigo : TH.soft;
        ctx.beginPath();
        ctx.arc(x + 38, ry + 38, 38, 0, Math.PI * 2);
        ctx.fill();
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 38, ry + 38, 38, current ? C.white : TH.text, 2.2);
      }
      const tx = x + (opts.numbered ? 120 : 104);
      const th = textBlock(ctx, item.title, tx, ry + 2, width - (tx - x), { sizes: [38, 34, 30], weight: 600, family: DISPLAY, color: current ? C.indigo : C.ink, maxLines: 1 });
      textBlock(ctx, item.text, tx, ry + 12 + th, width - (tx - x), { sizes: [26, 24, 22], color: C.ink500, maxLines: 2 });
      ctx.restore();
    });
  }

  function drawProblemList(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    titleBlock(ctx, s, t);
    ctx.fillStyle = C.ink100;
    ctx.fillRect(140, 410, 1640, 2);
    rows(ctx, s, t, env, 160, 450, 1560, 440, { numbered: true });
  }

  function drawFeaturesGrid(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    titleBlock(ctx, s, t);
    const items = s.copy.items || [];
    const latest = latestCue(s, t, items.length);
    const cols = 2;
    const cw = 804;
    const ch = 210;
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.55);
      if (p <= 0) return;
      const x = 140 + (i % cols) * (cw + 32);
      const y = 430 + Math.floor(i / cols) * (ch + 30);
      const current = i === latest;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
      ctx.translate(0, (1 - easeOut(p)) * 50);
      shadowCard(ctx, x, y, cw, ch, current ? C.indigo : C.white, 18, current);
      if (!current) {
        ctx.strokeStyle = C.ink100;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, cw, ch, 18);
        ctx.stroke();
      }
      ctx.fillStyle = current ? 'rgba(255,255,255,0.12)' : TH.soft;
      ctx.beginPath();
      ctx.arc(x + 80, y + ch / 2, 46, 0, Math.PI * 2);
      ctx.fill();
      VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 80, y + ch / 2, 46, current ? TH.accent : TH.text, 2.2);
      const th = textBlock(ctx, item.title, x + 160, y + 36, cw - 200, { sizes: [36, 32, 28], weight: 600, family: DISPLAY, color: current ? C.white : C.ink, maxLines: 1 });
      textBlock(ctx, item.text, x + 160, y + 48 + th, cw - 200, { sizes: [25, 23, 21], color: current ? 'rgba(255,255,255,0.8)' : C.ink500, maxLines: 3 });
      ctx.restore();
    });
  }

  function drawFeaturesSplit(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    titleBlock(ctx, s, t, 820);
    rows(ctx, s, t, env, 140, 440, 800, 440, { numbered: false });
    sideImage(ctx, s, t, env, 1000, 800, 620, 600);
  }

  function drawStepsVertical(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    const hasImage = !!env.images.get(env.scene.image);
    titleBlock(ctx, s, t, hasImage ? 820 : 1500);
    const items = s.copy.items || [];
    const n = Math.max(1, items.length);
    const y0 = 450;
    const span = 420;
    const x = 180;
    const ys = items.map((_, i) => y0 + (n === 1 ? 0 : (span * i) / (n - 1)));
    const latest = latestCue(s, t, items.length);
    ctx.strokeStyle = C.ink200;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + span);
    ctx.stroke();
    if (latest > 0) {
      const fill = latest >= n - 1 ? 1 : (latest + easeInOut(prog(t, cueEntrance(s, latest + 1) - 0.5, 0.5))) / (n - 1);
      ctx.strokeStyle = TH.accent;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + span * clamp(fill, 0, 1));
      ctx.stroke();
    }
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.5);
      const current = i === latest;
      const done = i < latest;
      ctx.save();
      ctx.fillStyle = current ? C.indigo : C.white;
      ctx.strokeStyle = current ? C.indigo : done ? TH.text : C.ink200;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, ys[i], 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      VM.drawIcon(ctx, done ? 'check' : ((env.scene.icons || [])[i] || 'spark'), x, ys[i], 30, current ? C.white : done ? TH.text : C.ink400, 2.4);
      ctx.restore();
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= easeOut(p);
      ctx.translate((1 - easeOut(p)) * 40, 0);
      const width = hasImage ? 700 : 1400;
      const th = textBlock(ctx, item.title, x + 70, ys[i] - 30, width, { sizes: [34, 30, 28], weight: 600, family: DISPLAY, color: current ? C.indigo : C.ink, maxLines: 1 });
      textBlock(ctx, item.text, x + 70, ys[i] - 22 + th, width, { sizes: [24, 22], color: C.ink500, maxLines: 2 });
      ctx.restore();
    });
    if (hasImage) sideImage(ctx, s, t, env, 1020, 780, 600, 610);
  }

  function drawStatsHero(ctx, s, t) {
    brandBackground(ctx, t, s);
    const c = s.copy;
    eyebrow(ctx, c.eyebrow, 160, 190, t, s.start + 0.15, true);
    heading(ctx, c.title, 160, 250, 1500, t, s.start + 0.3, { color: C.white, accent: TH.accent, sizes: [60, 54, 48], maxLines: 2 });
    const items = c.items || [];
    items.forEach((item, i) => {
      const t0 = cueEntrance(s, i);
      const p = prog(t, t0, 1.2);
      if (p <= 0) return;
      const hero = i === 0;
      const x = hero ? 160 : 1180;
      const y = hero ? 740 : 470 + (i - 1) * 230;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 3, 0, 1);
      font(ctx, 800, hero ? 250 : 120, DISPLAY);
      ctx.textBaseline = 'alphabetic';
      ctx.letterSpacing = hero ? '-8px' : '-3px';
      ctx.fillStyle = TH.accent;
      ctx.fillText(countUp(item.value || item.title, p), x, y, hero ? 900 : 620);
      ctx.letterSpacing = '0px';
      textBlock(ctx, item.title, x, y + 24, hero ? 900 : 600, { sizes: hero ? [38, 34] : [28, 26, 24], weight: 500, color: 'rgba(255,255,255,0.88)', maxLines: 2 });
      ctx.restore();
    });
    if (items.length > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(1120, 420, 2, 480 * easeOut(prog(t, cueEntrance(s, 1), 0.8)));
    }
  }

  /** Picture on the right, callouts as a numbered list on the left with numbered markers. */
  function drawScreenshotList(ctx, s, t, env) {
    lightBackground(ctx, t, s);
    const c = s.copy;
    const scene = env.scene;
    const image = env.images.get(scene.image);
    eyebrow(ctx, c.eyebrow, 140, 170, t, s.start + 0.1, false);
    heading(ctx, c.title, 140, 232, 580, t, s.start + 0.25, { color: C.indigo, accent: TH.text, sizes: [56, 50, 44, 40], maxLines: 3 });
    const f = fitFrame(image, 1080, 700);
    const fx = 1800 - f.w;
    const fy = 560 - f.h / 2;
    const enter = easeOut(prog(t, s.start + 0.3, 0.9));
    const items = c.items || [];
    const latest = latestCue(s, t, items.length);
    const focus = scene.focus;
    const spot = focus ? easeInOut(prog(t, s.cues.length ? s.cues[0] - 0.4 : s.voStart + s.voDur * 0.3, 0.9)) : 0;
    ctx.save();
    ctx.globalAlpha *= enter;
    ctx.translate((1 - enter) * 200, 0);
    browserFrame(ctx, fx, fy, f.w, f.h, env.project.productUrl, image, () => {
      if (!focus || spot <= 0) return;
      const ix = fx;
      const iy = fy + 44;
      const iw = f.w;
      const ih = f.h - 44;
      ctx.fillStyle = `rgba(21,9,57,${0.5 * spot})`;
      const shade = new Path2D();
      shade.rect(ix, iy, iw, ih);
      shade.rect(ix + focus.x * iw, iy + focus.y * ih, focus.w * iw, focus.h * ih);
      ctx.fill(shade, 'evenodd');
      ctx.strokeStyle = TH.accent;
      ctx.lineWidth = 4;
      roundRect(ctx, ix + focus.x * iw, iy + focus.y * ih, focus.w * iw, focus.h * ih, 12);
      ctx.globalAlpha *= spot;
      ctx.stroke();
    });
    items.forEach((item, i) => {
      const point = (scene.points || [])[i];
      const p = prog(t, cueEntrance(s, i), 0.5);
      if (!point || p <= 0) return;
      const px = fx + point.x * f.w;
      const py = fy + 44 + point.y * (f.h - 44);
      const k = easeBack(p);
      ctx.fillStyle = i === latest ? TH.accent : C.indigo;
      ctx.beginPath();
      ctx.arc(px, py, 26 * k, 0, Math.PI * 2);
      ctx.fill();
      font(ctx, 700, 26, DISPLAY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = i === latest ? TH.on : C.white;
      ctx.fillText(String(i + 1), px, py + 1);
      ctx.textAlign = 'left';
    });
    ctx.restore();
    items.forEach((item, i) => {
      const p = prog(t, cueEntrance(s, i), 0.5);
      if (p <= 0) return;
      const y = 520 + i * 130;
      const current = i === latest;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1) * (current ? 1 : 0.6);
      ctx.fillStyle = current ? TH.accent : C.indigo;
      ctx.beginPath();
      ctx.arc(166, y + 22, 26, 0, Math.PI * 2);
      ctx.fill();
      font(ctx, 700, 26, DISPLAY);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = current ? TH.on : C.white;
      ctx.fillText(String(i + 1), 166, y + 23);
      ctx.textAlign = 'left';
      const th = textBlock(ctx, item.title, 214, y, 460, { sizes: [32, 28, 26], weight: 600, family: DISPLAY, color: current ? C.indigo : C.ink, maxLines: 1 });
      textBlock(ctx, item.text, 214, y + 8 + th, 460, { sizes: [22, 20], color: C.ink500, maxLines: 2 });
      ctx.restore();
    });
  }

  const DRAW = {
    hook: drawHook, problem: drawProblem, reveal: drawReveal, screenshot: drawScreenshot, features: drawFeatures,
    steps: drawSteps, stats: drawStats, quote: drawQuote, cta: drawCta, compare: drawCompare, team: drawTeam,
    planning: drawPlanningSlide,
  };

  /**
   * env: { project, images: Map<assetId, ImageBitmap|HTMLImageElement>, captions: boolean }
   */
  VM.renderFrame = function (ctx, timeline, t, env) {
    useTheme(env.project && env.project.theme);
    if (VM.syncClips) VM.syncClips(timeline, t);
    if (env.project && env.project.style === 'product' && VM.renderProductFrame) {
      VM.renderProductFrame(ctx, timeline, t, env);
      return;
    }
    if (env.project && env.project.style === 'showcase' && VM.renderShowcaseFrame) {
      VM.renderShowcaseFrame(ctx, timeline, t, env);
      return;
    }
    if (env.project && env.project.style === 'launch' && VM.renderLaunchFrame) {
      VM.renderLaunchFrame(ctx, timeline, t, env);
      return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.indigo800;
    ctx.fillRect(0, 0, W, H);
    const scenes = timeline.scenes;
    if (!scenes.length) { ctx.restore(); return; }
    const time = clamp(t, 0, timeline.duration - 0.001);
    const trans = timeline.trans || TRANS;
    const active = scenes.filter(s => time >= s.start && time < s.end);
    if (!active.length) active.push(scenes[scenes.length - 1]);
    active.forEach((s, i) => {
      const draw = VM.pickScene(DRAW, s.scene.type);
      ctx.save();
      if (i > 0 || (active.length === 1 && s.index > 0 && time < s.start + trans)) {
        const p = easeInOut(prog(time, s.start, trans));
        ctx.globalAlpha = p;
        ctx.translate((1 - p) * 90, 0);
      }
      draw(ctx, s, time, Object.assign({ scene: s.scene }, env));
      ctx.restore();
    });
    const last = active[active.length - 1];
    const current = active.length > 1 && prog(time, last.start, trans) < 0.5 ? active[0] : last;
    chrome(ctx, timeline, time, current, env);
    if (env.captions) {
      const speaking = active.find(s => time >= s.voStart && time <= s.voEnd + 0.4) || current;
      if (env.captionStyle === 'bold') captions(ctx, speaking, time);
      else subtleCaptions(ctx, speaking, time, BRAND_SCENES.has(speaking.scene.type));
    }
    ctx.restore();
  };

  // Shared drawing kit for the other visual styles (engine-product.js, engine-launch.js, engine-showcase.js).
  VM.kit = {
    W, H, C, DISPLAY, BODY, clamp, lerp, easeOut, easeInOut, easeBack, prog, font, richWords, layoutRich, fitRich,
    drawLines, textBlock, roundRect, fitFrame, countUp, cueEntrance, theme: () => TH, surfaceName: () => SURFACE_NAME,
    drawLogo, brandMark, emblem3d, lozengePath, initials, personInitials, avatar, drawPlanning, planSpans,
  };

  VM.fontsReady = async function () {
    await VM.brandReady();
    if (!document.fonts) return;
    await Promise.all([
      document.fonts.load(`800 40px Poppins`), document.fonts.load(`700 40px Poppins`), document.fonts.load(`600 40px Poppins`),
      document.fonts.load(`400 40px Inter`), document.fonts.load(`500 40px Inter`), document.fonts.load(`600 40px Inter`),
    ]).catch(() => undefined);
  };
})();
