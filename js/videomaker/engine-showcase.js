// Video Maker "Showcase" style: an Apple-style app film, vertical 9:16 by
// default. A deep indigo background with drifting colour blooms, huge
// condensed capitals (a small green eyebrow names the moment), a phone or a
// browser rising in and then zooming through to the interface, taps, counters,
// and fast whip cuts with motion blur. Wavestone colours throughout. It draws
// at any frame size (1080×1920 or 1920×1080) and renders the same project as
// the other styles.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});
  const K = VM.kit;
  const { DISPLAY, BODY, clamp, lerp, easeOut, easeInOut, easeBack, prog, font } = K;
  const BASE = '#0A0622';
  const MUTED = 'rgba(214,208,245,0.72)';
  const CARD = 'rgba(255,255,255,0.07)';
  const CARD_EDGE = 'rgba(255,255,255,0.14)';
  const CORAL = '#FF7A66';
  const END_CARD = 1.3;

  const green = () => K.theme().accent;
  const greenRgb = () => K.theme().rgb || '4,240,106';

  /** Frame geometry: every size is expressed in units of a 1080 px short side. */
  function geometry(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const portrait = h > w;
    const u = Math.min(w, h) / 1080;
    return { w, h, u, portrait, pad: (portrait ? 64 : 120) * u };
  }

  // ── text ─────────────────────────────────────────────────────────────────
  // Letters keep their true proportions (a squeezed face looked stretched vertically).
  const SQUEEZE = 1;

  /** Words of a title in capitals, with *accent* marks kept (for the green words). */
  function words(text) {
    const out = [];
    K.richWords(text).forEach(w => {
      if (w.br) { out.push({ br: true }); return; }
      const word = w.word.toLocaleUpperCase();
      // punctuation after an accent mark ("*team*.") stays glued to its word
      if (out.length && /^[.,!?;:…]+$/.test(word)) out[out.length - 1].word += word;
      else out.push({ word, accent: w.accent });
    });
    return out;
  }

  /** Condensed capitals: lines fitted to maxW, each word keeps its accent colour. */
  function layoutCaps(ctx, text, maxW, maxLines, sizes) {
    const list = words(text);
    for (const size of sizes) {
      font(ctx, 800, size, DISPLAY);
      ctx.letterSpacing = `${-size * 0.02}px`;
      const space = ctx.measureText(' ').width * SQUEEZE;
      const lines = [];
      let line = [];
      let width = 0;
      for (const item of list) {
        if (item.br) {
          // a second line break in a row leaves an empty line
          lines.push({ words: line, width });
          line = [];
          width = 0;
          continue;
        }
        const ww = ctx.measureText(item.word).width * SQUEEZE;
        if (line.length && width + space + ww > maxW) { lines.push({ words: line, width }); line = []; width = 0; }
        line.push(Object.assign({ x: line.length ? width + space : 0, w: ww }, item));
        width = line.length > 1 ? width + space + ww : ww;
      }
      if (line.length) lines.push({ words: line, width });
      ctx.letterSpacing = '0px';
      if ((lines.length <= maxLines && lines.every(l => l.width <= maxW)) || size === sizes[sizes.length - 1]) {
        return { size, lines: lines.slice(0, maxLines) };
      }
    }
    return { size: sizes[0], lines: [] };
  }

  /**
   * Draws condensed capitals centred on cx from the top y; lines slide up in turn.
   * `second` colours every line after the first in green when no word carries an accent.
   */
  function caps(ctx, text, cx, y, maxW, t, t0, opts) {
    const o = opts || {};
    if (!text) return 0;
    const fit = layoutCaps(ctx, text, maxW, o.maxLines || 3, o.sizes);
    const lh = fit.size * 0.98;
    const anyAccent = fit.lines.some(l => l.words.some(w => w.accent));
    ctx.save();
    font(ctx, 800, fit.size, DISPLAY);
    ctx.letterSpacing = `${-fit.size * 0.02}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    fit.lines.forEach((line, li) => {
      const p = prog(t, t0 + li * (o.stagger || 0.12), 0.45);
      if (p <= 0) return;
      const e = o.pop ? easeBack(p) : easeOut(p);
      const baseY = y + fit.size * 0.86 + li * lh;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2, 0, 1);
      ctx.translate(cx, baseY + (1 - e) * fit.size * 0.45);
      const k = o.pop ? lerp(1.25, 1, e) : 1;
      ctx.scale(k * SQUEEZE, k);
      const x0 = -line.width / 2 / SQUEEZE;
      line.words.forEach(word => {
        const accent = word.accent || (!anyAccent && o.second && li > 0);
        ctx.fillStyle = accent ? green() : '#FFFFFF';
        ctx.shadowColor = accent ? `rgba(${greenRgb()},0.45)` : 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = fit.size * 0.18;
        ctx.fillText(word.word, x0 + word.x / SQUEEZE, 0);
      });
      ctx.restore();
    });
    ctx.restore();
    return fit.lines.length * lh;
  }

  function eyebrow(ctx, text, cx, y, u, t, t0) {
    if (!text) return;
    const p = prog(t, t0, 0.35);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    font(ctx, 700, 26 * u, BODY);
    ctx.letterSpacing = `${7 * u}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = green();
    ctx.fillText(String(text).toLocaleUpperCase(), cx + 3.5 * u, y);
    ctx.restore();
  }

  /** Eyebrow + title at the top of the frame; returns the y where the content can start. */
  function header(ctx, s, t, G, opts) {
    const o = opts || {};
    const c = s.copy;
    const top = (G.portrait ? 150 : 80) * G.u;
    eyebrow(ctx, c.eyebrow, G.w / 2, top, G.u, t, s.start + 0.05);
    const h = caps(ctx, c.title, G.w / 2, top + 30 * G.u, G.w - 2 * G.pad, t, s.start + 0.1, {
      sizes: (G.portrait ? [150, 132, 116, 100, 88] : [130, 112, 96, 84]).map(v => v * G.u), maxLines: o.maxLines || 2,
    });
    return top + 30 * G.u + h + (G.portrait ? 60 : 40) * G.u;
  }

  // ── pieces ───────────────────────────────────────────────────────────────
  function initials(name) {
    const parts = String(name || 'AI').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+|(?=[A-Z][a-z])/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'AI').slice(0, 2)).toUpperCase();
  }

  function appIcon(ctx, name, cx, cy, size) {
    ctx.save();
    ctx.shadowColor = 'rgba(90,43,224,0.8)';
    ctx.shadowBlur = size * 0.4;
    const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
    g.addColorStop(0, '#6B3DF0');
    g.addColorStop(1, '#2D1380');
    ctx.fillStyle = g;
    K.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = size * 0.012;
    ctx.stroke();
    font(ctx, 800, size * 0.42, DISPLAY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(initials(name), cx, cy + size * 0.03);
    ctx.fillStyle = green();
    ctx.beginPath();
    ctx.arc(cx + size * 0.3, cy - size * 0.3, size * 0.065, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tap(ctx, x, y, u, p) {
    if (p <= 0 || p >= 1) return;
    ctx.save();
    ctx.globalAlpha *= 1 - p;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.arc(x, y, (24 + 60 * easeOut(p)) * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = clamp((0.6 - p) * 2, 0, 1) * 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, 30 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pill(ctx, text, x, y, u, p, align) {
    if (p <= 0 || !text) return;
    ctx.save();
    font(ctx, 600, 30 * u, BODY);
    const tw = ctx.measureText(text).width;
    const pw = tw + 86 * u;
    const ph = 64 * u;
    const x0 = align === 'right' ? x - pw : align === 'left' ? x : x - pw / 2;
    const k = lerp(0.8, 1, easeBack(p));
    ctx.globalAlpha *= clamp(p * 2, 0, 1);
    ctx.translate(x0 + pw / 2, y);
    ctx.scale(k, k);
    ctx.translate(-(x0 + pw / 2), -y);
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30 * u;
    ctx.fillStyle = 'rgba(12,7,36,0.9)';
    K.roundRect(ctx, x0, y - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${greenRgb()},0.55)`;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.fillStyle = green();
    ctx.beginPath();
    ctx.arc(x0 + 34 * u, y, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + 56 * u, y + 1 * u);
    ctx.restore();
  }

  /** Where a picture sits: a phone for tall pictures, a browser window otherwise. */
  function frameFor(image, cx, cy, maxW, maxH, u) {
    const iw = image ? image.width : 16;
    const ih = image ? image.height : 10;
    const phone = ih > iw * 1.15;
    const bar = phone ? 0 : 52 * u;
    const bezel = phone ? 16 * u : 0;
    const scale = Math.min((maxW - 2 * bezel) / iw, (maxH - 2 * bezel - bar) / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const fw = sw + 2 * bezel;
    const fh = sh + 2 * bezel + bar;
    return { phone, bar, bezel, x: cx - fw / 2, y: cy - fh / 2, fw, fh, sx: cx - sw / 2, sy: cy - fh / 2 + bezel + bar, sw, sh };
  }

  /** Draws the device (frame alpha fades as zoom goes to 1) and the screen at `screen` (a rect). */
  function device(ctx, image, f, screen, zoom, url, u) {
    const frameAlpha = 1 - clamp(zoom * 1.6, 0, 1);
    const r = f.phone ? 58 * u : 20 * u;
    if (frameAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= frameAlpha;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 80 * u;
      ctx.shadowOffsetY = 30 * u;
      ctx.fillStyle = f.phone ? '#15112A' : '#F5F4F9';
      K.roundRect(ctx, f.x, f.y, f.fw, f.fh, r);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    const sr = lerp(f.phone ? 44 * u : 0, 0, zoom);
    if (!f.phone && frameAlpha > 0) {
      // browser top bar
      ctx.save();
      ctx.globalAlpha *= frameAlpha;
      ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(f.x + 30 * u + i * 24 * u, f.y + f.bar / 2, 8 * u, 0, Math.PI * 2);
        ctx.fill();
      });
      if (url) {
        font(ctx, 500, 20 * u, BODY);
        ctx.fillStyle = '#514C63';
        ctx.textBaseline = 'middle';
        ctx.fillText(url.replace(/^https?:\/\//, '').slice(0, 48), f.x + 120 * u, f.y + f.bar / 2 + 1 * u);
      }
      ctx.restore();
    }
    K.roundRect(ctx, screen.x, screen.y, screen.w, screen.h, sr);
    ctx.clip();
    if (image) ctx.drawImage(image, screen.x, screen.y, screen.w, screen.h);
    else {
      ctx.fillStyle = '#1B1440';
      ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
    }
    ctx.restore();
    if (f.phone && frameAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= frameAlpha;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3 * u;
      K.roundRect(ctx, f.x + 1.5 * u, f.y + 1.5 * u, f.fw - 3 * u, f.fh - 3 * u, r);
      ctx.stroke();
      ctx.fillStyle = '#05030F';
      K.roundRect(ctx, f.x + f.fw / 2 - 64 * u, f.y + f.bezel + 14 * u, 128 * u, 36 * u, 18 * u);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * A picture in its device, rising in, then zooming through to the interface.
   * zoomAt: when the zoom starts; points/focus in picture fractions. Returns a
   * mapper from picture fractions to frame pixels.
   */
  function showPicture(ctx, s, t, G, image, opts) {
    const o = opts || {};
    const top = o.top;
    const areaH = G.h - top - (G.portrait ? 90 : 60) * G.u;
    const cx = G.w / 2;
    const cy = top + areaH / 2;
    const f = frameFor(image, cx, cy, o.maxW || (G.portrait ? G.w - 2 * G.pad : G.w * 0.62), areaH, G.u);
    const rise = easeBack(prog(t, s.start + (o.delay || 0.1), 0.7));
    const dy = (1 - rise) * G.h * 0.55;
    let zoom = o.zoomAt === undefined ? 0 : easeInOut(prog(t, o.zoomAt, 0.8));
    if (o.zoomOutAt !== undefined) zoom *= 1 - easeInOut(prog(t, o.zoomOutAt, 0.7));
    // the zoomed view: the focus region fills the frame width below the title
    const focus = o.focus || { x: 0, y: 0, w: 1, h: 1 };
    let fcx = focus.x + focus.w / 2;
    let fcy = focus.y + focus.h / 2;
    (o.pan || []).forEach(step => {
      const m = easeInOut(prog(t, step.at, 0.6));
      fcx = lerp(fcx, step.x, m);
      fcy = lerp(fcy, step.y, m);
    });
    const zw = Math.max(f.sw, G.w / Math.max(0.35, focus.w) * (G.portrait ? 1.02 : 0.55));
    const zh = zw * f.sh / f.sw;
    const zx = G.w / 2 - fcx * zw;
    const zy = top + areaH * 0.5 - fcy * zh;
    const screen = {
      x: lerp(f.sx, zx, zoom), y: lerp(f.sy + dy, zy, zoom), w: lerp(f.sw, zw, zoom), h: lerp(f.sh, zh, zoom),
    };
    const shifted = Object.assign({}, f, { y: f.y + dy, sy: f.sy + dy });
    ctx.save();
    ctx.globalAlpha *= clamp(rise * 1.5, 0, 1);
    if (zoom > 0) {
      // the zoomed interface stays below the title
      ctx.beginPath();
      ctx.rect(0, top - 24 * G.u, G.w, G.h);
      ctx.clip();
    }
    device(ctx, image, shifted, screen, zoom, o.url, G.u);
    ctx.restore();
    return {
      zoom,
      map: (px, py) => ({ x: screen.x + px * screen.w, y: screen.y + py * screen.h }),
    };
  }

  // ── scenes ───────────────────────────────────────────────────────────────
  function latestCue(s, t) {
    let latest = -1;
    (s.copy.items || []).forEach((_, i) => { if (t >= K.cueEntrance(s, i)) latest = i; });
    return latest;
  }

  const SCENES = {
    hook(ctx, s, t, env, G) {
      const c = s.copy;
      const image = env.scene.variant === 2 ? env.images.get(env.scene.image) : null;
      const y = image ? (G.portrait ? 170 : 90) * G.u : G.h * (G.portrait ? 0.3 : 0.24);
      eyebrow(ctx, c.eyebrow, G.w / 2, y - 40 * G.u, G.u, t, s.start + 0.05);
      const h = caps(ctx, c.title, G.w / 2, y, G.w - 2 * G.pad, t, s.start + 0.15, {
        sizes: (G.portrait ? [190, 170, 150, 130, 112] : [170, 150, 130, 112]).map(v => v * G.u),
        maxLines: 3, stagger: 0.32, pop: true, second: true,
      });
      if (image) {
        showPicture(ctx, s, t, G, image, { top: y + h + 50 * G.u, delay: 0.9, url: env.project.productUrl });
        return;
      }
      const p = prog(t, s.start + 1.0, 0.5);
      if (p <= 0) return;
      const iy = y + h + (G.portrait ? 190 : 150) * G.u;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2, 0, 1);
      ctx.translate(G.w / 2, iy);
      const k = lerp(0.4, 1, easeBack(p));
      ctx.scale(k, k);
      appIcon(ctx, env.project.productName, 0, 0, 170 * G.u);
      ctx.restore();
      caps(ctx, env.project.productName, G.w / 2, iy + 120 * G.u, G.w - 2 * G.pad, t, s.start + 1.25, { sizes: [92 * G.u, 76 * G.u], maxLines: 1 });
    },

    problem(ctx, s, t, env, G) {
      const top = header(ctx, s, t, G);
      const items = s.copy.items || [];
      const cw = G.portrait ? G.w - 2 * G.pad : G.w * 0.5;
      const ch = 170 * G.u;
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const x = G.w / 2 - cw / 2;
        const y = top + i * (ch + 26 * G.u) + (1 - easeBack(p)) * -80 * G.u;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.strokeStyle = CARD_EDGE;
        ctx.lineWidth = 2 * G.u;
        K.roundRect(ctx, x, y, cw, ch, 40 * G.u);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,122,102,0.18)';
        ctx.beginPath();
        ctx.arc(x + 85 * G.u, y + ch / 2, 46 * G.u, 0, Math.PI * 2);
        ctx.fill();
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'alert', x + 85 * G.u, y + ch / 2, 44 * G.u, CORAL, 2.4);
        const th = K.textBlock(ctx, item.title, x + 160 * G.u, y + (item.text ? 38 : 58) * G.u, cw - 200 * G.u, {
          sizes: [40 * G.u, 36 * G.u, 32 * G.u], weight: 700, family: DISPLAY, color: '#FFFFFF', maxLines: item.text ? 1 : 2,
        });
        if (item.text) K.textBlock(ctx, item.text, x + 160 * G.u, y + 46 * G.u + th, cw - 200 * G.u, { sizes: [28 * G.u, 26 * G.u], color: MUTED, maxLines: 1 });
        ctx.restore();
      });
    },

    reveal(ctx, s, t, env, G) {
      const c = s.copy;
      const image = env.images.get(env.scene.image);
      const name = (c.title || env.project.productName || '').replace(/\*/g, '');
      const iy = image ? (G.portrait ? 230 : 150) * G.u : G.h * 0.38;
      const p = prog(t, s.start + 0.1, 0.55);
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2, 0, 1);
      ctx.translate(G.w / 2, iy);
      const k = lerp(0.3, 1, easeBack(p));
      ctx.scale(k, k);
      appIcon(ctx, name, 0, 0, (image ? 150 : 220) * G.u);
      ctx.restore();
      const h = caps(ctx, `*${name}*`, G.w / 2, iy + (image ? 100 : 150) * G.u, G.w - 2 * G.pad, t, s.start + 0.4, {
        sizes: (image ? [120, 100, 84] : [170, 140, 120, 100]).map(v => v * G.u), maxLines: 1,
      });
      let y = iy + (image ? 110 : 170) * G.u + h;
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.8, 0.5));
        y += K.textBlock(ctx, c.subtitle, G.w / 2, y, G.w - 2 * G.pad, { sizes: [38 * G.u, 34 * G.u, 30 * G.u], color: MUTED, maxLines: 2, align: 'center' }) + 30 * G.u;
        ctx.restore();
      }
      if (image) showPicture(ctx, s, t, G, image, { top: y + 20 * G.u, delay: 0.7, url: env.project.productUrl });
    },

    screenshot(ctx, s, t, env, G) {
      const image = env.images.get(env.scene.image);
      const top = header(ctx, s, t, G);
      const items = s.copy.items || [];
      const points = env.scene.points || [];
      const focus = env.scene.focus || (points[0] ? { x: clamp(points[0].x - 0.3, 0, 0.4), y: clamp(points[0].y - 0.3, 0, 0.4), w: 0.6, h: 0.6 } : { x: 0, y: 0, w: 0.7, h: 0.6 });
      const firstCue = items.length ? K.cueEntrance(s, 0) : s.voStart + s.voDur * 0.3;
      const zoomAt = Math.max(s.start + 0.9, firstCue - 0.9);
      const pan = items.map((_, i) => points[i] && { at: K.cueEntrance(s, i) - 0.5, x: points[i].x, y: points[i].y }).filter(Boolean);
      const view = showPicture(ctx, s, t, G, image, { top, zoomAt, focus, pan, url: env.project.productUrl });
      items.forEach((item, i) => {
        const pt = points[i];
        if (!pt) return;
        const at = K.cueEntrance(s, i) + 0.1;
        const q = view.map(pt.x, pt.y);
        tap(ctx, q.x, q.y, G.u, prog(t, at, 0.7));
        const live = i === latestCue(s, t);
        const p = prog(t, at + 0.15, 0.4) * (live ? 1 : 0.0);
        const labelY = clamp(q.y - 90 * G.u, top + 40 * G.u, G.h - 140 * G.u);
        pill(ctx, item.title, clamp(q.x, G.pad + 200 * G.u, G.w - G.pad - 200 * G.u), labelY, G.u, p);
      });
    },

    features(ctx, s, t, env, G) {
      const top = header(ctx, s, t, G);
      const items = s.copy.items || [];
      const image = env.images.get(env.scene.image);
      const n = Math.max(1, items.length);
      let startY = top;
      if (image && env.scene.variant === 2 && G.portrait) {
        const hh = G.h * 0.34;
        showPicture(ctx, s, t, G, image, { top, maxW: G.w - 2 * G.pad, url: env.project.productUrl });
        startY = G.h - hh - 60 * G.u;
      }
      const cols = G.portrait ? (n === 1 ? 1 : 2) : Math.min(n, 4);
      const gap = 26 * G.u;
      const tw = (G.w - 2 * G.pad - (cols - 1) * gap) / cols;
      const rows = Math.ceil(n / cols);
      const avail = G.h - startY - 120 * G.u;
      const th = Math.min((G.portrait ? 300 : 280) * G.u, (avail - (rows - 1) * gap) / rows);
      const latest = latestCue(s, t);
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.45);
        if (p <= 0) return;
        const x = G.pad + (i % cols) * (tw + gap);
        const y = startY + Math.floor(i / cols) * (th + gap);
        const live = i === latest;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        const k = lerp(0.7, 1, easeBack(p));
        ctx.translate(x + tw / 2, y + th / 2);
        ctx.scale(k, k);
        ctx.translate(-(x + tw / 2), -(y + th / 2));
        const g = ctx.createLinearGradient(x, y, x + tw, y + th);
        g.addColorStop(0, live ? 'rgba(90,43,224,0.55)' : 'rgba(69,29,199,0.28)');
        g.addColorStop(1, 'rgba(20,10,60,0.6)');
        ctx.fillStyle = g;
        K.roundRect(ctx, x, y, tw, th, 36 * G.u);
        ctx.fill();
        ctx.lineWidth = (live ? 4 : 2) * G.u;
        ctx.strokeStyle = live ? green() : CARD_EDGE;
        if (live) { ctx.shadowColor = `rgba(${greenRgb()},0.6)`; ctx.shadowBlur = 30 * G.u; }
        ctx.stroke();
        ctx.shadowBlur = 0;
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 60 * G.u, y + 62 * G.u, 42 * G.u, live ? green() : '#FFFFFF', 2.4);
        const fit = layoutCaps(ctx, item.title, tw - 60 * G.u, 2, [76, 64, 54, 46].map(v => v * G.u));
        ctx.save();
        font(ctx, 800, fit.size, DISPLAY);
        ctx.letterSpacing = `${-fit.size * 0.02}px`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'alphabetic';
        const lh = fit.size * 0.98;
        const by = y + th - 36 * G.u - (fit.lines.length - 1) * lh - (item.text ? 44 * G.u : 0);
        fit.lines.forEach((line, li) => {
          ctx.save();
          ctx.translate(x + 30 * G.u, by + li * lh);
          ctx.scale(SQUEEZE, 1);
          line.words.forEach(word => { ctx.fillStyle = word.accent ? green() : '#FFFFFF'; ctx.fillText(word.word, word.x / SQUEEZE, 0); });
          ctx.restore();
        });
        ctx.restore();
        if (item.text) K.textBlock(ctx, item.text, x + 30 * G.u, y + th - 62 * G.u, tw - 60 * G.u, { sizes: [26 * G.u, 24 * G.u], color: MUTED, maxLines: 1 });
        ctx.restore();
        tap(ctx, x + tw * 0.7, y + th * 0.55, G.u, prog(t, K.cueEntrance(s, i) + 0.2, 0.7));
      });
    },

    steps(ctx, s, t, env, G) {
      const top = header(ctx, s, t, G);
      const items = s.copy.items || [];
      const latest = latestCue(s, t);
      const cy = top + (G.h - top) * (G.portrait ? 0.36 : 0.4);
      items.forEach((item, i) => {
        const inP = prog(t, K.cueEntrance(s, i), 0.45);
        const outP = i < items.length - 1 ? prog(t, K.cueEntrance(s, i + 1), 0.35) : 0;
        if (inP <= 0 || outP >= 1) return;
        const dy = (1 - easeOut(inP)) * 120 * G.u - easeInOut(outP) * 160 * G.u;
        ctx.save();
        ctx.globalAlpha *= clamp(inP * 2, 0, 1) * (1 - outP);
        font(ctx, 800, (G.portrait ? 330 : 280) * G.u, DISPLAY);
        ctx.letterSpacing = `${-10 * G.u}px`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(90,43,224,0.7)';
        ctx.shadowBlur = 60 * G.u;
        ctx.save();
        ctx.translate(G.w / 2, cy + dy);
        ctx.scale(SQUEEZE, 1);
        ctx.fillText(String(i + 1).padStart(2, '0'), 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'left';
        caps(ctx, item.title, G.w / 2, cy + dy + 40 * G.u, G.w - 2 * G.pad, 1, 0, { sizes: [100, 86, 72, 60].map(v => v * G.u), maxLines: 2 });
        ctx.restore();
      });
      // progress dots
      items.forEach((_, i) => {
        ctx.fillStyle = i <= latest ? green() : 'rgba(255,255,255,0.25)';
        const x = G.w / 2 + (i - (items.length - 1) / 2) * 34 * G.u;
        ctx.beginPath();
        ctx.arc(x, G.h - (G.portrait ? 260 : 150) * G.u, (i === latest ? 9 : 6) * G.u, 0, Math.PI * 2);
        ctx.fill();
      });
    },

    stats(ctx, s, t, env, G) {
      const top = header(ctx, s, t, G);
      const items = s.copy.items || [];
      const cy = top + (G.h - top) * 0.34;
      items.forEach((item, i) => {
        const inP = prog(t, K.cueEntrance(s, i), 1.1);
        const outP = i < items.length - 1 ? prog(t, K.cueEntrance(s, i + 1) - 0.1, 0.35) : 0;
        if (inP <= 0 || outP >= 1) return;
        ctx.save();
        ctx.globalAlpha *= clamp(inP * 3, 0, 1) * (1 - outP);
        const dy = -easeInOut(outP) * 150 * G.u;
        const value = K.countUp(item.value || item.title, inP);
        font(ctx, 800, (G.portrait ? 300 : 260) * G.u, DISPLAY);
        const vw = ctx.measureText(value).width * SQUEEZE;
        const size = (G.portrait ? 300 : 260) * G.u * Math.min(1, (G.w - 2 * G.pad) / Math.max(1, vw));
        font(ctx, 800, size, DISPLAY);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = green();
        ctx.shadowColor = `rgba(${greenRgb()},0.55)`;
        ctx.shadowBlur = 50 * G.u;
        ctx.save();
        ctx.translate(G.w / 2, cy + dy);
        ctx.scale(SQUEEZE, 1);
        ctx.fillText(value, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        K.textBlock(ctx, item.title, G.w / 2, cy + dy + 40 * G.u, G.w - 2 * G.pad, { sizes: [44 * G.u, 38 * G.u, 34 * G.u], color: '#FFFFFF', weight: 600, maxLines: 2, align: 'center' });
        ctx.restore();
      });
    },

    quote(ctx, s, t, env, G) {
      const c = s.copy;
      const h = caps(ctx, c.title, G.w / 2, G.h * (G.portrait ? 0.3 : 0.22), G.w - 2 * G.pad, t, s.start + 0.2, {
        sizes: (G.portrait ? [120, 104, 90, 78, 68] : [104, 90, 78, 68]).map(v => v * G.u), maxLines: 5, stagger: 0.18,
      });
      eyebrow(ctx, c.subtitle, G.w / 2, G.h * (G.portrait ? 0.3 : 0.22) + h + 60 * G.u, G.u, t, s.voStart + s.voDur * 0.6);
    },

    /** The product's mark as a flat-shaded 3D lozenge turning into place, then its name. */
    /** The planning: phases as glowing bars on the week or month scale, each growing on its cue. */
    planning(ctx, s, t, env, G) {
      let top = header(ctx, s, t, G, { maxLines: 2 });
      if (s.copy.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.6, 0.5));
        K.textBlock(ctx, s.copy.subtitle, G.w / 2, top - 20 * G.u, G.w - 2 * G.pad, { sizes: [36 * G.u, 32 * G.u], color: MUTED, maxLines: 1, align: 'center' });
        ctx.restore();
        top += 50 * G.u;
      }
      // labels read at phone size: everything in the chart is scaled up from the landscape layout
      const u = G.u * (G.portrait ? 1.6 : 1.2);
      // room left under the chart for the time scale and the captions
      const avail = G.h - top - (G.portrait ? 360 : 220) * G.u;
      const n = Math.max(1, Math.min(5, (s.copy.items || []).length));
      const h = Math.min(avail, n * (G.portrait ? 190 : 124) * u);
      K.drawPlanning(ctx, s, t, {
        x: G.pad, y: top + 30 * G.u + Math.max(0, (avail - h) / 2), w: G.w - 2 * G.pad, h, labelW: G.portrait ? 0 : 420 * u, u,
      }, {
        name: '#FFFFFF', nameLit: green(), muted: MUTED, grid: CARD_EDGE, tick: MUTED,
        bar: ['rgba(106,59,240,0.55)', 'rgba(30,13,87,0.6)'], barLit: ['#6A3BF0', '#2D1380'], edge: CARD_EDGE,
        glow: `rgba(${greenRgb()},0.7)`, onBar: '#FFFFFF', onLit: '#FFFFFF', milestone: '#FFFFFF', milestoneLit: green(),
      });
    },

    /** The team: big portraits in a grid, names in capitals, each tapped as it is named. */
    team(ctx, s, t, env, G) {
      const top = header(ctx, s, t, G, { maxLines: 2 });
      const items = (s.copy.items || []).slice(0, 6);
      const n = Math.max(1, items.length);
      const cols = G.portrait ? (n <= 3 ? n : n === 4 ? 2 : 3) : n;
      const rows = Math.ceil(n / cols);
      const gap = 30 * G.u;
      const tw = (G.w - 2 * G.pad - (cols - 1) * gap) / cols;
      const avail = G.h - top - 160 * G.u;
      const th = Math.min((G.portrait ? 560 : 520) * G.u, (avail - (rows - 1) * gap) / rows);
      const r = Math.min(tw * 0.36, th * 0.3, 150 * G.u);
      // the grid sits in the middle of the space left under the title
      const rowH = 2 * r + 170 * G.u;
      const y0 = top + Math.max(0, (avail - rows * rowH - (rows - 1) * gap) / 2);
      const latest = latestCue(s, t);
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.45);
        if (p <= 0) return;
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        const cx = G.w / 2 - (inRow * tw + (inRow - 1) * gap) / 2 + (i % cols) * (tw + gap) + tw / 2;
        const cy = y0 + row * (rowH + gap) + r + 10 * G.u;
        const live = i === latest;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        const k = lerp(0.6, 1, easeBack(p));
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        if (live) { ctx.shadowColor = `rgba(${greenRgb()},0.6)`; ctx.shadowBlur = 40 * G.u; }
        K.avatar(ctx, cx, cy, r, item.title, { from: live ? '#6A3BF0' : '#4A22C9', to: '#1E0D57', ring: live ? green() : CARD_EDGE, ink: '#FFFFFF' });
        ctx.restore();
        const q = easeOut(prog(t, K.cueEntrance(s, i) + 0.12, 0.45));
        if (q > 0) {
          ctx.save();
          ctx.globalAlpha *= q;
          const fit = layoutCaps(ctx, item.title, tw - 10 * G.u, 2, [52, 44, 38, 32].map(v => v * G.u));
          font(ctx, 800, fit.size, DISPLAY);
          ctx.letterSpacing = `${-fit.size * 0.02}px`;
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = 'left';
          const lh = fit.size * 0.98;
          const ny = cy + r + 36 * G.u + fit.size * 0.8 + (1 - q) * 20 * G.u;
          fit.lines.forEach((line, li) => {
            line.words.forEach(word => {
              ctx.fillStyle = word.accent ? green() : '#FFFFFF';
              ctx.fillText(word.word, cx - line.width / 2 + word.x, ny + li * lh);
            });
          });
          ctx.letterSpacing = '0px';
          K.textBlock(ctx, item.text, cx, ny + (fit.lines.length - 1) * lh + 22 * G.u, tw - 10 * G.u, { sizes: [26, 24, 22].map(v => v * G.u), color: live ? green() : MUTED, maxLines: 2, align: 'center' });
          ctx.restore();
        }
        tap(ctx, cx + r * 0.5, cy + r * 0.4, G.u, prog(t, K.cueEntrance(s, i) + 0.2, 0.7));
      });
    },

    emblem(ctx, s, t, env, G) {
      const c = s.copy;
      const name = (c.title || env.project.productName || '').replace(/\*/g, '');
      const cy = G.h * (G.portrait ? 0.36 : 0.36);
      const size = (G.portrait ? 380 : 300) * G.u;
      eyebrow(ctx, c.eyebrow, G.w / 2, cy - size * 0.95, G.u, t, s.start + 0.05);
      K.emblem3d(ctx, G.w / 2, cy, size, prog(t, s.start + 0.1, 1.0), K.initials(name), {
        face: '#FFFFFF', side: '#451DC7', edge: '#1E0D57', ink: '#2D1380', time: t,
      });
      const h = caps(ctx, `*${name}*`, G.w / 2, cy + size * 0.78, G.w - 2 * G.pad, t, s.start + 0.8, {
        sizes: (G.portrait ? [150, 128, 110, 92] : [130, 112, 96]).map(v => v * G.u), maxLines: 1, pop: true,
      });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 1.3, 0.5));
        K.textBlock(ctx, c.subtitle, G.w / 2, cy + size * 0.78 + h + 30 * G.u, G.w - 2 * G.pad, { sizes: [40 * G.u, 36 * G.u, 32 * G.u], color: MUTED, maxLines: 2, align: 'center' });
        ctx.restore();
      }
    },

    /** One huge time or figure: a time of day flips to the next minute, like a clock. */
    moment(ctx, s, t, env, G) {
      const c = s.copy;
      const value = String(c.title || '').replace(/\*/g, '').trim();
      const cy = G.h * (G.portrait ? 0.46 : 0.5);
      eyebrow(ctx, c.eyebrow, G.w / 2, cy - (G.portrait ? 300 : 250) * G.u, G.u, t, s.start + 0.05);
      const time = value.match(/^(\d{1,2})([:h.])(\d{2})\s*(.*)$/i);
      const flipAt = s.voStart + Math.max(0.6, s.voDur * 0.45);
      const flip = time ? easeInOut(prog(t, flipAt, 0.45)) : 1;
      let before = value;
      let suffix = '';
      let main = value;
      if (time) {
        const hours = Number(time[1]);
        const minutes = Number(time[3]);
        const prev = (hours * 60 + minutes + 1439) % 1440;
        const pad = n => String(n).padStart(2, '0');
        before = `${time[1].length > 1 ? pad(Math.floor(prev / 60)) : Math.floor(prev / 60)}${time[2]}${pad(prev % 60)}`;
        main = `${time[1]}${time[2]}${time[3]}`;
        suffix = time[4];
      }
      const size = (G.portrait ? 300 : 280) * G.u;
      const enter = prog(t, s.start + 0.15, 0.5);
      ctx.save();
      ctx.globalAlpha *= clamp(enter * 2, 0, 1);
      font(ctx, 800, size, DISPLAY);
      ctx.letterSpacing = `${-size * 0.03}px`;
      const fitScale = Math.min(1, (G.w - 2 * G.pad) / Math.max(1, ctx.measureText(main).width + (suffix ? size * 0.9 : 0)));
      const fs = size * fitScale;
      font(ctx, 800, fs, DISPLAY);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      const drawValue = (text, dy, alpha) => {
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(90,43,224,0.7)';
        ctx.shadowBlur = fs * 0.2;
        ctx.fillText(text, G.w / 2 - (suffix ? fs * 0.25 : 0), cy + fs * 0.35 + dy);
        ctx.restore();
      };
      const k = lerp(1.2, 1, easeOut(enter));
      ctx.translate(G.w / 2, cy);
      ctx.scale(k, k);
      ctx.translate(-G.w / 2, -cy);
      if (time) {
        drawValue(before, -flip * fs * 0.6, 1 - flip);
        drawValue(main, (1 - flip) * fs * 0.6, flip);
      } else drawValue(main, 0, 1);
      if (suffix) {
        font(ctx, 800, fs * 0.28, DISPLAY);
        const mw = (() => { font(ctx, 800, fs, DISPLAY); const m = ctx.measureText(main).width; font(ctx, 800, fs * 0.28, DISPLAY); return m; })();
        ctx.textAlign = 'left';
        ctx.fillStyle = green();
        ctx.fillText(suffix.toLocaleUpperCase(), G.w / 2 - fs * 0.25 + mw / 2 + 14 * G.u, cy - fs * 0.25);
      }
      ctx.restore();
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.6, 0.5));
        font(ctx, 600, 34 * G.u, BODY);
        ctx.letterSpacing = `${8 * G.u}px`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = MUTED;
        ctx.fillText(c.subtitle.toLocaleUpperCase(), G.w / 2 + 4 * G.u, cy + fs * 0.35 + 110 * G.u, G.w - 2 * G.pad);
        ctx.restore();
      }
    },

    cta(ctx, s, t, env, G) {
      const c = s.copy;
      const image = env.images.get(env.scene.image);
      const top = header(ctx, s, t, G, { maxLines: 3 });
      let y = top;
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.6, 0.5));
        y += K.textBlock(ctx, c.subtitle, G.w / 2, y - 20 * G.u, G.w - 2 * G.pad, { sizes: [36 * G.u, 32 * G.u], color: MUTED, maxLines: 2, align: 'center' }) + 30 * G.u;
        ctx.restore();
      }
      const url = (env.project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (image) showPicture(ctx, s, t, G, image, { top: y, delay: 0.3, url: env.project.productUrl });
      else {
        const p = prog(t, s.start + 0.5, 0.5);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        ctx.translate(G.w / 2, y + 160 * G.u);
        const k = lerp(0.4, 1, easeBack(p));
        ctx.scale(k, k);
        appIcon(ctx, env.project.productName, 0, 0, 200 * G.u);
        ctx.restore();
      }
      if (url) {
        const at = s.start + 1.2;
        const typed = url.slice(0, Math.round(url.length * prog(t, at, Math.min(1.2, url.length * 0.045))));
        pill(ctx, typed || ' ', G.w / 2, G.h - (G.portrait ? 200 : 110) * G.u, G.u, prog(t, at - 0.2, 0.4));
      }
    },
  };

  // ── background, captions, end card ──────────────────────────────────────
  function backdrop(ctx, G, t, seed) {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, G.w, G.h);
    const blobs = [
      { c: '69,29,199', a: 0.85, x: 0.2, y: 0.25, r: 0.75, sx: 0.13, sy: 0.09 },
      { c: '107,61,240', a: 0.55, x: 0.85, y: 0.65, r: 0.65, sx: 0.11, sy: 0.14 },
      { c: greenRgb(), a: 0.16, x: 0.6, y: 1.0, r: 0.6, sx: 0.09, sy: 0.07 },
      { c: '30,13,87', a: 0.9, x: 0.5, y: 0.5, r: 0.35, sx: 0.07, sy: 0.12 },
    ];
    const size = Math.max(G.w, G.h);
    blobs.forEach((b, i) => {
      const x = (b.x + Math.sin(t * b.sx * 2 + i + seed) * 0.12) * G.w;
      const y = (b.y + Math.cos(t * b.sy * 2 + i * 1.7 + seed) * 0.1) * G.h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * size);
      g.addColorStop(0, `rgba(${b.c},${b.a})`);
      g.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, G.w, G.h);
    });
    // a dark veil keeps white text readable
    const v = ctx.createLinearGradient(0, 0, 0, G.h);
    v.addColorStop(0, 'rgba(10,6,34,0.55)');
    v.addColorStop(0.45, 'rgba(10,6,34,0.15)');
    v.addColorStop(1, 'rgba(10,6,34,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, G.w, G.h);
  }

  function captions(ctx, G, s, t, bold) {
    const chunk = s.captions.find(c => t >= c.start - 0.05 && t <= c.end + 0.3);
    if (!chunk || t > s.voEnd + 0.3) return;
    ctx.save();
    const size = (bold ? 40 : 34) * G.u;
    font(ctx, 600, size, BODY);
    const text = chunk.tokens.map(tk => tk.token).join(' ');
    const lines = [];
    let line = '';
    text.split(' ').forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > G.w - 2 * G.pad - 40 * G.u) { lines.push(line); line = word; } else line = next;
    });
    if (line) lines.push(line);
    const lh = size * 1.3;
    const y0 = G.h - (G.portrait ? 110 : 60) * G.u - (lines.length - 1) * lh;
    ctx.globalAlpha = Math.min(prog(t, chunk.start - 0.05, 0.12), 1 - prog(t, chunk.end + 0.15, 0.15));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!bold) {
      // a soft dark band keeps white captions readable over bright screens
      const band = ctx.createLinearGradient(0, y0 - lh * 2.2, 0, G.h);
      band.addColorStop(0, 'rgba(10,6,34,0)');
      band.addColorStop(1, 'rgba(10,6,34,0.78)');
      ctx.fillStyle = band;
      ctx.fillRect(0, y0 - lh * 2.2, G.w, G.h - y0 + lh * 2.2);
    }
    if (bold) {
      const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 50 * G.u;
      ctx.fillStyle = 'rgba(10,6,34,0.8)';
      K.roundRect(ctx, G.w / 2 - bw / 2, y0 - lh * 0.75, bw, lines.length * lh + lh * 0.5, 24 * G.u);
      ctx.fill();
    }
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 14 * G.u;
    ctx.fillStyle = '#FFFFFF';
    lines.forEach((l, i) => ctx.fillText(l, G.w / 2, y0 + i * lh));
    ctx.restore();
  }

  function endCard(ctx, G, t, final, env) {
    const at = final.end - END_CARD;
    const p = prog(t, at, 0.4);
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    backdrop(ctx, G, t, 3);
    ctx.fillStyle = 'rgba(10,6,34,0.35)';
    ctx.fillRect(0, 0, G.w, G.h);
    const q = easeOut(prog(t, at + 0.1, 0.5));
    ctx.globalAlpha = p * q;
    ctx.translate(0, (1 - q) * 30 * G.u);
    const project = env.project;
    const cy = G.h * (G.portrait ? 0.42 : 0.4);
    if (project.brand && /wavestone/i.test(project.brand)) K.drawLogo(ctx, 'lockup', true, G.w / 2, cy - 170 * G.u, 220 * G.u, 'center');
    else if (project.brand) caps(ctx, project.brand, G.w / 2, cy - 120 * G.u, G.w - 2 * G.pad, 1, 0, { sizes: [110 * G.u, 90 * G.u], maxLines: 1 });
    if (project.productName) caps(ctx, project.productName, G.w / 2, cy + 110 * G.u, G.w - 2 * G.pad, 1, 0, { sizes: [84 * G.u, 70 * G.u], maxLines: 1 });
    const url = (project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (url) {
      font(ctx, 600, 30 * G.u, BODY);
      ctx.textAlign = 'center';
      ctx.fillStyle = green();
      ctx.fillText(url, G.w / 2, cy + 260 * G.u, G.w - 2 * G.pad);
    }
    ctx.restore();
  }

  function chrome(ctx, G, env) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    K.brandMark(ctx, env.project, G.pad * 0.8, (G.portrait ? 56 : 44) * G.u, 24 * G.u, true);
    ctx.restore();
  }

  // ── compositing: whip cuts with motion blur ─────────────────────────────
  const layers = [];
  function layer(i, G) {
    let c = layers[i];
    if (!c || c.width !== G.w || c.height !== G.h) {
      c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(G.w, G.h) : Object.assign(document.createElement('canvas'), { width: G.w, height: G.h });
      layers[i] = c;
    }
    const lctx = c.getContext('2d');
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, G.w, G.h);
    return { canvas: c, ctx: lctx };
  }

  function drawScene(ctx, s, t, env, G) {
    const draw = VM.pickScene(SCENES, s.scene.type);
    ctx.save();
    draw(ctx, s, Math.max(s.start, t), Object.assign({ scene: s.scene }, env), G);
    ctx.restore();
  }

  VM.renderShowcaseFrame = function (ctx, timeline, t, env) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const G = geometry(ctx);
    const scenes = timeline.scenes;
    const time = clamp(t, 0, Math.max(0, timeline.duration - 0.001));
    backdrop(ctx, G, time, 0);
    if (!scenes.length) { ctx.restore(); return; }
    const trans = timeline.trans || 0.45;
    const active = scenes.filter(s => time >= s.start && time < s.end);
    if (!active.length) active.push(scenes[scenes.length - 1]);
    if (active.length === 1) drawScene(ctx, active[0], time, env, G);
    else {
      const a = active[0];
      const b = active[active.length - 1];
      const p = easeInOut(prog(time, b.start, trans));
      const speed = Math.sin(Math.PI * p);
      const la = layer(0, G);
      const lb = layer(1, G);
      drawScene(la.ctx, a, Math.min(time, a.end), env, G);
      drawScene(lb.ctx, b, time, env, G);
      const travel = G.h * 0.9;
      const spread = speed * G.h * 0.03;
      [[la.canvas, -p * travel], [lb.canvas, (1 - p) * travel]].forEach(([canvas, offset]) => {
        ctx.globalAlpha = 1 - 0.45 * speed;
        ctx.drawImage(canvas, 0, offset);
        if (speed > 0.05) {
          ctx.globalAlpha = 0.22 * speed;
          for (let k = 1; k <= 3; k++) {
            ctx.drawImage(canvas, 0, offset - k * spread);
            ctx.drawImage(canvas, 0, offset + k * spread);
          }
        }
      });
      ctx.globalAlpha = 1;
    }
    const final = scenes[scenes.length - 1];
    const last = active[active.length - 1];
    const current = active.length > 1 && prog(time, last.start, trans) < 0.5 ? active[0] : last;
    if (time < final.end - END_CARD) {
      chrome(ctx, G, env);
      if (env.captions) {
        const speaking = active.find(s => time >= s.voStart && time <= s.voEnd + 0.3) || current;
        captions(ctx, G, speaking, time, env.captionStyle === 'bold');
      }
    }
    endCard(ctx, G, time, final, env);
    ctx.restore();
  };
})();
