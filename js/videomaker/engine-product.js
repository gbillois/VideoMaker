// Video Maker "Produit" style: one continuous paper world that the camera
// travels across, gitdiagram-like. Scenes are laid out side by side, cards
// have ink borders and hard shadows, words pop in as they are spoken, a cursor
// clicks through the product screenshots and the camera pushes in on it.
// It renders the very same project as the "Slides" style.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});
  const K = VM.kit;
  const { W, H, C, DISPLAY, BODY, clamp, lerp, easeOut, easeInOut, easeBack, prog, font } = K;
  // Wavestone palette: indigo lines and hard shadows, indigo-600 titles,
  // ink body text, the platform accent (green by default) for highlights.
  const INK = '#2D1380';
  const INK2 = '#514C63';
  const TITLE = '#451DC7';
  // Background of the camera's world: Wavestone white by default.
  const PAPERS = { white: '#FFFFFF', lavender: '#F1EEFB', grey: '#F5F4F9' };
  const DANGER = '#D8412F';
  const DANGER_SOFT = '#FBE3DF';
  const GAP = 700;

  // ── primitives ───────────────────────────────────────────────────────────
  function card(ctx, x, y, w, h, fill, radius, lift) {
    const r = radius === undefined ? 18 : radius;
    const off = lift === undefined ? 8 : lift;
    ctx.fillStyle = INK;
    K.roundRect(ctx, x + off, y + off, w, h, r);
    ctx.fill();
    ctx.fillStyle = fill || '#FFFFFF';
    K.roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function chip(ctx, text, x, y, opts) {
    const o = opts || {};
    font(ctx, 700, o.size || 22, BODY);
    ctx.letterSpacing = '2px';
    const label = o.upper === false ? text : text.toUpperCase();
    const w = ctx.measureText(label).width + 36;
    const h = (o.size || 22) + 22;
    const x0 = o.align === 'center' ? x - w / 2 : x;
    card(ctx, x0, y, w, h, o.fill || '#FFFFFF', h / 2, 4);
    ctx.fillStyle = o.color || INK;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x0 + 18, y + h / 2 + 1);
    ctx.letterSpacing = '0px';
    return { w, h };
  }

  /** Words pop in one by one; *accent* words get a highlighter stroke behind them. */
  function kinetic(ctx, text, x, y, maxWidth, t, t0, opts) {
    const o = opts || {};
    ctx.save();
    ctx.letterSpacing = '-2px';
    const fit = K.fitRich(ctx, text, maxWidth, o.maxLines || 3, o.sizes || [120, 104, 92, 80], o.weight || 800, DISPLAY);
    const lh = fit.size * 1.08;
    ctx.textBaseline = 'alphabetic';
    const th = K.theme();
    let index = 0;
    fit.lines.forEach((line, li) => {
      const ox = o.align === 'left' ? x : x - line.width / 2;
      const baseY = y + fit.size * 0.92 + li * lh;
      line.words.forEach(word => {
        const start = t0 + index * (o.stagger || 0.09);
        index++;
        const p = prog(t, start, 0.45);
        if (p <= 0) return;
        const wx = ox + word.x;
        if (word.accent) {
          const m = easeInOut(prog(t, start + 0.2, 0.5));
          ctx.fillStyle = th.accent;
          ctx.fillRect(wx - 6, baseY - fit.size * 0.38, (word.w + 12) * m, fit.size * 0.42);
        }
        const k = lerp(0.6, 1, easeBack(p));
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        ctx.translate(wx + word.w / 2, baseY);
        ctx.scale(k, k);
        ctx.fillStyle = o.color || TITLE;
        ctx.fillText(word.word, -word.w / 2, (1 - easeOut(p)) * 30);
        ctx.restore();
      });
    });
    ctx.restore();
    return fit.lines.length * lh;
  }

  function label(ctx, text, x, y, maxW, opts) {
    return K.textBlock(ctx, text, x, y, maxW, Object.assign({ sizes: [34, 30, 26], color: INK2, maxLines: 2 }, opts || {}));
  }

  function cursor(ctx, x, y, clickP) {
    ctx.save();
    if (clickP > 0 && clickP < 1) {
      ctx.strokeStyle = `rgba(22,18,31,${0.6 * (1 - clickP)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 12 + clickP * 46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(x, y);
    const press = clickP > 0 && clickP < 0.3 ? 0.88 : 1;
    ctx.scale(1.5 * press, 1.5 * press);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 30);
    ctx.lineTo(8, 23);
    ctx.lineTo(13.5, 35);
    ctx.lineTo(19, 32.5);
    ctx.lineTo(13.5, 21);
    ctx.lineTo(24, 21);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function screenCard(ctx, x, y, w, h, image, url) {
    card(ctx, x, y, w, h, '#FFFFFF', 20, 10);
    ctx.save();
    K.roundRect(ctx, x, y, w, h, 20);
    ctx.clip();
    ctx.fillStyle = '#F5F4F9';
    ctx.fillRect(x, y, w, 46);
    ctx.fillStyle = INK;
    ctx.fillRect(x, y + 46, w, 3);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 30 + i * 24, y + 23, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    if (url) {
      font(ctx, 500, 18, BODY);
      ctx.fillStyle = INK2;
      ctx.textBaseline = 'middle';
      ctx.fillText(url.replace(/^https?:\/\//, '').slice(0, 60), x + 120, y + 24);
    }
    if (image) ctx.drawImage(image, x, y + 49, w, h - 49);
    ctx.restore();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    K.roundRect(ctx, x, y, w, h, 20);
    ctx.stroke();
  }

  function screenFit(image, maxW, maxH) {
    const iw = image ? image.width : 16;
    const ih = image ? image.height : 10;
    const scale = Math.min(maxW / iw, (maxH - 49) / ih);
    return { w: iw * scale, h: ih * scale + 49 };
  }

  function bubble(ctx, title, text, px, py, side, p) {
    ctx.save();
    font(ctx, 700, 30, DISPLAY);
    const tw = ctx.measureText(title).width;
    font(ctx, 400, 22, BODY);
    const sw = Math.min(440, ctx.measureText(text || '').width);
    const w = Math.min(500, Math.max(tw, sw) + 44);
    const h = text ? 104 : 64;
    const x = side > 0 ? px + 40 : px - 40 - w;
    const y = py - h - 26;
    const k = lerp(0.7, 1, easeBack(p));
    ctx.globalAlpha *= clamp(p * 2, 0, 1);
    ctx.translate(side > 0 ? x : x + w, y + h);
    ctx.scale(k, k);
    ctx.translate(-(side > 0 ? x : x + w), -(y + h));
    card(ctx, x, y, w, h, TITLE, 16, 0);
    ctx.fillStyle = TITLE;
    ctx.beginPath();
    ctx.moveTo(side > 0 ? x + 20 : x + w - 20, y + h - 2);
    ctx.lineTo(side > 0 ? x + 20 : x + w - 20, y + h + 22);
    ctx.lineTo(side > 0 ? x + 52 : x + w - 52, y + h - 2);
    ctx.fill();
    ctx.textBaseline = 'top';
    font(ctx, 700, 30, DISPLAY);
    ctx.fillStyle = K.theme().accent;
    ctx.fillText(title, x + 22, y + 16, w - 40);
    if (text) {
      font(ctx, 400, 22, BODY);
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(text, x + 22, y + 62, w - 40);
    }
    ctx.restore();
  }

  function heading(ctx, s, t, x, y, maxW) {
    const c = s.copy;
    let top = y;
    if (c.eyebrow) {
      const p = prog(t, s.start + 0.15, 0.4);
      ctx.save();
      ctx.globalAlpha *= p;
      chip(ctx, c.eyebrow, x, top, { size: 20 });
      ctx.restore();
      top += 70;
    }
    return top + kinetic(ctx, c.title, x, top, maxW, t, s.start + 0.3, { align: 'left', sizes: [68, 60, 54, 48], maxLines: 2, stagger: 0.05 }) + 20;
  }

  // ── scene layouts (local 1920×1080 frame; steps may extend wider) ───────
  function sceneWidth(scene, copy) {
    if (scene.type === 'steps') return Math.max(W, 420 + ((copy.items || []).length) * 720);
    return W;
  }

  const SCENES = {
    hook(ctx, s, t, env) {
      const c = s.copy;
      const image = env.scene.variant === 2 ? env.images.get(env.scene.image) : null;
      const cx = image ? 700 : W / 2;
      if (c.eyebrow) {
        ctx.save();
        ctx.globalAlpha *= prog(t, s.start + 0.2, 0.4);
        chip(ctx, c.eyebrow, cx, 250, { align: 'center' });
        ctx.restore();
      }
      const h = kinetic(ctx, c.title, cx, 340, image ? 1100 : 1640, t, s.start + 0.4, { sizes: image ? [104, 92, 80] : [132, 116, 100, 88] });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, Math.max(s.start + 1.2, s.voStart + s.voDur * 0.45), 0.6));
        label(ctx, c.subtitle, cx, 380 + h, image ? 1000 : 1300, { align: 'center', sizes: [40, 36, 32] });
        ctx.restore();
      }
      if (image) {
        const p = easeOut(prog(t, s.start + 0.9, 1.0));
        const f = screenFit(image, 720, 620);
        ctx.save();
        ctx.translate(1520, 560 + (1 - p) * 500);
        ctx.rotate(4 * Math.PI / 180);
        screenCard(ctx, -f.w / 2, -f.h / 2, f.w, f.h, image, env.project.productUrl);
        ctx.restore();
      }
    },

    problem(ctx, s, t, env) {
      const c = s.copy;
      heading(ctx, s, t, 160, 170, 1500);
      const items = c.items || [];
      const spots = [[180, 470, -3], [760, 520, 2], [1340, 450, -2], [480, 740, 2.5]];
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const [x, y, rot] = spots[i % spots.length];
        const w = 540;
        const h = 220;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(rot * Math.PI / 180);
        const k = lerp(0.5, 1, easeBack(p));
        ctx.scale(k, k);
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        card(ctx, -w / 2, -h / 2, w, h, '#FFFFFF', 18, 8);
        ctx.fillStyle = DANGER_SOFT;
        ctx.beginPath();
        ctx.arc(-w / 2 + 64, -h / 2 + 64, 36, 0, Math.PI * 2);
        ctx.fill();
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'alert', -w / 2 + 64, -h / 2 + 64, 36, DANGER, 2.4);
        const th = K.textBlock(ctx, item.title, -w / 2 + 120, -h / 2 + 30, w - 150, { sizes: [32, 28, 26], weight: 700, family: DISPLAY, color: INK, maxLines: 2 });
        K.textBlock(ctx, item.text, -w / 2 + 120, -h / 2 + 40 + th, w - 150, { sizes: [24, 22, 20], color: INK2, maxLines: 2 });
        ctx.restore();
      });
    },

    reveal(ctx, s, t, env) {
      const c = s.copy;
      const image = env.images.get(env.scene.image);
      if (c.eyebrow) {
        ctx.save();
        ctx.globalAlpha *= prog(t, s.start + 0.2, 0.4);
        chip(ctx, c.eyebrow, W / 2, image ? 120 : 280, { align: 'center' });
        ctx.restore();
      }
      const h = kinetic(ctx, `*${(c.title || env.project.productName || '').replace(/\*/g, '')}*`, W / 2, image ? 200 : 360, 1600, t, s.start + 0.4, { sizes: image ? [110, 96, 84] : [170, 150, 130], maxLines: 1, stagger: 0.12 });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, Math.max(s.start + 1.0, s.voStart + s.voDur * 0.3), 0.6));
        label(ctx, c.subtitle, W / 2, (image ? 220 : 400) + h, 1400, { align: 'center', sizes: [40, 36, 32], maxLines: 2 });
        ctx.restore();
      }
      if (image) {
        const p = easeOut(prog(t, s.start + 0.8, 1.2));
        const f = screenFit(image, 1180, 600);
        screenCard(ctx, W / 2 - f.w / 2, 440 + (1 - p) * 700, f.w, f.h, image, env.project.productUrl);
      }
    },

    screenshot(ctx, s, t, env) {
      const c = s.copy;
      const scene = env.scene;
      const image = env.images.get(scene.image);
      const geo = screenshotGeometry(s, env);
      const p = easeOut(prog(t, s.start + 0.1, 0.8));
      ctx.save();
      ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
      ctx.translate(0, (1 - p) * 120);
      screenCard(ctx, geo.x, geo.y, geo.w, geo.h, image, env.project.productUrl);
      ctx.restore();
      if (c.title) {
        ctx.save();
        ctx.globalAlpha *= prog(t, s.start + 0.3, 0.4);
        chip(ctx, c.title, geo.x, geo.y - 74, { size: 24, upper: false, fill: K.theme().accent, color: '#1E0D57' });
        ctx.restore();
      }
      // the cursor visits each callout point on its cue word
      const items = c.items || [];
      const points = items.map((_, i) => geo.point(i)).filter(Boolean);
      if (!points.length) return;
      let cx = geo.x + geo.w + 120;
      let cy = geo.y + geo.h + 60;
      items.forEach((_, i) => {
        const pt = geo.point(i);
        if (!pt) return;
        const arrive = K.cueEntrance(s, i);
        const m = easeInOut(prog(t, arrive - 0.7, 0.7));
        cx = lerp(cx, pt.x, m);
        cy = lerp(cy, pt.y, m);
      });
      items.forEach((item, i) => {
        const pt = geo.point(i);
        if (!pt || !item.title) return;
        const bp = prog(t, K.cueEntrance(s, i) + 0.05, 0.45);
        if (bp > 0) {
          ctx.save();
          ctx.fillStyle = K.theme().accent;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 12 * easeBack(bp), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          bubble(ctx, item.title, item.text, pt.x, pt.y, pt.x < W / 2 + 200 ? 1 : -1, bp);
        }
      });
      const lastCue = K.cueEntrance(s, items.length - 1);
      const click = items.reduce((acc, _, i) => {
        const at = K.cueEntrance(s, i);
        return t >= at && t < at + 0.6 ? prog(t, at, 0.6) : acc;
      }, 0);
      if (t > K.cueEntrance(s, 0) - 1.2 && t < Math.max(lastCue + 1.5, s.voEnd)) cursor(ctx, cx, cy, click);
    },

    features(ctx, s, t, env) {
      const c = s.copy;
      const items = c.items || [];
      const image = env.images.get(env.scene.image);
      heading(ctx, s, t, 160, 170, 1600);
      if (image && env.scene.variant === 2) {
        const f = screenFit(image, 860, 520);
        const x = W / 2 - f.w / 2;
        const y = 430;
        const p = easeOut(prog(t, s.start + 0.4, 0.8));
        ctx.save();
        ctx.globalAlpha *= p;
        screenCard(ctx, x, y + (1 - p) * 200, f.w, f.h, image, env.project.productUrl);
        ctx.restore();
        const spots = [[120, 360], [W - 520, 360], [120, 700], [W - 520, 700]];
        items.forEach((item, i) => featureCard(ctx, s, t, env, item, i, spots[i % 4][0], spots[i % 4][1], 400, 200));
        return;
      }
      const n = Math.max(1, items.length);
      const cols = n === 4 ? 2 : n;
      const cw = cols === 2 ? 760 : 500;
      const ch = cols === 2 ? 220 : 300;
      const totalW = cols * cw + (cols - 1) * 60;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        featureCard(ctx, s, t, env, item, i, W / 2 - totalW / 2 + col * (cw + 60), 430 + row * (ch + 50), cw, ch);
      });
    },

    steps(ctx, s, t, env) {
      const c = s.copy;
      const items = c.items || [];
      heading(ctx, s, t, 160, 170, 1600);
      const y = 480;
      const xs = items.map((_, i) => 420 + i * 720);
      // path between steps, with packets running once a step is reached
      for (let i = 0; i < items.length - 1; i++) {
        const a = xs[i] + 170;
        const b = xs[i + 1] - 170;
        ctx.save();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.setLineDash([14, 14]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath();
        ctx.moveTo(a, y + 110);
        ctx.lineTo(b, y + 110);
        ctx.stroke();
        ctx.restore();
        const fill = easeInOut(prog(t, K.cueEntrance(s, i + 1) - 0.6, 0.6));
        if (fill > 0 && fill < 1) {
          ctx.fillStyle = K.theme().accent;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(lerp(a, b, fill), y + 110, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      let latest = -1;
      items.forEach((_, i) => { if (t >= K.cueEntrance(s, i)) latest = i; });
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        const x = xs[i] - 170;
        const current = i === latest;
        ctx.save();
        ctx.globalAlpha *= p > 0 ? clamp(p * 2, 0, 1) : 0.25;
        const k = p > 0 ? lerp(0.8, 1, easeBack(p)) : 0.9;
        ctx.translate(xs[i], y + 110);
        ctx.scale(k, k);
        ctx.translate(-xs[i], -(y + 110));
        card(ctx, x, y, 340, 220, current ? TITLE : '#FFFFFF', 22, current ? 12 : 8);
        font(ctx, 800, 30, DISPLAY);
        ctx.fillStyle = current ? K.theme().accent : TITLE;
        ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + 26, y + 22);
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 290, y + 44, 40, current ? '#FFFFFF' : INK, 2.4);
        K.textBlock(ctx, item.title, x + 26, y + 84, 290, { sizes: [34, 30, 26], weight: 700, family: DISPLAY, color: current ? '#FFFFFF' : INK, maxLines: 2 });
        ctx.restore();
        if (p > 0 && item.text) {
          ctx.save();
          ctx.globalAlpha *= easeOut(p);
          label(ctx, item.text, xs[i], y + 262, 360, { align: 'center', sizes: [26, 24, 22], maxLines: 3 });
          ctx.restore();
        }
      });
    },

    /** A flow the product runs: boxes in reading order, arrows drawn from one to the next on their cues. */
    diagram(ctx, s, t, env) {
      heading(ctx, s, t, 160, 170, 1600);
      const items = s.copy.items || [];
      const n = Math.max(1, items.length);
      const gap = 110;
      const bw = Math.min(360, (1600 - gap * (n - 1)) / n);
      const bh = 300;
      const total = n * bw + (n - 1) * gap;
      const x0 = W / 2 - total / 2;
      const y = 470;
      let latest = -1;
      items.forEach((_, i) => { if (t >= K.cueEntrance(s, i)) latest = i; });
      // arrows first, so the cards sit on top of them
      for (let i = 0; i < n - 1; i++) {
        const a = x0 + i * (bw + gap) + bw + 14;
        const b = x0 + (i + 1) * (bw + gap) - 18;
        const m = easeInOut(prog(t, K.cueEntrance(s, i + 1) - 0.45, 0.45));
        if (m <= 0) continue;
        const end = lerp(a, b, m);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a, y + bh / 2);
        ctx.lineTo(end, y + bh / 2);
        ctx.stroke();
        if (m > 0.9) {
          ctx.fillStyle = INK;
          ctx.beginPath();
          ctx.moveTo(end + 8, y + bh / 2);
          ctx.lineTo(end - 16, y + bh / 2 - 15);
          ctx.lineTo(end - 16, y + bh / 2 + 15);
          ctx.closePath();
          ctx.fill();
        }
      }
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const x = x0 + i * (bw + gap);
        const current = i === latest;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        const k = lerp(0.7, 1, easeBack(p));
        ctx.translate(x + bw / 2, y + bh / 2);
        ctx.scale(k, k);
        ctx.translate(-(x + bw / 2), -(y + bh / 2));
        card(ctx, x, y, bw, bh, current ? K.theme().soft : '#FFFFFF', 20, current ? 12 : 8);
        ctx.fillStyle = current ? K.theme().accent : '#F1EEFB';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + 58, y + 62, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 58, y + 62, 34, INK, 2.4);
        font(ctx, 800, 26, DISPLAY);
        ctx.fillStyle = TITLE;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + bw - 26, y + 62);
        ctx.textAlign = 'left';
        const th = K.textBlock(ctx, item.title, x + 28, y + 118, bw - 56, { sizes: [34, 30, 26], weight: 700, family: DISPLAY, color: INK, maxLines: 2 });
        K.textBlock(ctx, item.text, x + 28, y + 128 + th, bw - 56, { sizes: [24, 22, 20], color: INK2, maxLines: 3 });
        ctx.restore();
      });
    },

    team(ctx, s, t) {
      heading(ctx, s, t, 160, 170, 1600);
      const items = (s.copy.items || []).slice(0, 6);
      const n = Math.max(1, items.length);
      const cols = n <= 4 ? n : 3;
      const rows = Math.ceil(n / cols);
      const gap = 56;
      const cw = Math.min(rows > 1 ? 500 : 400, (1600 - gap * (cols - 1)) / cols);
      const ch = rows > 1 ? 210 : 400;
      let latest = -1;
      items.forEach((_, i) => { if (t >= K.cueEntrance(s, i)) latest = i; });
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 0.5);
        if (p <= 0) return;
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        const x = W / 2 - (inRow * cw + (inRow - 1) * gap) / 2 + (i % cols) * (cw + gap);
        const y = (rows > 1 ? 420 : 450) + row * (ch + 44);
        const current = i === latest;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 2, 0, 1);
        const k = lerp(0.6, 1, easeBack(p));
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.scale(k, k);
        ctx.rotate((i % 2 ? 1.5 : -1.5) * Math.PI / 180 * (1 - easeOut(p)));
        ctx.translate(-(x + cw / 2), -(y + ch / 2));
        card(ctx, x, y, cw, ch, current ? K.theme().soft : '#FFFFFF', 20, current ? 12 : 8);
        const r = rows > 1 ? 52 : 84;
        const ax = rows > 1 ? x + 34 + r : x + cw / 2;
        const ay = rows > 1 ? y + ch / 2 : y + 48 + r;
        K.avatar(ctx, ax, ay, r, item.title, { from: i ? '#F1EEFB' : K.theme().accent, to: i ? '#DCD4F7' : K.theme().accent, ink: INK });
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(ax, ay, r, 0, Math.PI * 2);
        ctx.stroke();
        if (rows > 1) {
          const tx = ax + r + 26;
          const tw = x + cw - 26 - tx;
          const th = K.textBlock(ctx, item.title, tx, y + 50, tw, { sizes: [30, 27, 24], weight: 700, family: DISPLAY, color: INK, maxLines: 2 });
          K.textBlock(ctx, item.text, tx, y + 60 + th, tw, { sizes: [22, 20, 18], color: INK2, maxLines: 3 });
        } else {
          const th = K.textBlock(ctx, item.title, x + cw / 2, ay + r + 30, cw - 48, { sizes: [34, 30, 26], weight: 700, family: DISPLAY, color: INK, maxLines: 2, align: 'center' });
          K.textBlock(ctx, item.text, x + cw / 2, ay + r + 42 + th, cw - 48, { sizes: [24, 22, 20], color: INK2, maxLines: 3, align: 'center' });
        }
        ctx.restore();
      });
    },

    planning(ctx, s, t) {
      const top = heading(ctx, s, t, 160, 150, 1600);
      if (s.copy.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 0.6, 0.5));
        label(ctx, s.copy.subtitle, 160, top - 6, 1600, { sizes: [30, 26], maxLines: 1 });
        ctx.restore();
      }
      const theme = K.theme();
      K.drawPlanning(ctx, s, t, { x: 160, y: Math.max(440, top + 80), w: 1600, h: 500, labelW: 440 }, {
        name: INK, nameLit: TITLE, muted: INK2, grid: '#D1CAF2', tick: INK2,
        bar: ['#FFFFFF', '#F1EEFB'], barLit: [theme.accent, theme.accent], onBar: INK, onLit: INK,
        ink: INK, radius: 14, milestone: TITLE, milestoneLit: theme.accent,
      });
    },

    stats(ctx, s, t) {
      const c = s.copy;
      heading(ctx, s, t, 160, 170, 1600);
      const items = c.items || [];
      const n = Math.max(1, items.length);
      const colW = 1600 / n;
      items.forEach((item, i) => {
        const p = prog(t, K.cueEntrance(s, i), 1.2);
        if (p <= 0) return;
        const x = 160 + i * colW;
        ctx.save();
        ctx.globalAlpha *= clamp(p * 3, 0, 1);
        font(ctx, 800, n === 1 ? 260 : n === 2 ? 200 : 160, DISPLAY);
        ctx.letterSpacing = '-6px';
        ctx.textBaseline = 'alphabetic';
        const value = K.countUp(item.value || item.title, p);
        const w = Math.min(colW - 60, ctx.measureText(value).width);
        ctx.fillStyle = K.theme().accent;
        ctx.fillRect(x - 8, 660 - 70, (w + 16) * easeInOut(prog(t, K.cueEntrance(s, i) + 0.4, 0.6)), 70);
        ctx.fillStyle = TITLE;
        ctx.fillText(value, x, 660, colW - 60);
        ctx.letterSpacing = '0px';
        label(ctx, item.title, x, 700, colW - 80, { sizes: [34, 30, 26], maxLines: 3 });
        ctx.restore();
      });
    },

    quote(ctx, s, t) {
      const c = s.copy;
      font(ctx, 800, 300, DISPLAY);
      ctx.fillStyle = K.theme().accent;
      ctx.textBaseline = 'top';
      ctx.globalAlpha *= prog(t, s.start + 0.2, 0.5);
      ctx.fillText('“', 150, 60);
      ctx.globalAlpha = 1;
      const words = (c.title || '').split(/\s+/).length || 1;
      const h = kinetic(ctx, c.title, 260, 300, 1460, t, s.start + 0.4, {
        align: 'left', sizes: [76, 68, 60, 54, 48], weight: 700, maxLines: 5, stagger: Math.min(0.12, (s.voDur * 0.8) / words),
      });
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.voStart + s.voDur * 0.7, 0.6));
        chip(ctx, c.subtitle, 260, 340 + h, { upper: false, size: 26 });
        ctx.restore();
      }
    },

    cta(ctx, s, t, env) {
      const c = s.copy;
      if (c.eyebrow) {
        ctx.save();
        ctx.globalAlpha *= prog(t, s.start + 0.2, 0.4);
        chip(ctx, c.eyebrow, W / 2, 190, { align: 'center' });
        ctx.restore();
      }
      const h = kinetic(ctx, c.title, W / 2, 280, 1640, t, s.start + 0.35, { sizes: [110, 96, 84, 72], maxLines: 2 });
      let y = 300 + h;
      if (c.subtitle) {
        ctx.save();
        ctx.globalAlpha *= easeOut(prog(t, s.start + 1.0, 0.6));
        y += label(ctx, c.subtitle, W / 2, y, 1300, { align: 'center', sizes: [38, 34, 30] }) + 50;
        ctx.restore();
      } else y += 40;
      const url = (env.project.productUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (url) {
        const t0 = s.start + 1.4;
        const p = prog(t, t0, 0.4);
        if (p > 0) {
          const typed = url.slice(0, Math.round(url.length * prog(t, t0 + 0.3, Math.min(1.4, url.length * 0.05))));
          font(ctx, 600, 40, BODY);
          const w = Math.max(700, ctx.measureText(url).width + 260);
          const x = W / 2 - w / 2;
          ctx.save();
          ctx.globalAlpha *= clamp(p * 2, 0, 1);
          card(ctx, x, y, w, 96, '#FFFFFF', 48, 8);
          font(ctx, 600, 40, BODY);
          ctx.fillStyle = INK;
          ctx.textBaseline = 'middle';
          ctx.fillText(typed, x + 44, y + 50);
          if (typed.length < url.length && Math.floor(t * 3) % 2 === 0) ctx.fillRect(x + 48 + ctx.measureText(typed).width, y + 28, 4, 44);
          ctx.fillStyle = K.theme().accent;
          K.roundRect(ctx, x + w - 170, y + 14, 150, 68, 34);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#1E0D57';
          font(ctx, 700, 30, DISPLAY);
          ctx.fillText('→', x + w - 110, y + 50);
          ctx.restore();
          const clickAt = t0 + 0.3 + Math.min(1.4, url.length * 0.05) + 0.4;
          const arrive = easeInOut(prog(t, clickAt - 0.8, 0.8));
          if (t > clickAt - 1.2) cursor(ctx, lerp(W / 2 + w / 2 + 160, x + w - 90, arrive), lerp(y + 220, y + 50, arrive), prog(t, clickAt, 0.6));
        }
      }
    },
  };

  function featureCard(ctx, s, t, env, item, i, x, y, w, h) {
    const p = prog(t, K.cueEntrance(s, i), 0.5);
    if (p <= 0) return;
    let latest = -1;
    (s.copy.items || []).forEach((_, j) => { if (t >= K.cueEntrance(s, j)) latest = j; });
    const current = i === latest;
    ctx.save();
    const k = lerp(0.6, 1, easeBack(p));
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(k, k);
    ctx.rotate((i % 2 ? 1.5 : -1.5) * Math.PI / 180 * (1 - easeOut(p)));
    ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.globalAlpha *= clamp(p * 2, 0, 1);
    card(ctx, x, y, w, h, current ? K.theme().soft : '#FFFFFF', 20, current ? 12 : 8);
    ctx.fillStyle = K.theme().accent;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 62, y + 62, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    VM.drawIcon(ctx, (env.scene.icons || [])[i] || 'spark', x + 62, y + 62, 36, INK, 2.4);
    const th = K.textBlock(ctx, item.title, x + 120, y + 34, w - 150, { sizes: [32, 28, 26], weight: 700, family: DISPLAY, color: INK, maxLines: 2 });
    K.textBlock(ctx, item.text, h > 240 ? x + 34 : x + 120, h > 240 ? y + 130 : y + 44 + th, h > 240 ? w - 68 : w - 150, { sizes: [24, 22, 20], color: INK2, maxLines: 3 });
    ctx.restore();
  }

  function screenshotGeometry(s, env) {
    const image = env.images.get(env.scene.image);
    const f = screenFit(image, 1500, 780);
    const x = W / 2 - f.w / 2;
    const y = 190 + (820 - f.h) / 2;
    return {
      x, y, w: f.w, h: f.h,
      point(i) {
        const pt = (env.scene.points || [])[i];
        return pt ? { x: x + pt.x * f.w, y: y + 49 + pt.y * (f.h - 49) } : null;
      },
    };
  }

  // ── camera ───────────────────────────────────────────────────────────────
  /** Camera (centre in scene-local pixels, zoom) for one scene at time t. */
  function cameraFor(s, t, env) {
    const span = Math.max(0.1, s.end - s.start);
    const cam = { x: W / 2, y: H / 2, z: lerp(0.93, 1.0, easeInOut(prog(t, s.start, span))) };
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
        toward(K.cueEntrance(s, i) - 0.6, lerp(W / 2, pt.x, 0.55), lerp(H / 2, pt.y - 60, 0.55), 1.22);
      });
      if (!items.length && env.scene.focus) {
        const f = env.scene.focus;
        toward(s.voStart + s.voDur * 0.3, geo.x + (f.x + f.w / 2) * geo.w, geo.y + 49 + (f.y + f.h / 2) * (geo.h - 49), 1.3, 1.4);
      }
      toward(s.end - 1.0, W / 2, H / 2, 1.0, 0.9);
    } else if (s.scene.type === 'steps') {
      items.forEach((_, i) => toward(K.cueEntrance(s, i) - 0.5, Math.max(W / 2, 420 + i * 720), H / 2, 1.0, 0.8));
    } else if (s.scene.type === 'features' || s.scene.type === 'problem') {
      toward(s.voStart, W / 2, H / 2 + 20, 0.98, 1.5);
    }
    return cam;
  }

  // ── world ────────────────────────────────────────────────────────────────
  function anchors(timeline) {
    if (timeline._anchors) return timeline._anchors;
    let x = 0;
    timeline._anchors = timeline.scenes.map((s, i) => {
      const anchor = { x, y: i % 2 ? 320 : -320 };
      x += sceneWidth(s.scene, s.copy) + GAP;
      return anchor;
    });
    return timeline._anchors;
  }

  function paper(ctx, view) {
    ctx.fillStyle = PAPERS[K.theme().paper] || PAPERS.white;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.fillStyle = 'rgba(129,124,149,0.22)';
    const step = 56;
    for (let y = Math.floor(view.y0 / step) * step; y < view.y1; y += step) {
      for (let x = Math.floor(view.x0 / step) * step; x < view.x1; x += step) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  function chrome(ctx, timeline, t, env) {
    const project = env.project;
    ctx.save();
    K.brandMark(ctx, project, 72, 50, 28, false);
    ctx.restore();
    if (project.productName) {
      ctx.save();
      font(ctx, 700, 20, BODY);
      ctx.letterSpacing = '2px';
      const text = project.productName.toUpperCase();
      const w = ctx.measureText(text).width + 36;
      ctx.restore();
      ctx.save();
      chip(ctx, project.productName, W - 72 - w, 46, { size: 20 });
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(69,29,199,0.14)';
    ctx.fillRect(0, H - 8, W, 8);
    ctx.fillStyle = TITLE;
    ctx.fillRect(0, H - 8, W * clamp(t / timeline.duration, 0, 1), 8);
    ctx.fillStyle = K.theme().accent;
    ctx.fillRect(W * clamp(t / timeline.duration, 0, 1) - 8, H - 8, 8, 8);
  }

  function captions(ctx, s, t) {
    const chunk = s.captions.find(c => t >= c.start - 0.05 && t <= c.end + 0.35);
    if (!chunk || t > s.voEnd + 0.35) return;
    ctx.save();
    font(ctx, 600, 38, BODY);
    ctx.textBaseline = 'middle';
    const space = ctx.measureText(' ').width;
    const words = chunk.tokens.map(token => ({ token, w: ctx.measureText(token.token).width }));
    const lines = [];
    let line = [];
    let width = 0;
    words.forEach(word => {
      if (line.length && width + space + word.w > 1460) { lines.push({ line, width }); line = []; width = 0; }
      word.x = line.length ? width + space : 0;
      width = line.length ? width + space + word.w : word.w;
      line.push(word);
    });
    if (line.length) lines.push({ line, width });
    const boxW = Math.max(...lines.map(l => l.width)) + 60;
    const boxH = lines.length * 50 + 30;
    const y0 = H - 62 - boxH;
    ctx.globalAlpha = Math.min(prog(t, chunk.start - 0.05, 0.15), 1 - prog(t, chunk.end + 0.2, 0.15));
    card(ctx, W / 2 - boxW / 2, y0, boxW, boxH, '#FFFFFF', 16, 6);
    const th = K.theme();
    lines.forEach((l, li) => {
      const x0 = W / 2 - l.width / 2;
      l.line.forEach(word => {
        const cy = y0 + 40 + li * 50;
        const speaking = t >= word.token.start && t <= word.token.end + 0.08;
        if (speaking) {
          ctx.fillStyle = th.accent;
          ctx.fillRect(x0 + word.x - 5, cy - 22, word.w + 10, 44);
        }
        ctx.fillStyle = t >= word.token.start ? '#16121F' : 'rgba(22,18,31,0.4)';
        ctx.fillText(word.token.token, x0 + word.x, cy + 1);
      });
    });
    ctx.restore();
  }

  VM.renderProductFrame = function (ctx, timeline, t, env) {
    const scenes = timeline.scenes;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (!scenes.length) {
      ctx.fillStyle = PAPERS.white;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const time = clamp(t, 0, timeline.duration - 0.001);
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
      const m = easeInOut(prog(time, next.start, timeline.trans || 0.9));
      const b = worldCam(next);
      // travel: pull back mid-way, like a camera move between two set-ups
      cam = { x: lerp(cam.x, b.x, m), y: lerp(cam.y, b.y, m), z: lerp(cam.z, b.z, m) * (1 - 0.18 * Math.sin(Math.PI * m)) };
    }
    const view = { x0: cam.x - W / 2 / cam.z, y0: cam.y - H / 2 / cam.z, x1: cam.x + W / 2 / cam.z, y1: cam.y + H / 2 / cam.z };
    ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
    paper(ctx, view);
    // every scene near the view: the previous one stays in place as we leave it
    scenes.forEach(s => {
      const a = pos[s.index];
      const width = sceneWidth(s.scene, s.copy);
      if (a.x > view.x1 || a.x + width < view.x0 || a.y > view.y1 || a.y + H < view.y0) return;
      const t0 = Math.min(time, s.end);
      if (time < s.start - (timeline.trans || 0.9)) return;
      const draw = VM.pickScene(SCENES, s.scene.type);
      ctx.save();
      ctx.translate(a.x, a.y);
      draw(ctx, s, Math.max(t0, s.start), Object.assign({ scene: s.scene }, env));
      ctx.restore();
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const last = active[active.length - 1];
    const current = active.length > 1 && prog(time, last.start, timeline.trans || 0.9) < 0.5 ? active[0] : last;
    chrome(ctx, timeline, time, env);
    if (env.captions) {
      const speaking = active.find(s => time >= s.voStart && time <= s.voEnd + 0.4) || current;
      if (env.captionStyle === 'bold') captions(ctx, speaking, time);
      else VM.subtleCaptions(ctx, speaking, time, false);
    }
    // closing card
    const final = scenes[scenes.length - 1];
    const out = prog(time, final.end - 0.7, 0.7);
    if (out > 0) {
      ctx.globalAlpha = out;
      const g = ctx.createRadialGradient(W * 0.25, H * 0.15, 0, W * 0.25, H * 0.15, W * 1.15);
      const stops = K.theme().surface;
      g.addColorStop(0, stops[0]);
      g.addColorStop(0.38, stops[1]);
      g.addColorStop(1, stops[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (env.project.brand && /wavestone/i.test(env.project.brand)) K.drawLogo(ctx, 'lockup', true, W / 2, H / 2 - 150, 300, 'center');
      else if (env.project.brand) {
        font(ctx, 700, 96, DISPLAY);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(env.project.brand, W / 2, H / 2);
      }
    }
    ctx.restore();
  };
})();
