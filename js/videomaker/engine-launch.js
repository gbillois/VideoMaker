// Video Maker "Launch" style: a dark, cinematic launch teaser. Keycaps pop in,
// an app icon lights up inside a ring, then the camera flies over an endless
// canvas of glowing glass windows. Big white words slide in, the narration is
// typed into a command bar, screenshots sit on bright white cards wired to the
// windows, and the film ends on a zoom-out, a white flash and the logo.
// Wavestone colours throughout: indigo night, indigo glass, green glow.
// Text stays light: short titles only, no eyebrows, no secondary lines.
// It renders the very same project as the other styles.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});
  const K = VM.kit;
  const { W, H, DISPLAY, BODY, clamp, lerp, easeOut, easeInOut, easeBack, prog, font } = K;
  const NIGHT = '#05030F';
  const GLASS = 'rgba(21,9,57,0.78)';
  const EDGE = 'rgba(155,133,255,0.30)';
  const LAVENDER = '#B9AFEA';
  const MUTED = 'rgba(209,202,242,0.62)';
  const INDIGO = '#5A2BE0';
  const DANGER = '#FF6B57';
  const GAP = 760;
  const INTRO = 1.25;

  const green = () => K.theme().accent;
  const greenRgb = () => K.theme().rgb || '4,240,106';

  // ── primitives ───────────────────────────────────────────────────────────
  /** A dark glass window; `glow` (0..1) lights its border in green. */
  function glass(ctx, x, y, w, h, opts) {
    const o = opts || {};
    const glow = o.glow || 0;
    const tint = o.tint || greenRgb();
    ctx.save();
    if (glow > 0) {
      ctx.shadowColor = `rgba(${tint},${0.85 * glow})`;
      ctx.shadowBlur = 46 * glow;
    }
    ctx.fillStyle = o.fill || GLASS;
    K.roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = glow > 0 ? 2 + glow : 1.5;
    ctx.strokeStyle = glow > 0 ? `rgba(${tint},${0.35 + 0.65 * glow})` : EDGE;
    ctx.stroke();
    // a faint sheen across the top-left corner
    const sheen = ctx.createLinearGradient(x, y, x + w * 0.6, y + h * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    K.roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    if (o.header !== false) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 1, y + 40, w - 2, 1.5);
      ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.12)'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + 22 + i * 18, y + 20, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      if (o.title) {
        font(ctx, 600, 17, BODY);
        ctx.letterSpacing = '1.5px';
        ctx.fillStyle = glow > 0.5 ? `rgb(${tint})` : MUTED;
        ctx.textBaseline = 'middle';
        ctx.fillText(String(o.title).toUpperCase(), x + 84, y + 21, w - 110);
        ctx.letterSpacing = '0px';
      }
    }
    ctx.restore();
  }

  /** Placeholder "code" lines inside a decorative window. */
  function scribble(ctx, x, y, w, h, seed) {
    let r = seed;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let ly = y + 62; ly < y + h - 18; ly += 24) {
      const indent = rnd() < 0.3 ? 24 : 0;
      const len = (0.35 + rnd() * 0.55) * (w - 48 - indent);
      ctx.fillStyle = rnd() < 0.15 ? `rgba(${greenRgb()},0.35)` : 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 24 + indent, ly, len, 7);
    }
  }

  /** A glowing wire from a to b (control points make a soft S). `p` draws it progressively. */
  function wire(ctx, ax, ay, bx, by, p, strength) {
    if (p <= 0) return;
    const s = strength === undefined ? 1 : strength;
    ctx.save();
    ctx.strokeStyle = `rgba(${greenRgb()},${0.25 + 0.6 * s})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = `rgba(${greenRgb()},${0.8 * s})`;
    ctx.shadowBlur = 14 * s;
    const mx = (ax + bx) / 2;
    const steps = 40;
    ctx.beginPath();
    for (let i = 0; i <= steps * p; i++) {
      const u = i / steps;
      const x = cubic(ax, mx, mx, bx, u);
      const y = cubic(ay, ay, by, by, u);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    return { x: cubic(ax, mx, mx, bx, p), y: cubic(ay, ay, by, by, p) };
  }

  function cubic(a, b, c, d, u) {
    const v = 1 - u;
    return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
  }

  function dot(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha === undefined ? 1 : alpha;
    ctx.fillStyle = green();
    ctx.shadowColor = `rgba(${greenRgb()},0.9)`;
    ctx.shadowBlur = r * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Words slide in from the right, one by one; *accent* words glow green. */
  function headline(ctx, text, x, y, maxWidth, t, t0, opts) {
    const o = opts || {};
    ctx.save();
    ctx.letterSpacing = '-3px';
    const fit = K.fitRich(ctx, text, maxWidth, o.maxLines || 3, o.sizes || [128, 112, 96, 84], o.weight || 700, DISPLAY);
    const lh = fit.size * 1.04;
    ctx.textBaseline = 'alphabetic';
    let index = 0;
    fit.lines.forEach((line, li) => {
      const ox = o.align === 'center' ? x - line.width / 2 : x;
      const baseY = y + fit.size * 0.92 + li * lh;
      line.words.forEach(word => {
        const p = prog(t, t0 + index * (o.stagger || 0.08), 0.55);
        index++;
        if (p <= 0) return;
        const e = easeOut(p);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 1.8, 0, 1);
        if (word.accent) {
          ctx.fillStyle = green();
          ctx.shadowColor = `rgba(${greenRgb()},0.7)`;
          ctx.shadowBlur = 30;
        } else {
          ctx.fillStyle = o.color || '#FFFFFF';
          ctx.shadowColor = 'rgba(90,43,224,0.55)';
          ctx.shadowBlur = 24;
        }
        ctx.fillText(word.word, ox + word.x + (1 - e) * 70, baseY);
        ctx.restore();
      });
    });
    ctx.restore();
    return fit.lines.length * lh;
  }

  function eyebrow(ctx, text, x, y, t, t0, align) {
    if (!text) return 0;
    const p = prog(t, t0, 0.4);
    if (p <= 0) return 60;
    ctx.save();
    ctx.globalAlpha *= p;
    font(ctx, 700, 22, BODY);
    ctx.letterSpacing = '4px';
    const label = String(text).toUpperCase();
    const w = ctx.measureText(label).width + 30;
    const x0 = align === 'center' ? x - w / 2 : x;
    dot(ctx, x0 + 6, y + 12, 6);
    ctx.fillStyle = green();
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 30, y + 13);
    ctx.restore();
    return 60;
  }

  function body(ctx, text, x, y, maxW, opts) {
    return K.textBlock(ctx, text, x, y, maxW, Object.assign({ sizes: [36, 32, 28], color: LAVENDER, maxLines: 2 }, opts || {}));
  }

  /** A bright white card, like a document dropped on the dark canvas. */
  function whiteCard(ctx, x, y, w, h, image, tag) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = '#FFFFFF';
    K.roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.restore();
    ctx.save();
    K.roundRect(ctx, x, y, w, h, 12);
    ctx.clip();
    if (image) ctx.drawImage(image, x, y, w, h);
    else {
      ctx.fillStyle = '#F5F4F9';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    K.roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
    ctx.restore();
    if (tag) {
      ctx.save();
      font(ctx, 600, 20, BODY);
      const tw = Math.min(w - 20, ctx.measureText(tag).width + 28);
      ctx.fillStyle = '#FFFFFF';
      K.roundRect(ctx, x, y - 42, tw, 34, 6);
      ctx.fill();
      ctx.fillStyle = '#1E0D57';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, x + 14, y - 24, tw - 28);
      ctx.restore();
    }
  }

  function imageFit(image, maxW, maxH) {
    const iw = image ? image.width : 16;
    const ih = image ? image.height : 10;
    const scale = Math.min(maxW / iw, maxH / ih);
    return { w: iw * scale, h: ih * scale };
  }

  /** A keycap in flat-shaded 3D: a darker side under a face that sinks when pressed. */
  function keycap(ctx, label, cx, cy, size, press, lit) {
    ctx.save();
    const w = size * (label.length > 2 ? 1.6 + (label.length - 3) * 0.18 : 1);
    const h = size;
    const depth = size * 0.16;
    const sink = press * depth * 0.7;
    ctx.translate(cx, cy);
    // floor shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    K.roundRect(ctx, -w / 2 + 6, -h / 2 + depth + 14, w, h, 18);
    ctx.fill();
    // the side, seen from the front
    ctx.fillStyle = '#140A3D';
    K.roundRect(ctx, -w / 2, -h / 2 + depth, w, h, 18);
    ctx.fill();
    ctx.fillStyle = '#2A1F55';
    K.roundRect(ctx, -w / 2, -h / 2 + depth * 0.5 + sink * 0.5, w, h, 18);
    ctx.fill();
    // the face
    ctx.translate(0, sink);
    ctx.fillStyle = lit > 0.5 ? '#3E2F7A' : '#352A66';
    K.roundRect(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    K.roundRect(ctx, -w / 2 + 8, -h / 2 + 6, w - 16, h * 0.45, 14);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = lit > 0 ? `rgba(${greenRgb()},${0.3 + 0.7 * lit})` : 'rgba(255,255,255,0.18)';
    if (lit > 0) {
      ctx.shadowColor = `rgba(${greenRgb()},${lit})`;
      ctx.shadowBlur = 30 * lit;
    }
    K.roundRect(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.stroke();
    ctx.shadowBlur = 0;
    font(ctx, 600, size * (label.length > 2 ? 0.3 : 0.42), BODY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lit > 0.5 ? green() : '#FFFFFF';
    ctx.fillText(label, 0, -2);
    ctx.restore();
  }


  function initials(name) {
    const words = String(name || 'AI').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+|(?=[A-Z][a-z])/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'AI').slice(0, 2)).toUpperCase();
  }

  /** The product's app icon: an indigo tile with its initials and a green spark. */
  function appIcon(ctx, name, cx, cy, size, glow) {
    ctx.save();
    ctx.shadowColor = `rgba(90,43,224,${0.9 * glow})`;
    ctx.shadowBlur = 80 * glow;
    const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
    g.addColorStop(0, '#6B3DF0');
    g.addColorStop(1, '#2D1380');
    ctx.fillStyle = g;
    K.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.24);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    font(ctx, 800, size * 0.4, DISPLAY);
    ctx.letterSpacing = '-2px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(initials(name), cx, cy + size * 0.03);
    ctx.restore();
    dot(ctx, cx + size * 0.3, cy - size * 0.3, size * 0.06);
  }

  function ring(ctx, cx, cy, r, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(185,175,234,${0.28 * alpha})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = `rgba(90,43,224,${0.8 * alpha})`;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function latestCue(s, t) {
    let latest = -1;
    (s.copy.items || []).forEach((_, i) => { if (t >= K.cueEntrance(s, i)) latest = i; });
    return latest;
  }

  // ── scenes (local 1920×1080 frame; steps may extend wider) ──────────────
  function sceneWidth(scene, copy) {
    if (scene.type === 'steps') return Math.max(W, 460 + ((copy.items || []).length) * 640);
    return W;
  }

  /** When the first scene opens the film, its content waits for the intro. */
  const delay = s => (s.index === 0 ? INTRO - 0.2 : 0);

  const SCENES = {
    hook(ctx, s, t, env) {
      const c = s.copy;
      const t0 = s.start + delay(s);
      const image = env.scene.variant === 2 ? env.images.get(env.scene.image) : null;
      // a cluster of windows multiplying on the right
      const spots = [[1180, 170, 560, 330], [1260, 540, 520, 300], [880, 620, 340, 260], [1500, 120, 300, 200]];
      spots.forEach(([x, y, w, h], i) => {
        const p = easeBack(prog(t, t0 + 0.15 + i * 0.22, 0.5));
        if (p <= 0) return;
        ctx.save();
        ctx.globalAlpha *= clamp(p, 0, 1) * (i === 0 ? 1 : 0.8);
        ctx.translate(x + w / 2, y + h / 2);
        ctx.scale(lerp(0.85, 1, p), lerp(0.85, 1, p));
        glass(ctx, -w / 2, -h / 2, w, h, { title: i === 0 ? env.project.productName : '', glow: i === 0 ? 0.6 + 0.4 * Math.sin(t * 2) * 0.5 : 0 });
        if (!(image && i === 0)) scribble(ctx, -w / 2, -h / 2, w, h, 17 + i * 31 + s.index);
        ctx.restore();
        if (image && i === 0) {
          const f = imageFit(image, w - 40, h - 70);
          ctx.save();
          ctx.globalAlpha *= clamp(p, 0, 1);
          ctx.drawImage(image, x + w / 2 - f.w / 2, y + 52, f.w, f.h);
          ctx.restore();
        }
      });
      headline(ctx, c.title, 150, 380, 1020, t, t0 + 0.2, { sizes: [140, 124, 108, 92], maxLines: 3 });
    },

    problem(ctx, s, t, env) {
      const c = s.copy;
      headline(ctx, c.title, 150, 200, 1600, t, s.start + 0.3, { sizes: [96, 84, 72, 62], maxLines: 2, stagger: 0.06 });
      const items = c.items || [];
      const n = Math.max(1, items.length);
      const w = Math.min(480, (1620 - (n - 1) * 40) / n);
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const x = 150 + i * (w + 40);
        const yy = 520 + (i % 2) * 70;
        const e = easeBack(p);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        ctx.translate(x + w / 2, yy + 90);
        ctx.scale(lerp(0.8, 1, e), lerp(0.8, 1, e));
        ctx.translate(-(x + w / 2), -(yy + 90));
        const flicker = i === latestCue(s, t) ? 0.5 + 0.5 * Math.abs(Math.sin(t * 5)) : 0.25;
        glass(ctx, x, yy, w, 180, { title: 'issue', glow: flicker, tint: '255,107,87' });
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'alert', x + 50, yy + 110, 30, DANGER, 2.4);
        K.textBlock(ctx, item.title, x + 96, yy + 88, w - 124, { sizes: [34, 30, 26], weight: 600, family: DISPLAY, color: '#FFFFFF', maxLines: 2 });
        ctx.restore();
      });
    },

    reveal(ctx, s, t, env) {
      const c = s.copy;
      const t0 = s.start + delay(s);
      const image = env.images.get(env.scene.image);
      const cy = image ? 250 : 400;
      const p = easeBack(prog(t, t0 + 0.1, 0.7));
      ring(ctx, W / 2, cy, 150 + 260 * easeOut(prog(t, t0 + 0.1, 1.4)), 1 - prog(t, t0 + 0.9, 1.2));
      ring(ctx, W / 2, cy, 150, clamp(p, 0, 1));
      ctx.save();
      ctx.globalAlpha *= clamp(p, 0, 1);
      ctx.translate(W / 2, cy);
      ctx.scale(lerp(0.6, 1, p), lerp(0.6, 1, p));
      appIcon(ctx, c.title || env.project.productName, 0, 0, image ? 150 : 190, 1);
      ctx.restore();
      const name = `*${(c.title || env.project.productName || '').replace(/\*/g, '')}*`;
      const h = headline(ctx, name, W / 2, cy + (image ? 110 : 190), 1600, t, t0 + 0.5, { align: 'center', sizes: image ? [96, 84, 72] : [140, 120, 100], maxLines: 1, stagger: 0.1 });
      let y = cy + (image ? 130 : 210) + h;
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, Math.max(t0 + 1.0, s.voStart + s.voDur * 0.3), 0.6));
        y += body(ctx, c.subtitle, W / 2, y, 1400, { align: 'center', sizes: [38, 34, 30] }) + 30;
        ctx.restore();
      }
      if (image) {
        const q = easeOut(prog(t, t0 + 0.9, 1.1));
        const f = imageFit(image, 1100, H - y - 190);
        ctx.save();
        ctx.globalAlpha *= clamp(q * 1.5, 0, 1);
        whiteCard(ctx, W / 2 - f.w / 2, y + 20 + (1 - q) * 400, f.w, f.h, image);
        ctx.restore();
      }
    },

    screenshot(ctx, s, t, env) {
      const c = s.copy;
      const image = env.images.get(env.scene.image);
      const geo = screenshotGeometry(s, env);
      const items = c.items || [];
      const p = easeOut(prog(t, s.start + 0.1, 0.8));
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.4, 0, 1);
      whiteCard(ctx, geo.x + (1 - p) * 200, geo.y, geo.w, geo.h, image, c.title);
      ctx.restore();
      if (!items.length) return;
      const latest = latestCue(s, t);
      items.forEach((item, i) => {
        const bp = prog(t, K.cueEntrance(s, i) - 0.1, 0.45);
        if (bp <= 0) return;
        const box = geo.panel(i);
        const glow = i === latest ? 1 : 0.15;
        ctx.save();
        ctx.globalAlpha *= clamp(bp * 2, 0, 1);
        ctx.translate((1 - easeOut(bp)) * -60, 0);
        glass(ctx, box.x, box.y, box.w, box.h, { title: `0${i + 1}`, glow });
        K.textBlock(ctx, item.title, box.x + 26, box.y + 60, box.w - 52, { sizes: [32, 28, 24], weight: 600, family: DISPLAY, color: '#FFFFFF', maxLines: 2 });
        ctx.restore();
        const pt = geo.point(i);
        if (!pt) return;
        const wp = easeInOut(prog(t, K.cueEntrance(s, i) + 0.1, 0.5));
        const tip = wire(ctx, box.x + box.w, box.y + box.h / 2, pt.x, pt.y, wp, i === latest ? 1 : 0.35);
        if (wp >= 1) {
          const pulse = i === latest ? 1 + 0.35 * Math.sin(t * 6) : 1;
          dot(ctx, pt.x, pt.y, 11 * pulse);
          if (i === latest) ring(ctx, pt.x, pt.y, 18 + 26 * ((t * 1.2) % 1), 1 - ((t * 1.2) % 1));
        } else if (tip) dot(ctx, tip.x, tip.y, 7);
      });
    },

    features(ctx, s, t, env) {
      const c = s.copy;
      const items = c.items || [];
      const image = env.images.get(env.scene.image);
      headline(ctx, c.title, 150, 200, 1620, t, s.start + 0.3, { sizes: [96, 84, 72, 62], maxLines: 2, stagger: 0.06 });
      const latest = latestCue(s, t);
      let boxes;
      if (image && env.scene.variant === 2) {
        const f = imageFit(image, 760, 420);
        const cx = W / 2 - f.w / 2;
        const q = easeOut(prog(t, s.start + 0.4, 0.8));
        ctx.save();
        ctx.globalAlpha *= q;
        whiteCard(ctx, cx, 470 + (1 - q) * 160, f.w, f.h, image);
        ctx.restore();
        const spots = [[150, 440], [W - 150 - 420, 440], [150, 730], [W - 150 - 420, 730]];
        boxes = items.map((_, i) => ({ x: spots[i % 4][0], y: spots[i % 4][1], w: 420, h: 170, to: { x: i % 2 ? cx + f.w : cx, y: 470 + f.h * (i < 2 ? 0.3 : 0.7) } }));
      } else {
        const n = Math.max(1, items.length);
        const cols = n === 4 ? 2 : Math.min(n, 3);
        const rows = Math.ceil(n / cols);
        const bw = cols === 2 ? 700 : 480;
        const bh = rows > 1 ? 170 : 220;
        const total = cols * bw + (cols - 1) * 50;
        boxes = items.map((_, i) => ({ x: W / 2 - total / 2 + (i % cols) * (bw + 50), y: (rows > 1 ? 470 : 540) + Math.floor(i / cols) * (bh + 40), w: bw, h: bh }));
        // wires between consecutive windows once both are on screen
        for (let i = 0; i < boxes.length - 1; i++) {
          const a = boxes[i];
          const b = boxes[i + 1];
          const wp = easeInOut(prog(t, K.cueEntrance(s, i + 1), 0.5));
          if (a.y === b.y) wire(ctx, a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, wp, 0.5);
        }
      }
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const b = boxes[i];
        const e = easeBack(p);
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
        ctx.scale(lerp(0.85, 1, e), lerp(0.85, 1, e));
        ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
        glass(ctx, b.x, b.y, b.w, b.h, { title: `0${i + 1}`, glow: i === latest ? 1 : 0 });
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', b.x + 52, b.y + 40 + (b.h - 40) / 2, 30, i === latest ? green() : LAVENDER, 2.4);
        K.textBlock(ctx, item.title, b.x + 98, b.y + 40 + (b.h - 40) / 2 - 22, b.w - 124, { sizes: [36, 32, 28], weight: 600, family: DISPLAY, color: '#FFFFFF', maxLines: 1 });
        ctx.restore();
        if (b.to) wire(ctx, i % 2 ? b.x : b.x + b.w, b.y + b.h / 2, b.to.x, b.to.y, easeInOut(prog(t, K.cueEntrance(s, i) + 0.2, 0.5)), i === latest ? 1 : 0.35);
      });
    },

    steps(ctx, s, t, env) {
      const c = s.copy;
      const items = c.items || [];
      headline(ctx, c.title, 150, 200, 1620, t, s.start + 0.3, { sizes: [96, 84, 72, 62], maxLines: 2, stagger: 0.06 });
      const top = 500;
      const bw = 480;
      const bh = 250;
      const xs = items.map((_, i) => 460 + i * 640);
      const latest = latestCue(s, t);
      for (let i = 0; i < items.length - 1; i++) {
        const a = xs[i] + bw / 2;
        const b = xs[i + 1] - bw / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(155,133,255,0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(a, top + bh / 2);
        ctx.lineTo(b, top + bh / 2);
        ctx.stroke();
        ctx.restore();
        const fill = easeInOut(prog(t, K.cueEntrance(s, i + 1) - 0.6, 0.6));
        const tip = wire(ctx, a, top + bh / 2, b, top + bh / 2, fill, 1);
        if (tip && fill < 1) dot(ctx, tip.x, tip.y, 9);
      }
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        const x = xs[i] - bw / 2;
        ctx.save();
        ctx.globalAlpha *= p > 0 ? clamp(p * 2, 0, 1) : 0.3;
        glass(ctx, x, top, bw, bh, { title: `step ${i + 1}`, glow: i === latest ? 1 : 0 });
        font(ctx, 800, 64, DISPLAY);
        ctx.textBaseline = 'top';
        ctx.fillStyle = i === latest ? green() : 'rgba(185,175,234,0.5)';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + 30, top + 60);
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + bw - 64, top + 96, 32, i === latest ? green() : LAVENDER, 2.4);
        if (p > 0) K.textBlock(ctx, item.title, x + 30, top + 150, bw - 60, { sizes: [36, 32, 28], weight: 600, family: DISPLAY, color: '#FFFFFF', maxLines: 2 });
        ctx.restore();
      });
    },

    stats(ctx, s, t) {
      const c = s.copy;
      headline(ctx, c.title, 150, 200, 1620, t, s.start + 0.3, { sizes: [96, 84, 72, 62], maxLines: 2, stagger: 0.06 });
      const items = c.items || [];
      const n = Math.max(1, items.length);
      const colW = 1620 / n;
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 1.2);
        if (p <= 0) return;
        const x = 150 + i * colW;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 3, 0, 1);
        font(ctx, 800, n === 1 ? 260 : n === 2 ? 210 : 170, DISPLAY);
        ctx.letterSpacing = '-6px';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = `rgba(${greenRgb()},0.55)`;
        ctx.shadowBlur = 50;
        ctx.fillText(K.countUp(item.value || item.title, p), x, 700, colW - 60);
        ctx.shadowBlur = 0;
        ctx.letterSpacing = '0px';
        const lw = (colW - 100) * easeInOut(prog(t, K.cueEntrance(s, i) + 0.3, 0.7));
        ctx.fillStyle = green();
        ctx.shadowColor = `rgba(${greenRgb()},0.9)`;
        ctx.shadowBlur = 16;
        ctx.fillRect(x, 734, lw, 4);
        ctx.shadowBlur = 0;
        body(ctx, item.title, x, 764, colW - 80, { sizes: [32, 28, 26], maxLines: 3 });
        ctx.restore();
      });
    },

    quote(ctx, s, t) {
      const c = s.copy;
      ctx.save();
      font(ctx, 800, 300, DISPLAY);
      ctx.fillStyle = green();
      ctx.shadowColor = `rgba(${greenRgb()},0.7)`;
      ctx.shadowBlur = 40;
      ctx.textBaseline = 'top';
      ctx.globalAlpha *= prog(t, s.start + 0.2, 0.5);
      ctx.fillText('“', 140, 70);
      ctx.restore();
      const words = (c.title || '').split(/\s+/).length || 1;
      const h = headline(ctx, c.title, 260, 300, 1440, t, s.start + 0.4, {
        sizes: [80, 70, 62, 54, 48], weight: 700, maxLines: 5, stagger: Math.min(0.12, (s.voDur * 0.8) / words),
      });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.voStart + s.voDur * 0.7, 0.6));
        eyebrow(ctx, c.subtitle, 260, 350 + h, t, s.voStart + s.voDur * 0.7);
        ctx.restore();
      }
    },

    /** The product's mark as a flat-shaded 3D lozenge turning into place inside a ring. */
    /** The planning: glass bars that grow on the narration, the current phase glowing green. */
    planning(ctx, s, t) {
      const c = s.copy;
      const h = headline(ctx, c.title, 150, 190, 1620, t, s.start + 0.3, { sizes: [88, 76, 66, 58], maxLines: 1, stagger: 0.06 });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.8, 0.5));
        body(ctx, c.subtitle, 150, 210 + h, 1600, { sizes: [34, 30], maxLines: 1 });
        ctx.restore();
      }
      K.drawPlanning(ctx, s, t, { x: 150, y: 420, w: 1620, h: 420, labelW: 440 }, {
        name: '#FFFFFF', nameLit: green(), muted: MUTED, grid: EDGE, tick: MUTED,
        bar: ['rgba(90,43,224,0.55)', 'rgba(30,13,87,0.75)'], barLit: [INDIGO, '#2D1380'], edge: EDGE,
        glow: `rgba(${greenRgb()},0.75)`, onBar: '#FFFFFF', onLit: green(), milestone: LAVENDER, milestoneLit: green(),
      });
    },

    /** The team: glowing portraits wired together, the one being named lit in green. */
    team(ctx, s, t) {
      const c = s.copy;
      const items = (c.items || []).slice(0, 6);
      headline(ctx, c.title, W / 2, 190, 1620, t, s.start + 0.3, { align: 'center', sizes: [96, 84, 72, 62], maxLines: 1, stagger: 0.06 });
      const n = Math.max(1, items.length);
      const gap = 60;
      const cw = Math.min(330, (1640 - gap * (n - 1)) / n);
      const r = Math.min(104, cw * 0.32);
      const cy = 520;
      const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2 + cw / 2;
      const latest = latestCue(s, t);
      for (let i = 0; i < n - 1; i++) {
        const wp = easeInOut(prog(t, K.cueEntrance(s, i + 1) - 0.2, 0.5));
        wire(ctx, x0 + i * (cw + gap) + r + 14, cy, x0 + (i + 1) * (cw + gap) - r - 14, cy, wp, 0.5);
      }
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.55);
        if (p <= 0) return;
        const cx = x0 + i * (cw + gap);
        const lit = i === latest;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        const k = lerp(0.6, 1, easeBack(p));
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        ctx.translate(-cx, -cy);
        if (lit) {
          const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.9);
          halo.addColorStop(0, `rgba(${greenRgb()},0.35)`);
          halo.addColorStop(1, `rgba(${greenRgb()},0)`);
          ctx.fillStyle = halo;
          ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
        }
        K.avatar(ctx, cx, cy, r, item.title, { from: '#3A1FA8', to: '#150939', ring: lit ? green() : EDGE, ink: lit ? green() : '#FFFFFF' });
        ctx.restore();
        const q = easeOut(prog(t, K.cueEntrance(s, i) + 0.15, 0.5));
        if (q <= 0) return;
        ctx.save();
        ctx.globalAlpha *= q;
        const th = K.textBlock(ctx, item.title, cx, cy + r + 46 + (1 - q) * 20, cw, { sizes: [34, 30, 26, 24], weight: 600, family: DISPLAY, color: '#FFFFFF', maxLines: 2, align: 'center' });
        K.textBlock(ctx, item.text, cx, cy + r + 58 + th + (1 - q) * 20, cw, { sizes: [24, 22, 20], color: MUTED, maxLines: 2, align: 'center' });
        ctx.restore();
      });
    },

    emblem(ctx, s, t, env) {
      const c = s.copy;
      const t0 = s.start + delay(s);
      const cy = 400;
      const p = prog(t, t0 + 0.1, 1.1);
      ring(ctx, W / 2, cy, 170 + 300 * easeOut(prog(t, t0 + 0.6, 1.3)), 1 - prog(t, t0 + 1.2, 1.2));
      ring(ctx, W / 2, cy, 250, clamp(p * 2, 0, 1) * 0.8);
      K.emblem3d(ctx, W / 2, cy - 20, 300, p, K.initials(c.title || env.project.productName), {
        face: '#FFFFFF', side: '#3A2E63', edge: '#1A1233', ink: '#2D1380', time: t,
      });
      const name = `*${(c.title || env.project.productName || '').replace(/\*/g, '')}*`;
      const h = headline(ctx, name, W / 2, 650, 1600, t, t0 + 0.9, { align: 'center', sizes: [120, 104, 90], maxLines: 1, stagger: 0.1 });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, t0 + 1.4, 0.6));
        body(ctx, c.subtitle, W / 2, 670 + h, 1300, { align: 'center', sizes: [38, 34, 30] });
        ctx.restore();
      }
    },

    /** A shortcut: keycaps pop in and are pressed on their cue words, then the result lights up. */
    keys(ctx, s, t, env) {
      const c = s.copy;
      headline(ctx, c.title, W / 2, 190, 1600, t, s.start + 0.2, { align: 'center', sizes: [96, 84, 72, 62], maxLines: 2, stagger: 0.06 });
      const items = (c.items || []).filter(item => item.title);
      const size = 170;
      const widths = items.map(item => size * (item.title.length > 2 ? 1.6 + (item.title.length - 3) * 0.18 : 1));
      const gap = 60;
      const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, items.length - 1);
      let x = W / 2 - total / 2;
      const cy = 600;
      let done = -1;
      items.forEach((item, i) => {
        const at = K.cueEntrance(s, i);
        const p = easeBack(prog(t, at - 0.35, 0.35));
        const cx = x + widths[i] / 2;
        x += widths[i] + gap;
        if (p <= 0) return;
        const press = t >= at && t < at + 0.22 ? 1 : 0;
        const lit = prog(t, at, 0.15) * (1 - prog(t, at + 1.2, 0.8) * 0.6);
        if (t >= at) done = i;
        ctx.save();
        ctx.globalAlpha *= clamp(p, 0, 1);
        ctx.translate(cx, cy + (1 - p) * 80);
        keycap(ctx, item.title, 0, 0, size, press, lit);
        ctx.restore();
        if (i < items.length - 1 && t >= at) {
          font(ctx, 700, 60, DISPLAY);
          ctx.fillStyle = MUTED;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+', x - gap / 2, cy);
          ctx.textAlign = 'left';
        }
      });
      const allAt = items.length ? K.cueEntrance(s, items.length - 1) + 0.4 : s.start + 1;
      if (done === items.length - 1 && c.subtitle) {
        const q = prog(t, allAt, 0.5);
        ctx.save();
        ctx.globalAlpha *= q;
        font(ctx, 500, 40, BODY);
        const tw = ctx.measureText(c.subtitle).width + 110;
        glass(ctx, W / 2 - tw / 2, 820, tw, 90, { header: false, glow: 0.8 * q, fill: 'rgba(12,6,34,0.9)' });
        dot(ctx, W / 2 - tw / 2 + 42, 865, 8);
        font(ctx, 500, 40, BODY);
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.subtitle, W / 2 - tw / 2 + 70, 867);
        ctx.restore();
      }
    },

    cta(ctx, s, t, env) {
      const c = s.copy;
      let y = 250;
      y += headline(ctx, c.title, W / 2, y, 1640, t, s.start + 0.3, { align: 'center', sizes: [112, 98, 86, 74], maxLines: 2 }) + 30;
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 1.0, 0.6));
        y += body(ctx, c.subtitle, W / 2, y, 1300, { align: 'center', sizes: [36, 32, 28] }) + 40;
        ctx.restore();
      } else y += 30;
      const url = (env.project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!url) return;
      const t0 = s.start + 1.4;
      const p = prog(t, t0, 0.4);
      if (p <= 0) return;
      const typeDur = Math.min(1.4, url.length * 0.05);
      const typed = url.slice(0, Math.round(url.length * prog(t, t0 + 0.3, typeDur)));
      const pressAt = t0 + 0.3 + typeDur + 0.35;
      font(ctx, 500, 40, BODY);
      const w = Math.max(760, ctx.measureText(url).width + 300);
      const x = W / 2 - w / 2;
      const lit = prog(t, pressAt, 0.25) * (1 - prog(t, pressAt + 0.8, 0.8)) + 0.35;
      ctx.save();
      ctx.globalAlpha *= clamp(p * 2, 0, 1);
      glass(ctx, x, y, w, 100, { header: false, glow: lit, fill: 'rgba(12,6,34,0.9)' });
      font(ctx, 500, 40, BODY);
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(typed, x + 40, y + 52);
      if (typed.length < url.length || Math.floor(t * 2.5) % 2 === 0) {
        ctx.fillStyle = green();
        ctx.fillRect(x + 44 + ctx.measureText(typed).width, y + 28, 3, 46);
      }
      ctx.restore();
      const press = t >= pressAt && t < pressAt + 0.25 ? 1 : 0;
      keycap(ctx, 'enter ↵', x + w - 112, y + 50, 64, press, prog(t, pressAt, 0.2));
    },
  };

  function screenshotGeometry(s, env) {
    const image = env.images.get(env.scene.image);
    const items = s.copy.items || [];
    const side = items.length ? 440 : 0;
    const f = imageFit(image, (items.length ? 1180 : 1500), 780);
    const x = items.length ? W - 130 - f.w : W / 2 - f.w / 2;
    const y = 170 + (820 - f.h) / 2;
    const n = Math.max(1, items.length);
    const ph = Math.min(140, (800 - (n - 1) * 26) / n);
    const py = 170 + (820 - (n * ph + (n - 1) * 26)) / 2;
    return {
      x, y, w: f.w, h: f.h,
      panel: i => ({ x: Math.max(60, x - side - 120), y: py + i * (ph + 26), w: side, h: ph }),
      point(i) {
        const pt = (env.scene.points || [])[i];
        return pt ? { x: x + pt.x * f.w, y: y + pt.y * f.h } : null;
      },
    };
  }

  // ── camera ───────────────────────────────────────────────────────────────
  function cameraFor(s, t, env) {
    const span = Math.max(0.1, s.end - s.start);
    // a slow push-in on every set-up
    const cam = { x: W / 2, y: H / 2, z: lerp(1.0, 1.06, easeInOut(prog(t, s.start, span))) };
    const toward = (at, x, y, z, dur) => {
      const m = easeInOut(prog(t, at, dur || 0.9));
      if (m <= 0) return;
      cam.x = lerp(cam.x, x, m);
      cam.y = lerp(cam.y, y, m);
      cam.z = lerp(cam.z, z, m);
    };
    const items = s.copy.items || [];
    if (s.scene.type === 'screenshot' && env.images.get(env.scene.image)) {
      const geo = screenshotGeometry(s, env);
      items.forEach((_, i) => {
        const pt = geo.point(i);
        if (!pt) return;
        const box = geo.panel(i);
        toward(K.cueEntrance(s, i) - 0.5, lerp(W / 2, (box.x + pt.x) / 2 + 100, 0.5), lerp(H / 2, (box.y + box.h / 2 + pt.y) / 2, 0.5), 1.1);
      });
      if (!items.length && env.scene.focus) {
        const f = env.scene.focus;
        toward(s.voStart + s.voDur * 0.3, geo.x + (f.x + f.w / 2) * geo.w, geo.y + (f.y + f.h / 2) * geo.h, 1.3, 1.4);
      }
      toward(s.end - 1.0, W / 2, H / 2, 1.0, 0.9);
    } else if (s.scene.type === 'steps') {
      items.forEach((_, i) => toward(K.cueEntrance(s, i) - 0.5, Math.max(W / 2, 460 + i * 640), H / 2, 1.0, 0.8));
    }
    return cam;
  }

  // ── world ────────────────────────────────────────────────────────────────
  function anchors(timeline) {
    if (timeline._launchAnchors) return timeline._launchAnchors;
    let x = 0;
    timeline._launchAnchors = timeline.scenes.map((s, i) => {
      const anchor = { x, y: [0, 520, -260, 380][i % 4] };
      x += sceneWidth(s.scene, s.copy) + GAP;
      return anchor;
    });
    return timeline._launchAnchors;
  }

  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** The endless canvas: dim windows on a grid, drawn with a little parallax. */
  function backdrop(ctx, cam, t) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.8);
    g1.addColorStop(0, 'rgba(69,29,199,0.22)');
    g1.addColorStop(1, 'rgba(69,29,199,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * 0.9, H * 0.95, 0, W * 0.9, H * 0.95, W * 0.6);
    g2.addColorStop(0, `rgba(${greenRgb()},0.09)`);
    g2.addColorStop(1, `rgba(${greenRgb()},0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    const par = 0.6;
    const z = 1 - (1 - cam.z) * 0.8;
    ctx.setTransform(z, 0, 0, z, W / 2 - cam.x * par * z, H / 2 - cam.y * par * z);
    const view = { x0: cam.x * par - W / 2 / z, y0: cam.y * par - H / 2 / z, x1: cam.x * par + W / 2 / z, y1: cam.y * par + H / 2 / z };
    const cw = 560;
    const ch = 360;
    for (let gy = Math.floor(view.y0 / ch) - 1; gy <= Math.ceil(view.y1 / ch); gy++) {
      for (let gx = Math.floor(view.x0 / cw) - 1; gx <= Math.ceil(view.x1 / cw); gx++) {
        const r = hash(gx, gy);
        if (r > 0.55) continue;
        const w = 300 + hash(gx + 7, gy) * 200;
        const h = 180 + hash(gx, gy + 5) * 130;
        const x = gx * cw + hash(gx, gy + 11) * (cw - w);
        const y = gy * ch + hash(gx + 3, gy) * (ch - h);
        const lit = r < 0.05 ? 0.25 + 0.2 * Math.sin(t * 1.5 + gx) : 0;
        ctx.globalAlpha = 0.34;
        glass(ctx, x, y, w, h, { glow: lit, fill: 'rgba(21,9,57,0.55)' });
        scribble(ctx, x, y, w, h, ((gx * 31 + gy * 17) >>> 0) + 1);
      }
    }
    ctx.restore();
  }

  function chrome(ctx, timeline, t, env) {
    const project = env.project;
    ctx.save();
    ctx.globalAlpha = 0.9;
    K.brandMark(ctx, project, 72, 50, 26, true);
    if (project.productName) {
      font(ctx, 600, 20, BODY);
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = MUTED;
      ctx.fillText(project.productName.toUpperCase(), W - 72, 56);
    }
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = green();
    ctx.shadowColor = `rgba(${greenRgb()},0.9)`;
    ctx.shadowBlur = 12;
    ctx.fillRect(0, H - 4, W * clamp(t / timeline.duration, 0, 1), 4);
    ctx.restore();
  }

  /** Captions as a command bar: the narration is typed as it is spoken. */
  function promptBar(ctx, s, t, bold) {
    const chunk = s.captions.find(c => t >= c.start - 0.05 && t <= c.end + 0.35);
    if (!chunk || t > s.voEnd + 0.35) return;
    ctx.save();
    const size = bold ? 40 : 32;
    font(ctx, 500, size, BODY);
    const space = ctx.measureText(' ').width;
    const words = chunk.tokens.map(token => ({ token, w: ctx.measureText(token.token).width }));
    const full = words.reduce((acc, w, i) => acc + w.w + (i ? space : 0), 0);
    const maxW = 1500;
    const scale = full > maxW ? maxW / full : 1;
    const barW = Math.min(maxW, full * scale) + 150;
    const barH = size + (bold ? 48 : 36);
    const x = W / 2 - barW / 2;
    const y = H - 56 - barH;
    ctx.globalAlpha = Math.min(prog(t, chunk.start - 0.05, 0.15), 1 - prog(t, chunk.end + 0.2, 0.15));
    glass(ctx, x, y, barW, barH, { header: false, glow: bold ? 0.7 : 0.25, fill: bold ? 'rgba(12,6,34,0.92)' : 'rgba(12,6,34,0.72)' });
    dot(ctx, x + 38, y + barH / 2, 7);
    ctx.save();
    ctx.translate(x + 70, y + barH / 2);
    ctx.scale(scale, scale);
    ctx.textBaseline = 'middle';
    let cx = 0;
    let caret = 0;
    let latest = -1;
    words.forEach((w, i) => { if (t >= w.token.start) latest = i; });
    words.forEach((w, i) => {
      if (i > latest) return;
      ctx.fillStyle = i === latest ? green() : '#FFFFFF';
      ctx.fillText(w.token.token, cx, 1);
      cx += w.w + space;
      caret = cx - space;
    });
    if (Math.floor(t * 2.5) % 2 === 0 || latest < words.length - 1) {
      ctx.fillStyle = green();
      ctx.fillRect(caret + 6, -size * 0.55, 3, size * 1.1);
    }
    ctx.restore();
    ctx.restore();
  }

  /** The frame edge lights up in indigo while the call to action is on. */
  function edgeGlow(ctx, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(90,43,224,0.9)';
    ctx.shadowColor = INDIGO;
    ctx.shadowBlur = 50;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.restore();
  }

  /** Keycaps, then the app icon lights up inside a ring, then the world appears. */
  function intro(ctx, t, env) {
    if (t >= INTRO) return;
    const out = prog(t, INTRO - 0.35, 0.35);
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.fillStyle = '#030110';
    ctx.fillRect(0, 0, W, H);
    const keys = ['⌘', '⇧', initials(env.project.productName).slice(0, 1)];
    const pressAt = 0.62;
    const keysOut = prog(t, pressAt + 0.12, 0.2);
    if (keysOut < 1) {
      keys.forEach((label, i) => {
        const p = easeBack(prog(t, 0.05 + i * 0.14, 0.3));
        if (p <= 0) return;
        ctx.save();
        ctx.globalAlpha *= clamp(p, 0, 1) * (1 - keysOut);
        const press = t >= pressAt && t < pressAt + 0.15 ? 1 : 0;
        keycap(ctx, label, W / 2 + (i - 1) * 170, H / 2 + (1 - p) * 60, 130, press, press);
        ctx.restore();
      });
    }
    const icon = prog(t, pressAt + 0.1, 0.35);
    if (icon > 0) {
      ring(ctx, W / 2, H / 2, 150 + 500 * easeOut(icon), 1 - icon);
      ring(ctx, W / 2, H / 2, 190, clamp(icon * 2, 0, 1));
      // the product's mark, a flat-shaded 3D lozenge, turns into place
      K.emblem3d(ctx, W / 2, H / 2 - 10, 230, prog(t, pressAt + 0.05, 0.5), K.initials(env.project.productName), {
        face: '#FFFFFF', side: '#3A2E63', edge: '#1A1233', ink: '#2D1380', time: t,
      });
    }
    ctx.restore();
  }

  VM.renderLaunchFrame = function (ctx, timeline, t, env) {
    const scenes = timeline.scenes;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (!scenes.length) {
      ctx.fillStyle = NIGHT;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const time = clamp(t, 0, timeline.duration - 0.001);
    const trans = timeline.trans || 0.8;
    const pos = anchors(timeline);
    const active = scenes.filter(s => time >= s.start && time < s.end);
    if (!active.length) active.push(scenes[scenes.length - 1]);
    const worldCam = s => {
      const cam = cameraFor(s, time, Object.assign({ scene: s.scene }, env));
      return { x: pos[s.index].x + cam.x, y: pos[s.index].y + cam.y, z: cam.z };
    };
    let cam = worldCam(active[0]);
    if (active.length > 1) {
      const next = active[active.length - 1];
      const m = easeInOut(prog(time, next.start, trans));
      const b = worldCam(next);
      // a fast fly-over: the camera rises between two set-ups
      cam = { x: lerp(cam.x, b.x, m), y: lerp(cam.y, b.y, m), z: lerp(cam.z, b.z, m) * (1 - 0.3 * Math.sin(Math.PI * m)) };
    }
    // the ending: zoom out over the whole canvas, white flash, then the logo
    const final = scenes[scenes.length - 1];
    const endAt = final.end - 1.25;
    const pull = easeInOut(prog(time, Math.max(final.voEnd + 0.1, endAt - 1.1), Math.min(1.1, Math.max(0.3, endAt - final.voEnd - 0.1))));
    cam.z *= lerp(1, 0.42, pull);
    backdrop(ctx, cam, time);
    const view = { x0: cam.x - W / 2 / cam.z, y0: cam.y - H / 2 / cam.z, x1: cam.x + W / 2 / cam.z, y1: cam.y + H / 2 / cam.z };
    ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
    scenes.forEach(s => {
      const a = pos[s.index];
      const width = sceneWidth(s.scene, s.copy);
      if (a.x > view.x1 || a.x + width < view.x0 || a.y > view.y1 || a.y + H < view.y0) return;
      if (time < s.start - trans) return;
      const draw = VM.pickScene(SCENES, s.scene.type);
      ctx.save();
      ctx.translate(a.x, a.y);
      draw(ctx, s, Math.max(Math.min(time, s.end), s.start), Object.assign({ scene: s.scene }, env));
      ctx.restore();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    edgeGlow(ctx, final.scene.type === 'cta' ? 0.55 * prog(time, final.start + 0.5, 0.8) * (1 - pull) : 0);
    chrome(ctx, timeline, time, env);
    const last = active[active.length - 1];
    const current = active.length > 1 && prog(time, last.start, trans) < 0.5 ? active[0] : last;
    if (env.captions && pull <= 0) {
      const speaking = active.find(s => time >= s.voStart && time <= s.voEnd + 0.4) || current;
      promptBar(ctx, speaking, time, env.captionStyle === 'bold');
    }
    intro(ctx, time, env);
    // white flash, then the end card
    const flash = prog(time, endAt - 0.2, 0.2) * (1 - prog(time, endAt + 0.05, 0.5));
    if (time >= endAt) {
      ctx.fillStyle = '#030110';
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.55);
      g.addColorStop(0, 'rgba(69,29,199,0.35)');
      g.addColorStop(1, 'rgba(69,29,199,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const p = easeOut(prog(time, endAt + 0.1, 0.6));
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(0, (1 - p) * 30);
      const project = env.project;
      if (project.brand && /wavestone/i.test(project.brand)) K.drawLogo(ctx, 'lockup', true, W / 2, H / 2 - 230, 250, 'center');
      else if (project.brand) {
        font(ctx, 700, 96, DISPLAY);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(project.brand, W / 2, H / 2 - 100);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      if (project.productName) {
        font(ctx, 700, 56, DISPLAY);
        ctx.letterSpacing = '-1px';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(project.productName, W / 2, H / 2 + 120);
        ctx.letterSpacing = '0px';
      }
      const tagline = String((scenes[0].copy && scenes[0].copy.title) || '').replace(/\*/g, '');
      if (tagline) {
        font(ctx, 400, 30, BODY);
        ctx.fillStyle = MUTED;
        ctx.fillText(tagline, W / 2, H / 2 + 178, 1400);
      }
      const url = (project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (url) {
        font(ctx, 600, 26, BODY);
        ctx.fillStyle = green();
        ctx.fillText(url, W / 2, H / 2 + 236, 1400);
      }
      ctx.restore();
    }
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  };
})();
