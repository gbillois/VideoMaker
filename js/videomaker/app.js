// Video Maker page: source (repository, brief, screenshots) → script written by
// the author's AI provider → timeline editor with live preview → MP4s made in the browser.
// Everything runs in this page: the "API" is js/videomaker/api.js, called with the
// author's own keys (AI settings, top right).
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  const LANG_LABELS = { 'fr-FR': 'Français', 'en-US': 'English', 'de-DE': 'Deutsch' };
  const TYPE_LABELS = {
    hook: 'Hook', problem: 'Problem', reveal: 'Reveal', screenshot: 'Annotated screenshot', features: 'Benefits',
    steps: 'Steps', stats: 'Key figures', quote: 'Quote', team: 'Team', planning: 'Planning', cta: 'Call to action',
    emblem: 'Emblem (3D)', keys: 'Keys', moment: 'Moment', diagram: 'Diagram', compare: 'Before / after',
  };
  const VARIANT_LABELS = {
    hook: ['Title on the left', 'Centred title', 'Title + screenshot'],
    problem: ['Cards', 'Numbered list'],
    reveal: ['Standard'],
    screenshot: ['Full screen + zoom', 'Screenshot + numbered list'],
    features: ['Cards', '2×2 grid', 'List + screenshot'],
    steps: ['Horizontal path', 'Vertical timeline (+ screenshot)'],
    stats: ['Figures in a row', 'Hero figure'],
    quote: ['Standard'],
    team: ['Portraits'],
    planning: ['Gantt chart'],
    cta: ['Left-aligned', 'Centred'],
    emblem: ['Standard'], keys: ['Standard'], moment: ['Standard'], diagram: ['Standard'], compare: ['Standard'],
  };
  const ITEM_RANGE = {
    hook: [0, 0], problem: [2, 4], reveal: [0, 0], screenshot: [0, 3], features: [3, 4], steps: [3, 4], stats: [1, 3], quote: [0, 0], team: [2, 6], planning: [2, 5], cta: [0, 0],
    emblem: [0, 0], keys: [1, 4], moment: [0, 0], diagram: [3, 5], compare: [2, 2],
  };
  const FIELDS = {
    hook: ['eyebrow', 'title', 'subtitle'], problem: ['eyebrow', 'title'], reveal: ['eyebrow', 'title', 'subtitle'],
    screenshot: ['eyebrow', 'title'], features: ['eyebrow', 'title'], steps: ['eyebrow', 'title'], stats: ['eyebrow', 'title'],
    quote: ['title', 'subtitle'], team: ['eyebrow', 'title'], planning: ['eyebrow', 'title', 'subtitle'], cta: ['eyebrow', 'title', 'subtitle'],
    emblem: ['eyebrow', 'title', 'subtitle'], keys: ['eyebrow', 'title', 'subtitle'], moment: ['eyebrow', 'title', 'subtitle'],
    diagram: ['eyebrow', 'title'], compare: ['eyebrow', 'title'],
  };
  const FIELD_LABELS = { eyebrow: 'Eyebrow', title: 'Title (*word* = accent, Return = new line)', subtitle: 'Subtitle' };
  const IMAGE_TYPES = new Set(['hook', 'reveal', 'screenshot', 'features', 'steps']);
  const ICON_TYPES = new Set(['problem', 'features', 'steps', 'diagram']);
  const MAX_SCRIPT_IMAGES = 6;
  // Free text and documents: what the page keeps, and what the script request can carry.
  const MAX_SOURCE_TEXT = 80_000;
  const MAX_CONTEXT = 150_000;

  const state = {
    repo: '',
    brief: { productName: '', productUrl: '', audience: '', tone: '', duration: 60, brand: 'Wavestone', languages: ['fr-FR'], notes: '', engine: '', style: 'product', marketing: false, sourceText: '', purpose: 'pitch', pace: 'fast', price: false },
    analysis: null,
    assets: [],
    project: null,
    settings: { lang: 'fr-FR', voices: {}, rate: '+5%', music: 'uplifting', musicLevel: 0.6, captions: true, captionsBold: false, defaultsVersion: 2 },
    selected: 0,
  };
  const runtime = {
    config: null, images: new Map(), takes: {}, soundtrack: null, timeline: null,
    player: { playing: false, t: 0, audio: null, source: null, startAt: 0, clockStart: 0, raf: 0 },
    placing: -1, busy: false,
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'value') node.value = value;
      else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = true;
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child); });
    return node;
  }

  function setStatus(id, text, kind) {
    const node = $(id);
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('is-error', kind === 'error');
    node.classList.toggle('is-ok', kind === 'ok');
  }

  function formatTime(t) {
    const s = Math.max(0, Math.round(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function slug(text) {
    return String(text || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
  }

  async function postJson(path, body) {
    const api = await VM.apiReady;
    return await api.call(path, body);
  }

  async function errorOf(response) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : body.error && body.error.message;
    return message || `Error ${response.status}`;
  }

  // ── persistence (this browser only) ────────────────────────────────────
  const DB = { name: 'videomaker', store: 'state' };
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB.store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function loadState() {
    try {
      const db = await openDb();
      return await new Promise(resolve => {
        const request = db.transaction(DB.store).objectStore(DB.store).get('current');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch { return null; }
  }
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const db = await openDb();
        db.transaction(DB.store, 'readwrite').objectStore(DB.store).put(JSON.parse(JSON.stringify(state)), 'current');
      } catch { /* private mode: the session still works */ }
    }, 600);
  }

  // ── assets ───────────────────────────────────────────────────────────────
  function nextAssetId() {
    const used = state.assets.map(a => Number(a.id.replace('img', '')) || 0);
    return `img${(used.length ? Math.max(...used) : 0) + 1}`;
  }

  async function scaledDataUrl(source, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height };
  }

  // Decoded through <img>: the site CSP lets images load data: URLs, not fetch().
  async function bitmapFromDataUrl(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return await createImageBitmap(img);
  }

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('unreadable file'));
      reader.readAsDataURL(blob);
    });
  }

  /** Decodes any picture the browser can show (HEIC from an iPhone included). */
  async function decodeImage(blob) {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fallback through <img> and a data: URL (the site CSP allows data: images, not blob:).
      const img = new Image();
      img.src = await readAsDataUrl(blob);
      await img.decode();
      return img;
    }
  }

  async function addAsset(blob, name, source, selected) {
    // A GIF or a short video becomes an animated picture. A GIF the browser cannot
    // animate, or one over the clip limit, still works as its first frame.
    let clip = null;
    const kind = await VM.clipKind(blob);
    if (kind === 'video' && blob.size > VM.CLIP_MAX_BYTES) throw new Error('video over 8 MB');
    if (kind === 'video' && VM.clips.size >= VM.CLIP_MAX) throw new Error(`${VM.CLIP_MAX} animated pictures at most`);
    if (kind && VM.clips.size < VM.CLIP_MAX && blob.size <= VM.CLIP_MAX_BYTES) {
      try {
        clip = await VM.decodeClip(blob, kind);
      } catch (error) {
        if (kind === 'video') throw error;
      }
    }
    const bitmap = clip ? clip.frames[0] : await decodeImage(blob);
    if (bitmap.width < 64 || bitmap.height < 64) throw new Error('picture too small (under 64 px)');
    const scaled = await scaledDataUrl(bitmap, 1920, 0.9);
    const asset = { id: nextAssetId(), name: String(name || 'capture').slice(0, 80), source, selected: !!selected, ...scaled };
    if (clip) {
      asset.clip = VM.packClip(clip);
      asset.clip.source = await VM.clipSource(blob, kind);
    }
    state.assets.push(asset);
    runtime.images.set(asset.id, clip ? VM.registerClip(asset.id, clip) : await bitmapFromDataUrl(asset.dataUrl));
    renderAssets();
    scheduleSave();
    return asset;
  }

  function renderAssets() {
    const list = $('assets');
    list.replaceChildren();
    if (!state.assets.length) {
      list.append(el('p', { class: 'vm-empty', text: 'No pictures yet. Analyse a repository, or upload or paste screenshots, GIFs or short clips of the platform.' }));
    }
    const selectedCount = state.assets.filter(a => a.selected).length;
    state.assets.forEach(asset => {
      const toggle = el('input', {
        type: 'checkbox', checked: asset.selected, title: 'Show to the AI',
        onchange: event => {
          if (event.target.checked && state.assets.filter(a => a.selected).length >= MAX_SCRIPT_IMAGES) {
            event.target.checked = false;
            setStatus('assets-status', `${MAX_SCRIPT_IMAGES} pictures at most for the AI.`, 'error');
            return;
          }
          asset.selected = event.target.checked;
          renderAssets();
          scheduleSave();
        },
      });
      list.append(el('div', { class: `vm-asset${asset.selected ? ' is-selected' : ''}` },
        el('img', { src: asset.dataUrl, alt: asset.name }),
        el('span', { class: 'vm-asset__id', text: asset.id }),
        asset.clip ? el('span', { class: 'vm-asset__kind', text: `${asset.clip.kind === 'gif' ? 'GIF' : 'VIDEO'} ${asset.clip.duration.toFixed(1)}s` }) : null,
        asset.clip && asset.clip.source ? trimControls(asset) : null,
        el('div', { class: 'vm-asset__bar' },
          toggle,
          el('span', { text: asset.name, title: `${asset.name} (${asset.width}×${asset.height})` }),
          el('button', {
            class: 'vm-icon-btn', type: 'button', title: 'Delete', text: '✕',
            onclick: () => {
              state.assets = state.assets.filter(a => a !== asset);
              runtime.images.delete(asset.id);
              VM.releaseClip(asset.id);
              if (state.project) state.project.scenes.forEach(scene => { if (scene.image === asset.id) scene.image = null; });
              renderAssets();
              scheduleSave();
            },
          }))));
    });
    setStatus('assets-status', state.assets.length ? `${state.assets.length} picture(s), ${selectedCount} shown to the AI.` : '');
  }

  /** Start and length of the part of a GIF or clip that plays (6 seconds at most). */
  function trimControls(asset) {
    const clip = asset.clip;
    const trim = clip.trim || { start: 0, length: clip.duration };
    const start = el('input', { type: 'number', min: '0', step: '0.1', value: trim.start.toFixed(1), 'aria-label': 'Start of the clip in seconds' });
    const length = el('input', { type: 'number', min: '0.5', max: String(VM.CLIP_MAX_SECONDS), step: '0.1', value: trim.length.toFixed(1), 'aria-label': 'Length of the clip in seconds' });
    return el('div', { class: 'vm-asset__trim' },
      el('label', {}, 'Start', start),
      el('label', {}, 'Length', length),
      el('button', {
        class: 'vm-btn vm-btn--outline vm-btn--sm', type: 'button', text: 'Trim',
        title: `Keep ${VM.CLIP_MAX_SECONDS} s at most, out of ${clip.sourceDuration.toFixed(1)} s`,
        onclick: () => trimAsset(asset, Number(start.value), Number(length.value)),
      }),
      el('small', { text: `of ${clip.sourceDuration.toFixed(1)} s` }));
  }

  /** Samples the clip again from its original file with a new start and length. */
  async function trimAsset(asset, start, length) {
    if (!Number.isFinite(start) || !Number.isFinite(length) || start < 0 || length < 0.5) {
      setStatus('assets-status', 'Start must be 0 or more and length at least 0.5 s.', 'error');
      return;
    }
    setStatus('assets-status', 'Cutting the clip…');
    try {
      const source = asset.clip.source;
      const decoded = await VM.decodeClip(VM.clipBlob(source), asset.clip.kind, { start, length });
      if (!decoded) throw new Error('the clip could not be read again');
      const scaled = await scaledDataUrl(decoded.frames[0], 1920, 0.9);
      VM.releaseClip(asset.id);
      Object.assign(asset, scaled, { clip: Object.assign(VM.packClip(decoded), { source }) });
      runtime.images.set(asset.id, VM.registerClip(asset.id, decoded));
      setStatus('assets-status', '');
      renderAssets();
      changed(false);
    } catch (error) {
      setStatus('assets-status', `Could not trim: ${error && error.message ? error.message : 'unreadable clip'}.`, 'error');
    }
  }

  async function fetchRepoImage(candidate) {
    const response = await postJson('image', { url: candidate.url, token: $('token').value.trim() || undefined });
    if (!response.ok) return null;
    const blob = await response.blob();
    const name = candidate.alt || candidate.url.split('/').pop().split('?')[0];
    return await addAsset(blob, name, candidate.source, false);
  }

  // ── progress panel ───────────────────────────────────────────────────────
  /**
   * A step-by-step progress bar with elapsed time and, when known, time left.
   * steps: [{ key, label, weight, tau? }]; `tau` (seconds) makes a step creep
   * forward on its own while nothing measurable comes back (the model thinking).
   */
  function progressPanel(host, title, steps) {
    const started = performance.now();
    const total = steps.reduce((sum, step) => sum + step.weight, 0);
    let index = -1;
    let ratio = 0;
    let stepStart = started;
    let remaining = null;
    let state = 'running';
    const fill = el('div', { class: 'vm-pp__fill' });
    const pct = el('span', { class: 'vm-pp__pct', text: '0 %' });
    const clock = el('span', { class: 'vm-pp__clock', text: '0:00' });
    const detail = el('p', { class: 'vm-pp__detail' });
    const items = steps.map(step => el('li', { class: 'vm-pp__step', text: step.label }));
    const node = el('div', { class: 'vm-pp', role: 'progressbar', 'aria-label': title, 'aria-valuemin': '0', 'aria-valuemax': '100' },
      el('div', { class: 'vm-pp__head' }, el('strong', { text: title }), el('span', {}, clock, ' · ', pct)),
      el('div', { class: 'vm-pp__bar' }, fill),
      el('ol', { class: 'vm-pp__steps' }, items),
      detail);
    host.replaceChildren(node);
    const overall = () => {
      if (index < 0) return 0;
      let done = 0;
      for (let i = 0; i < index; i++) done += steps[i].weight;
      return (done + steps[index].weight * ratio) / total;
    };
    const paint = () => {
      const now = performance.now();
      const step = steps[index];
      if (state === 'running' && step && step.tau) {
        ratio = Math.max(ratio, 0.95 * (1 - Math.exp(-(now - stepStart) / 1000 / step.tau)));
      }
      const value = state === 'done' ? 1 : Math.min(0.99, overall());
      fill.style.width = `${(value * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(value * 100)} %`;
      node.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      clock.textContent = `${formatTime((now - started) / 1000)}${remaining !== null && state === 'running' ? ` · encore ~${formatTime(remaining)}` : ''}`;
      items.forEach((item, i) => {
        item.className = `vm-pp__step${state === 'done' || i < index ? ' is-done' : i === index ? ' is-active' : ''}`;
      });
    };
    const timer = setInterval(paint, 500);
    const stopTimer = () => clearInterval(timer);
    paint();
    return {
      /** Moves to step `key` (restart: go back to its beginning, e.g. a retry). */
      step(key, message, restart) {
        const i = steps.findIndex(step => step.key === key);
        if (i >= 0 && (i !== index || restart)) {
          index = i;
          ratio = 0;
          stepStart = performance.now();
          remaining = null;
        }
        if (message) detail.textContent = message;
        paint();
      },
      /** Progress inside the current step (0..1), with optional seconds left. */
      set(value, message, secondsLeft) {
        ratio = Math.max(ratio, Math.min(1, value));
        remaining = secondsLeft === undefined ? null : secondsLeft;
        if (message) detail.textContent = message;
        paint();
      },
      done(message) {
        state = 'done';
        remaining = null;
        if (message) detail.textContent = message;
        paint();
        stopTimer();
        node.classList.add('is-done');
      },
      fail(message) {
        state = 'failed';
        remaining = null;
        detail.textContent = message;
        paint();
        stopTimer();
        node.classList.add('is-error');
      },
    };
  }

  // ── source step ──────────────────────────────────────────────────────────
  function readBrief() {
    state.repo = $('repo').value.trim();
    state.brief.productName = $('product-name').value.trim();
    state.brief.productUrl = $('product-url').value.trim();
    state.brief.audience = $('audience').value.trim();
    state.brief.tone = $('tone').value.trim();
    state.brief.duration = Number($('duration').value) || 60;
    state.brief.brand = $('brand').value.trim() || 'Wavestone';
    state.brief.notes = $('notes').value.trim();
    state.brief.sourceText = $('source-text').value.trim();
    state.brief.style = $('style-brief').value;
    state.brief.marketing = !!($('marketing') && $('marketing').checked);
    state.brief.purpose = $('purpose').value;
    state.brief.pace = $('pace').value;
    state.brief.price = $('price').checked;
    showPurpose();
    syncSegments();
    state.brief.languages = [...document.querySelectorAll('#languages input:checked')].map(input => input.value);
    scheduleSave();
  }

  function writeBrief() {
    $('repo').value = state.repo;
    $('product-name').value = state.brief.productName;
    $('product-url').value = state.brief.productUrl;
    $('audience').value = state.brief.audience;
    $('tone').value = state.brief.tone;
    $('duration').value = String(state.brief.duration);
    $('brand').value = state.brief.brand;
    $('notes').value = state.brief.notes;
    $('source-text').value = state.brief.sourceText || '';
    document.querySelectorAll('#languages input').forEach(input => { input.checked = state.brief.languages.includes(input.value); });
    $('style-brief').value = state.brief.style || 'product';
    if ($('marketing')) $('marketing').checked = !!state.brief.marketing;
    $('purpose').value = state.brief.purpose || 'pitch';
    if (state.repo) disclose('github', true);
    $('pace').value = state.brief.pace || (state.brief.purpose && state.brief.purpose !== 'pitch' ? 'standard' : 'fast');
    $('price').checked = !!state.brief.price;
    showPurpose();
    syncSegments();
  }

  /** Labels and placeholders that follow the purpose; Marketing ++ only applies to a product pitch. */
  const PURPOSE_HINTS = {
    pitch: { name: 'Product name', example: 'e.g. CrisisMaker', points: 'Key strengths to feature', audience: 'e.g. CISOs and business leaders', tone: 'e.g. confident, warm, concrete' },
    proposal: { name: 'Client and proposal', example: 'e.g. Acme: Zero Trust roadmap', points: 'Key messages to feature', audience: 'e.g. the client\'s executive committee', tone: 'e.g. confident, client-centred, precise' },
    project: { name: 'Project name', example: 'e.g. Zero Trust programme', points: 'Key points to feature', audience: 'e.g. sponsors, stakeholders and teams', tone: 'e.g. clear, confident, concrete' },
    debrief: { name: 'Exercise name', example: 'e.g. Ransomware exercise, June 2026', points: 'Key lessons to feature', audience: 'e.g. participants and the executive committee', tone: 'e.g. factual, constructive, calm' },
    event: { name: 'Event name', example: 'e.g. Les Assises, October 2026', points: 'Key messages to feature (announcement, demos, stand, team)', audience: 'e.g. customers, prospects and partners', tone: 'e.g. warm, upbeat, inviting' },
    neutral: { name: 'Title or subject', example: 'e.g. Our 2026 security roadmap', points: 'Key points to feature', audience: 'e.g. anyone discovering the subject', tone: 'e.g. clear, natural' },
  };
  function showPurpose() {
    const purpose = PURPOSE_HINTS[$('purpose').value] ? $('purpose').value : 'pitch';
    const hints = PURPOSE_HINTS[purpose];
    $('product-name-label').textContent = hints.name;
    $('product-name').placeholder = hints.example;
    $('notes-label').textContent = hints.points;
    $('audience').placeholder = hints.audience;
    $('tone').placeholder = hints.tone;
    $('marketing').disabled = purpose !== 'pitch';
    $('marketing-box').classList.toggle('is-disabled', purpose !== 'pitch');
    $('marketing-box').title = purpose === 'pitch' ? '' : 'Marketing ++ only applies to a product pitch.';
    $('price-box').hidden = purpose !== 'proposal';
  }

  async function analyze() {
    readBrief();
    if (!state.repo) return setStatus('analyze-status', 'Enter a repository.', 'error');
    $('analyze').disabled = true;
    setStatus('analyze-status', 'Reading the repository…');
    try {
      const response = await postJson('analyze', { repo: state.repo, token: $('token').value.trim() || undefined });
      if (!response.ok) throw new Error(await errorOf(response));
      const analysis = await response.json();
      state.analysis = {
        name: analysis.name, owner: analysis.owner, repo: analysis.repo, url: analysis.url, description: analysis.description,
        homepage: analysis.homepage, context: analysis.context, isPrivate: analysis.isPrivate,
      };
      if (!state.brief.productName) state.brief.productName = analysis.name;
      if (!state.brief.productUrl && analysis.homepage) state.brief.productUrl = analysis.homepage;
      writeBrief();
      setStatus('analyze-status', `${analysis.owner}/${analysis.repo} read${analysis.description ? `: ${analysis.description}` : ''}. Looking for pictures…`, 'ok');
      const known = new Set(state.assets.map(a => a.name));
      const candidates = (analysis.images || []).filter(c => !known.has(c.alt)).slice(0, 12);
      let added = 0;
      for (const candidate of candidates) {
        const asset = await fetchRepoImage(candidate).catch(() => null);
        if (asset) {
          added++;
          if (state.assets.filter(a => a.selected).length < 4) asset.selected = true;
        }
      }
      renderAssets();
      setStatus('analyze-status', `${analysis.owner}/${analysis.repo} read. ${added} picture(s) found in the repository.`, 'ok');
      scheduleSave();
    } catch (error) {
      setStatus('analyze-status', error.message, 'error');
    } finally {
      $('analyze').disabled = false;
    }
  }

  /** Reads PPTX or DOCX files into the free-text box; Office pictures join the screenshots. */
  async function addDocuments(files) {
    readBrief();
    const failures = [];
    let pictures = 0;
    for (const file of files) {
      const kind = VM.documentKind(file);
      setStatus('source-status', `Reading ${file.name}…`);
      try {
        if (!kind) throw new Error('only PDF, PPTX and DOCX files are supported');
        let text;
        if (kind === 'pdf') {
          text = await VM.readPdf(file);
        } else {
          const doc = await VM.readOfficeDocument(file);
          text = doc.text;
          for (const picture of doc.pictures) {
            const asset = await addAsset(picture.blob, `${file.name} · ${picture.name}`, 'document',
              state.assets.filter(a => a.selected).length < 4).catch(() => null);
            if (asset) pictures++;
          }
        }
        if (!text || !text.trim()) throw new Error('no text found');
        const current = state.brief.sourceText;
        state.brief.sourceText = `${current ? `${current}\n\n` : ''}## ${file.name}\n${text.trim()}`;
      } catch (error) {
        failures.push(`${file.name} (${error && error.message ? error.message : 'unreadable'})`);
      }
    }
    const cut = state.brief.sourceText.length > MAX_SOURCE_TEXT;
    state.brief.sourceText = state.brief.sourceText.slice(0, MAX_SOURCE_TEXT);
    writeBrief();
    scheduleSave();
    const done = `${files.length - failures.length} document(s) added to the text${pictures ? `, ${pictures} picture(s) to the screenshots` : ''}.`;
    if (failures.length) setStatus('source-status', `${done} Could not read: ${failures.join(', ')}.`, 'error');
    else setStatus('source-status', cut ? `${done} The text was cut at ${MAX_SOURCE_TEXT.toLocaleString('en')} characters.` : done, 'ok');
  }

  /** The script's material: the repository (if analysed) and the author's text, within the request limit. */
  function sourceContext() {
    const text = (state.brief.sourceText || '').slice(0, MAX_SOURCE_TEXT);
    const authored = text ? `## Text and documents supplied by the author\n${text}` : '';
    const repo = state.analysis ? state.analysis.context.slice(0, MAX_CONTEXT - authored.length - 10) : '';
    return [repo, authored].filter(Boolean).join('\n\n');
  }

  function log(message, kind) {
    const line = el('div', { class: kind === 'error' ? 'is-error' : '', text: message });
    $('generate-log').append(line);
  }

  async function generate() {
    readBrief();
    const languages = state.brief.languages;
    $('generate-log').replaceChildren();
    if (!languages.length) return log('Pick at least one language.', 'error');
    if (!state.analysis && (state.brief.sourceText || '').length < 40) {
      return log('Analyse a repository or add some text or a document first (or start from a blank script).', 'error');
    }
    $('generate').disabled = true;
    const panel = progressPanel($('generate-log'), 'Writing the script', [
      { key: 'prep', label: 'Screenshots', weight: 0.04 },
      { key: 'reading', label: 'Reading', weight: 0.08, tau: 8 },
      { key: 'thinking', label: 'Thinking', weight: 0.36, tau: 45 },
      { key: 'writing', label: 'Writing', weight: 0.47 },
      { key: 'checking', label: 'Checking', weight: 0.05, tau: 2 },
    ]);
    let writingStart = 0;
    const onProgress = message => {
      if (message.phase === 'retry') {
        writingStart = 0;
        panel.step('writing', message.message, true);
      } else if (message.phase === 'writing') {
        panel.step('writing', message.message);
        const chars = message.chars || 0;
        const expected = Math.max(1, message.expected || 6000);
        if (!writingStart) writingStart = performance.now();
        const elapsed = (performance.now() - writingStart) / 1000;
        const rate = chars > 300 && elapsed > 2 ? chars / elapsed : 0;
        const left = rate ? Math.max(0, (expected - chars) / rate) + 3 : undefined;
        panel.set(Math.min(0.97, chars / expected), `Writing the scenes… ${(chars / 1000).toFixed(1)}k characters written`, left);
      } else if (message.phase) {
        panel.step(message.phase, message.message);
      } else if (message.message) {
        panel.set(0, message.message);
      }
    };
    try {
      const selected = state.assets.filter(a => a.selected).slice(0, MAX_SCRIPT_IMAGES);
      panel.step('prep', selected.length ? `Preparing ${selected.length} screenshot(s)…` : 'Sending the brief…');
      const images = [];
      for (const asset of selected) {
        const small = await scaledDataUrl(runtime.images.get(asset.id), 1280, 0.82);
        images.push({ id: asset.id, name: asset.name, ...small });
        panel.set(images.length / selected.length);
      }
      panel.step('reading', 'Sending to the AI…');
      const response = await postJson('script', {
        repo: state.repo, context: sourceContext(), languages, images,
        brief: {
          productName: state.brief.productName, productUrl: state.brief.productUrl, audience: state.brief.audience,
          tone: state.brief.tone, duration: state.brief.duration, brand: state.brief.brand, notes: state.brief.notes,
          style: state.brief.style, marketing: !!state.brief.marketing, purpose: state.brief.purpose || 'pitch', pace: state.brief.pace,
          price: state.brief.purpose === 'proposal' && !!state.brief.price,
        },
      });
      if (!response.ok || !response.body) throw new Error(await errorOf(response));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          const message = JSON.parse(line);
          if (message.type === 'progress') onProgress(message);
          else if (message.type === 'error') throw new Error(message.message);
          else if (message.type === 'result') result = message;
        }
      }
      if (!result) throw new Error('The generation was interrupted. Please try again.');
      state.project = result.project;
      state.project.productUrl = state.project.productUrl || state.brief.productUrl;
      state.project.style = state.project.style || state.brief.style || 'product';
      state.settings.lang = state.project.languages[0];
      state.selected = 0;
      runtime.takes = {};
      runtime.soundtrack = null;
      panel.done(`Script written by ${result.model}: ${result.project.scenes.length} scenes.`);
      scheduleSave();
      goTo('script');
    } catch (error) {
      panel.fail(error.message);
    } finally {
      $('generate').disabled = false;
    }
  }

  function blankCopy(type) {
    const [min] = ITEM_RANGE[type];
    return {
      vo: '', eyebrow: '', title: '', subtitle: '',
      items: Array.from({ length: min }, () => ({ title: '', text: '', value: '' })), cues: [],
    };
  }

  function blankScene(type, languages) {
    const [min] = ITEM_RANGE[type];
    const scene = {
      id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, type, variant: 0,
      image: type === 'screenshot' && state.assets[0] ? state.assets[0].id : null,
      focus: null, points: Array.from({ length: type === 'screenshot' ? min : 0 }, (_, i) => ({ x: 0.5, y: 0.3 + i * 0.2 })),
      icons: ICON_TYPES.has(type) ? Array.from({ length: min }, (_, i) => VM.ICON_NAMES[i % VM.ICON_NAMES.length]) : [], copy: {},
    };
    languages.forEach(lang => { scene.copy[lang] = blankCopy(type); });
    return scene;
  }

  function hashTheme(text) {
    let hash = 2166136261;
    for (const char of String(text || 'video').toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return { accent: 'green', surface: VM.THEME_SURFACES[Math.floor(hash / 7) % 3], musicSeed: hash % 100000 };
  }

  function blankProject() {
    readBrief();
    const languages = state.brief.languages.length ? state.brief.languages : ['fr-FR'];
    const name = state.brief.productName || 'Ma plateforme';
    state.project = {
      version: 1, title: name, productName: name, productUrl: state.brief.productUrl, brand: state.brief.brand || 'Wavestone',
      languages, theme: hashTheme(state.repo || name), style: state.brief.style || 'product', pace: state.brief.pace || 'fast',
      scenes: ['hook', 'reveal', 'screenshot', 'features', 'cta'].map(type => blankScene(type, languages)),
    };
    state.project.scenes.forEach(scene => languages.forEach(lang => {
      const copy = scene.copy[lang];
      if (scene.type === 'reveal') copy.title = name;
      if (scene.type === 'hook') copy.title = 'Your hook, with one *word* in accent';
    }));
    state.settings.lang = languages[0];
    state.selected = 0;
    scheduleSave();
    goTo('script');
  }

  // ── script step: timeline, preview ──────────────────────────────────────
  function lang() {
    const project = state.project;
    if (!project) return state.settings.lang;
    if (!project.languages.includes(state.settings.lang)) state.settings.lang = project.languages[0];
    return state.settings.lang;
  }

  function voiceFor(language) {
    const voices = (runtime.config && runtime.config.voices && runtime.config.voices[language]) || [];
    if (!state.settings.voices[language] || !voices.includes(state.settings.voices[language])) state.settings.voices[language] = voices[0] || '';
    return state.settings.voices[language];
  }

  /** Takes still matching the current text, voice and rate. */
  function validTakes(language) {
    const takes = runtime.takes[language] || {};
    const voice = voiceFor(language);
    const out = {};
    (state.project ? state.project.scenes : []).forEach(scene => {
      const take = takes[scene.id];
      const copy = scene.copy[language];
      if (take && copy && take.text === copy.vo && take.voice === voice && take.rate === state.settings.rate) out[scene.id] = take;
    });
    return out;
  }

  function soundtrackKey(language) {
    return JSON.stringify([language, state.project, state.settings.music, state.settings.musicLevel, voiceFor(language), state.settings.rate]);
  }

  function rebuildTimeline() {
    if (!state.project) { runtime.timeline = null; return; }
    runtime.timeline = VM.buildTimeline(state.project, lang(), validTakes(lang()));
    const tl = runtime.timeline;
    const words = state.project.scenes.reduce((sum, scene) => sum + ((scene.copy[lang()] || {}).vo || '').split(/\s+/).filter(Boolean).length, 0);
    $('timeline-info').textContent = `${formatTime(tl.duration)} · ${words} words`;
    $('scrub').max = String(Math.round(tl.duration * 1000));
  }

  function draw() {
    const canvas = $('preview');
    const size = VM.frameSize(state.project);
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.classList.toggle('is-vertical', size.height > size.width);
    }
    const ctx = canvas.getContext('2d');
    if (!runtime.timeline) {
      ctx.fillStyle = VM.COLORS.indigo800;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    VM.renderFrame(ctx, runtime.timeline, runtime.player.t, {
      project: state.project, images: runtime.images, captions: state.settings.captions, captionStyle: state.settings.captionsBold ? 'bold' : 'subtle',
    });
    $('scrub').value = String(Math.round(runtime.player.t * 1000));
    $('clock').textContent = `${formatTime(runtime.player.t)} / ${formatTime(runtime.timeline.duration)}`;
  }

  /** Vertical output exists in the showcase style only. */
  function syncFormat() {
    const showcase = state.project && state.project.style === 'showcase';
    $('format').disabled = !showcase;
    $('format').value = showcase && state.project.format !== 'landscape' ? 'vertical' : 'landscape';
    const select = $('new-scene-type');
    const kept = select.value;
    select.replaceChildren(...sceneTypes().map(type => el('option', { value: type, text: TYPE_LABELS[type], selected: type === kept })));
  }

  /** Generic scene types, then the current style's own ones (plus `keep`, so a scene never loses its type). */
  function sceneTypes(keep) {
    const own = VM.STYLE_SCENES[(state.project && state.project.style) || 'slides'] || [];
    const generic = VM.SCENE_TYPES.filter(type => !VM.SCENE_FALLBACK[type]);
    return generic.concat(VM.SCENE_TYPES.filter(type => own.includes(type) || (type === keep && VM.SCENE_FALLBACK[type])));
  }

  let updateTimer = 0;
  function changed(structure) {
    scheduleSave();
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      rebuildTimeline();
      renderSceneList();
      if (structure) renderEditor();
      if (!runtime.player.playing) draw();
    }, 120);
  }

  function stop() {
    const player = runtime.player;
    player.playing = false;
    cancelAnimationFrame(player.raf);
    if (player.source) { try { player.source.stop(); } catch { /* already stopped */ } player.source = null; }
    $('play').textContent = 'Play';
  }

  /**
   * The audio output, created and resumed inside a click: Safari keeps an
   * AudioContext silent (and its clock frozen) unless it was started by a
   * user gesture, and "Play with voice" only plays after the voice is ready.
   */
  function audioOutput() {
    const player = runtime.player;
    if (!player.audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      player.audio = new Context();
    }
    if (player.audio.state !== 'running') {
      player.audio.resume().catch(() => undefined);
      const silence = player.audio.createBufferSource();
      silence.buffer = player.audio.createBuffer(1, 1, 22050);
      silence.connect(player.audio.destination);
      silence.start(0);
    }
    return player.audio;
  }

  function play() {
    const player = runtime.player;
    if (player.playing) return stop();
    if (!runtime.timeline) return;
    if (player.t >= runtime.timeline.duration - 0.05) player.t = 0;
    player.playing = true;
    $('play').textContent = 'Pause';
    const sound = runtime.soundtrack && runtime.soundtrack.key === soundtrackKey(lang()) ? runtime.soundtrack.buffer : null;
    if (sound) {
      audioOutput();
      const source = player.audio.createBufferSource();
      source.buffer = sound;
      source.connect(player.audio.destination);
      source.start(0, player.t);
      player.source = source;
      player.startAt = player.audio.currentTime - player.t;
    } else {
      player.clockStart = performance.now() - player.t * 1000;
    }
    // if the browser still holds the sound back, the picture keeps its own clock
    if (player.source && player.audio.state !== 'running') player.clockStart = performance.now() - player.t * 1000;
    const tick = () => {
      if (!player.playing) return;
      const audible = player.source && player.audio.state === 'running';
      player.t = audible ? player.audio.currentTime - player.startAt : (performance.now() - player.clockStart) / 1000;
      if (player.t >= runtime.timeline.duration) {
        player.t = runtime.timeline.duration;
        draw();
        return stop();
      }
      draw();
      player.raf = requestAnimationFrame(tick);
    };
    player.raf = requestAnimationFrame(tick);
  }

  function seek(t) {
    const wasPlaying = runtime.player.playing;
    stop();
    runtime.player.t = Math.max(0, t);
    draw();
    if (wasPlaying) play();
  }

  async function ensureTakes(language, onProgress) {
    const voice = voiceFor(language);
    // Without a voice key the film is timed from the text and plays with music and captions only.
    if (!voice || !(runtime.config && runtime.config.voiceReady)) return {};
    const rate = state.settings.rate;
    runtime.takes[language] = runtime.takes[language] || {};
    const scenes = state.project.scenes.filter(scene => (scene.copy[language] || {}).vo);
    let done = 0;
    for (const scene of scenes) {
      const text = scene.copy[language].vo;
      const take = await VM.fetchTake(text, voice, rate);
      runtime.takes[language][scene.id] = Object.assign({}, take, { text, voice, rate });
      done++;
      if (onProgress) onProgress(done / scenes.length, done, scenes.length);
    }
    return validTakes(language);
  }

  async function soundtrackFor(language, timeline, takes) {
    const key = soundtrackKey(language);
    if (runtime.soundtrack && runtime.soundtrack.key === key) return runtime.soundtrack.buffer;
    const buffer = await VM.mixSoundtrack(timeline, takes, {
      music: state.settings.music, musicLevel: state.settings.musicLevel, seed: (state.project.theme || {}).musicSeed || 1,
    });
    runtime.soundtrack = { key, buffer };
    return buffer;
  }

  async function listen() {
    if (!state.project) return;
    stop();
    audioOutput();
    $('voices').disabled = true;
    const language = lang();
    setStatus('voice-status', '');
    const panel = progressPanel($('voice-progress'), 'Preparing playback', [
      { key: 'voices', label: 'Voice', weight: 0.8 },
      { key: 'mix', label: 'Music and mix', weight: 0.2, tau: 2 },
    ]);
    try {
      panel.step('voices', 'Recording the voice…');
      const takes = await ensureTakes(language, (p, done, total) => panel.set(p, `Voice: scene ${done} of ${total}`));
      rebuildTimeline();
      panel.step('mix', 'Music and mix…');
      await soundtrackFor(language, runtime.timeline, takes);
      panel.done(Object.keys(takes).length ? 'Ready: playing with the voice.' : 'Ready: playing with music and captions (no voice key set).');
      setTimeout(() => $('voice-progress').replaceChildren(), 4000);
      runtime.player.t = 0;
      play();
    } catch (error) {
      panel.fail(error.message);
    } finally {
      $('voices').disabled = false;
    }
  }

  // ── script step: rendering the editor ──────────────────────────────────
  function renderLangTabs() {
    const tabs = $('lang-tabs');
    tabs.replaceChildren();
    if (!state.project) return;
    state.project.languages.forEach(language => {
      tabs.append(el('button', {
        class: `vm-tab${language === lang() ? ' is-active' : ''}`, type: 'button', text: `${LANG_LABELS[language] || language}`,
        onclick: () => {
          stop();
          state.settings.lang = language;
          renderScript();
        },
      }));
    });
  }

  function sceneDuration(index) {
    const s = runtime.timeline && runtime.timeline.scenes[index];
    return s ? `${(s.end - s.start).toFixed(1)} s` : '';
  }

  function renderSceneList() {
    const list = $('scene-list');
    list.replaceChildren();
    if (!state.project) return;
    const scenes = state.project.scenes;
    scenes.forEach((scene, index) => {
      const copy = scene.copy[lang()] || {};
      const move = (delta, event) => {
        event.stopPropagation();
        const target = index + delta;
        if (target < 0 || target >= scenes.length) return;
        scenes.splice(target, 0, scenes.splice(index, 1)[0]);
        state.selected = target;
        changed(true);
      };
      list.append(el('li', {
        class: `vm-scene${index === state.selected ? ' is-active' : ''}`,
        onclick: () => {
          state.selected = index;
          runtime.placing = -1;
          renderSceneList();
          renderEditor();
          if (runtime.timeline && runtime.timeline.scenes[index]) seek(runtime.timeline.scenes[index].start + 0.8);
        },
      },
      el('span', { class: 'vm-scene__n', text: String(index + 1) }),
      el('div', {},
        el('div', { class: 'vm-scene__type', text: `${TYPE_LABELS[scene.type] || scene.type} · ${sceneDuration(index)}` }),
        el('div', { class: 'vm-scene__text', text: copy.vo || copy.title || '(vide)' })),
      el('div', { class: 'vm-scene__tools' },
        el('button', { class: 'vm-icon-btn', type: 'button', title: 'Move up', text: '↑', onclick: event => move(-1, event) }),
        el('button', { class: 'vm-icon-btn', type: 'button', title: 'Move down', text: '↓', onclick: event => move(1, event) }),
        el('button', {
          class: 'vm-icon-btn', type: 'button', title: 'Duplicate', text: '⧉',
          onclick: event => {
            event.stopPropagation();
            const copyScene = JSON.parse(JSON.stringify(scene));
            copyScene.id = `${scene.id}b${Date.now().toString(36)}`;
            scenes.splice(index + 1, 0, copyScene);
            state.selected = index + 1;
            changed(true);
          },
        }),
        el('button', {
          class: 'vm-icon-btn', type: 'button', title: 'Delete', text: '✕',
          onclick: event => {
            event.stopPropagation();
            if (scenes.length <= 1) return;
            scenes.splice(index, 1);
            state.selected = Math.min(state.selected, scenes.length - 1);
            changed(true);
          },
        }))));
    });
  }

  function field(label, input) {
    return el('label', { class: 'vm-field' }, label, input);
  }

  function textInput(value, onInput, props) {
    return el(props && props.multiline ? 'textarea' : 'input', Object.assign({
      type: 'text', value: value || '', rows: props && props.rows,
      oninput: event => { onInput(event.target.value); changed(false); },
    }, props && props.attrs));
  }

  function setItemCount(scene, count) {
    state.project.languages.forEach(language => {
      const copy = scene.copy[language] || (scene.copy[language] = blankCopy(scene.type));
      copy.items = copy.items || [];
      while (copy.items.length < count) copy.items.push({ title: '', text: '', value: '' });
      copy.items.length = count;
      copy.cues = (copy.cues || []).slice(0, count);
    });
    if (scene.type === 'screenshot') {
      scene.points = scene.points || [];
      while (scene.points.length < count) scene.points.push({ x: 0.5, y: 0.3 + scene.points.length * 0.2 });
      scene.points.length = count;
    }
    if (ICON_TYPES.has(scene.type)) {
      scene.icons = scene.icons || [];
      while (scene.icons.length < count) scene.icons.push(VM.ICON_NAMES[scene.icons.length % VM.ICON_NAMES.length]);
      scene.icons.length = count;
    }
  }

  function changeType(scene, type) {
    scene.type = type;
    scene.variant = Math.min(scene.variant || 0, VM.SCENE_VARIANTS[type] - 1);
    if (!IMAGE_TYPES.has(type)) scene.image = null;
    if (type === 'screenshot' && !scene.image && state.assets[0]) scene.image = state.assets[0].id;
    if (type !== 'screenshot') { scene.focus = null; scene.points = []; }
    if (!ICON_TYPES.has(type)) scene.icons = [];
    const current = (scene.copy[lang()] && scene.copy[lang()].items || []).length;
    const [min, max] = ITEM_RANGE[type];
    setItemCount(scene, Math.max(min, Math.min(max, current)));
  }

  function focusEditor(scene) {
    const asset = state.assets.find(a => a.id === scene.image);
    if (!asset) return el('p', { class: 'vm-hint', text: 'Pick a picture to set the zoom and the callouts.' });
    const box = el('div', { class: 'vm-focus', title: 'Drag to set the zoom area' });
    const img = el('img', { src: asset.dataUrl, alt: '' });
    box.append(img);
    const paint = () => {
      box.querySelectorAll('.vm-focus__rect, .vm-focus__pt').forEach(node => node.remove());
      if (scene.focus) {
        const f = scene.focus;
        box.append(el('div', { class: 'vm-focus__rect', style: `left:${f.x * 100}%;top:${f.y * 100}%;width:${f.w * 100}%;height:${f.h * 100}%` }));
      }
      (scene.points || []).forEach((point, i) => {
        box.append(el('div', { class: 'vm-focus__pt', style: `left:${point.x * 100}%;top:${point.y * 100}%`, text: String(i + 1) }));
      });
    };
    let start = null;
    const pos = event => {
      const rect = box.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
    };
    box.addEventListener('pointerdown', event => {
      const p = pos(event);
      if (runtime.placing >= 0) {
        scene.points[runtime.placing] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
        runtime.placing = -1;
        paint();
        changed(true);
        return;
      }
      start = p;
      box.setPointerCapture(event.pointerId);
    });
    box.addEventListener('pointermove', event => {
      if (!start) return;
      const p = pos(event);
      scene.focus = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      paint();
    });
    box.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      if (scene.focus && (scene.focus.w < 0.12 || scene.focus.h < 0.12)) scene.focus = null;
      else if (scene.focus) Object.keys(scene.focus).forEach(key => { scene.focus[key] = +scene.focus[key].toFixed(3); });
      paint();
      changed(false);
    });
    paint();
    return el('div', { class: 'vm-field' },
      runtime.placing >= 0 ? `Click the picture to place point ${runtime.placing + 1}` : 'Zoom area (drag) and callout points',
      box,
      el('div', { class: 'vm-row' },
        el('button', { class: 'vm-btn vm-btn--ghost vm-btn--sm', type: 'button', text: 'Remove zoom', onclick: () => { scene.focus = null; paint(); changed(false); } })));
  }

  function renderEditor() {
    const editor = $('editor');
    editor.replaceChildren();
    const project = state.project;
    if (!project || !project.scenes[state.selected]) {
      editor.append(el('p', { class: 'vm-empty', text: 'Select a scene.' }));
      return;
    }
    const scene = project.scenes[state.selected];
    const language = lang();
    const copy = scene.copy[language] || (scene.copy[language] = blankCopy(scene.type));
    const [min, max] = ITEM_RANGE[scene.type];

    editor.append(el('h3', { text: `Scene ${state.selected + 1} · ${LANG_LABELS[language] || language}` }));
    const typeSelect = el('select', {
      onchange: event => { changeType(scene, event.target.value); changed(true); },
    }, sceneTypes(scene.type).map(type => el('option', { value: type, text: TYPE_LABELS[type], selected: type === scene.type })));
    const variantSelect = el('select', {
      onchange: event => { scene.variant = Number(event.target.value); changed(true); },
    }, (VARIANT_LABELS[scene.type] || ['Standard']).map((label, i) => el('option', { value: String(i), text: label, selected: i === (scene.variant || 0) })));
    editor.append(el('div', { class: 'vm-mini' }, field('Type', typeSelect), field('Layout', variantSelect)));

    const words = (copy.vo || '').split(/\s+/).filter(Boolean).length;
    const voInfo = el('small', { text: `${words} words · ~${VM.estimateSpeech(copy.vo).toFixed(1)} s` });
    editor.append(field(el('span', {}, 'Voice-over ', voInfo), textInput(copy.vo, value => {
      copy.vo = value;
      const n = value.split(/\s+/).filter(Boolean).length;
      voInfo.textContent = `${n} words · ~${VM.estimateSpeech(value).toFixed(1)} s`;
    }, { multiline: true, rows: 4 })));

    (FIELDS[scene.type] || []).forEach(name => {
      const label = scene.type === 'quote' ? (name === 'title' ? 'Quote' : 'Author') : FIELD_LABELS[name];
      const lines = name === 'eyebrow' ? 0 : scene.type === 'quote' && name === 'title' ? 3 : 2;
      editor.append(field(label, textInput(copy[name], value => { copy[name] = value; }, { multiline: lines > 0, rows: lines })));
    });

    if (IMAGE_TYPES.has(scene.type)) {
      const imageSelect = el('select', {
        onchange: event => { scene.image = event.target.value || null; changed(true); },
      }, el('option', { value: '', text: '(none)' }), state.assets.map(asset => el('option', { value: asset.id, text: `${asset.id} · ${asset.name}`, selected: asset.id === scene.image })));
      editor.append(field('Image', imageSelect));
      if (scene.type === 'screenshot' || (scene.type === 'features' && scene.variant === 2) || (scene.type === 'hook' && scene.variant === 2) || scene.type === 'reveal' || scene.type === 'steps') {
        const asset = state.assets.find(a => a.id === scene.image);
        if (scene.type === 'screenshot') editor.append(focusEditor(scene));
        else if (asset) editor.append(el('img', { src: asset.dataUrl, alt: '', style: 'width:100%;border-radius:8px' }));
      }
    }

    if (max > 0) {
      const datalistId = `cues-${state.selected}`;
      const voWords = [...new Set((copy.vo || '').split(/\s+/).map(w => w.replace(/[.,;:!?…«»"“”()]/g, '')).filter(w => w.length > 2))];
      editor.append(el('datalist', { id: datalistId }, voWords.map(w => el('option', { value: w }))));
      (copy.items || []).forEach((item, i) => {
        const box = el('div', { class: 'vm-item' },
          el('div', { class: 'vm-item__head' }, `Item ${i + 1}`,
            (copy.items.length > min) ? el('button', {
              class: 'vm-icon-btn', type: 'button', title: 'Remove', text: '✕',
              onclick: () => {
                state.project.languages.forEach(l => {
                  const c = scene.copy[l];
                  if (c && c.items) { c.items.splice(i, 1); if (c.cues) c.cues.splice(i, 1); }
                });
                if (scene.points) scene.points.splice(i, 1);
                if (scene.icons) scene.icons.splice(i, 1);
                changed(true);
              },
            }) : null));
        if (scene.type === 'stats') box.append(field('Figure shown', textInput(item.value, value => { item.value = value; })));
        if (scene.type === 'planning') box.append(field('Period (e.g. W1-W4)', textInput(item.value, value => { item.value = value; })));
        box.append(field(scene.type === 'stats' ? 'Label' : scene.type === 'planning' ? 'Phase' : scene.type === 'team' ? 'Name' : 'Title', textInput(item.title, value => { item.title = value; }, { multiline: true, rows: 1 })));
        if (scene.type !== 'stats') box.append(field(scene.type === 'team' ? 'Role' : 'Text', textInput(item.text, value => { item.text = value; }, { multiline: true, rows: 2 })));
        const extra = [];
        extra.push(field('Appears on the word', textInput((copy.cues || [])[i], value => { copy.cues = copy.cues || []; copy.cues[i] = value; }, { attrs: { list: datalistId } })));
        if (ICON_TYPES.has(scene.type)) {
          extra.push(field('Icon', el('select', {
            onchange: event => { scene.icons[i] = event.target.value; changed(false); },
          }, VM.ICON_NAMES.map(name => el('option', { value: name, text: name, selected: name === (scene.icons || [])[i] })))));
        }
        if (scene.type === 'screenshot') {
          extra.push(el('div', { class: 'vm-field' }, 'Point on the screenshot', el('button', {
            class: 'vm-btn vm-btn--outline vm-btn--sm', type: 'button', text: runtime.placing === i ? 'Click the picture…' : 'Place the point',
            onclick: () => { runtime.placing = i; renderEditor(); },
          })));
        }
        box.append(el('div', { class: 'vm-mini' }, extra));
        editor.append(box);
      });
      if ((copy.items || []).length < max) {
        editor.append(el('button', {
          class: 'vm-btn vm-btn--outline vm-btn--sm', type: 'button', text: '+ Item',
          onclick: () => { setItemCount(scene, (copy.items || []).length + 1); changed(true); },
        }));
      }
    }
  }

  function renderScript() {
    if (!state.project) {
      $('editor').replaceChildren(el('p', { class: 'vm-empty', text: 'No script yet: write it from the Source step.' }));
      $('scene-list').replaceChildren();
      $('lang-tabs').replaceChildren();
      rebuildTimeline();
      draw();
      return;
    }
    const theme = state.project.theme || (state.project.theme = hashTheme(state.repo || state.project.productName));
    $('style').value = state.project.style || 'slides';
    $('pace-project').value = state.project.pace === 'fast' ? 'fast' : 'standard';
    syncFormat();
    theme.accent = 'green';
    $('theme-surface').value = theme.surface;
    $('theme-paper').value = theme.paper || 'white';
    $('music').value = state.settings.music;
    $('music-level').value = String(state.settings.musicLevel);
    $('captions').checked = state.settings.captions;
    if ($('captions-bold')) $('captions-bold').checked = !!state.settings.captionsBold;
    $('rate').value = state.settings.rate;
    renderVoiceSelect();
    renderLangTabs();
    rebuildTimeline();
    renderSceneList();
    renderEditor();
    draw();
  }

  function renderVoiceSelect() {
    const language = lang();
    const voices = (runtime.config && runtime.config.voices[language]) || [];
    const current = voiceFor(language);
    $('voice').replaceChildren(...voices.map(voice => el('option', {
      value: voice, text: voice.replace(`${language}-`, '').replace('Neural', ''), selected: voice === current,
    })));
  }

  // ── produce step ─────────────────────────────────────────────────────────
  const jobs = {};

  function renderProduce() {
    const list = $('produce-list');
    list.replaceChildren();
    if (!state.project) {
      list.append(el('p', { class: 'vm-empty', text: 'Write or import a script before exporting.' }));
      $('produce-all').disabled = true;
      return;
    }
    $('produce-all').disabled = false;
    state.project.languages.forEach(language => {
      const job = jobs[language] || (jobs[language] = {});
      const bar = el('div');
      const status = el('p', { class: 'vm-status', text: job.status || 'Ready to make.' });
      const progressHost = el('div', {}, el('div', { class: 'vm-progress' }, bar), status);
      const actions = el('div', { class: 'vm-row' });
      const button = el('button', { class: 'vm-btn vm-btn--primary', type: 'button', text: 'Make video', onclick: () => produce(language) });
      actions.append(button);
      if (job.url) actions.append(el('a', { class: 'vm-btn vm-btn--accent', href: job.url, download: job.filename, text: 'Download' }));
      job.nodes = { bar, status, button, actions, progressHost };
      bar.style.width = `${Math.round((job.progress || 0) * 100)}%`;
      list.append(el('div', { class: 'vm-job' },
        el('div', { class: 'vm-job__name', text: `${LANG_LABELS[language]} · ${voiceFor(language).replace('Neural', '')}` }),
        progressHost,
        actions));
    });
  }

  function jobUpdate(language, progress, status) {
    const job = jobs[language];
    job.progress = progress;
    if (status) job.status = status;
    if (job.nodes) {
      job.nodes.bar.style.width = `${Math.round(progress * 100)}%`;
      if (status) job.nodes.status.textContent = status;
    }
  }

  async function produce(language) {
    if (!state.project || runtime.busy) return;
    stop();
    runtime.busy = true;
    document.querySelectorAll('#produce-list button, #produce-all').forEach(button => { button.disabled = true; });
    const job = jobs[language];
    const panel = progressPanel(job.nodes.progressHost, `Video ${LANG_LABELS[language] || language}`, [
      { key: 'voices', label: 'Voice', weight: 0.12 },
      { key: 'music', label: 'Music', weight: 0.04, tau: 2 },
      { key: 'frames', label: 'Frames', weight: 0.78 },
      { key: 'audio', label: 'Sound', weight: 0.03, tau: 3 },
      { key: 'mux', label: 'File', weight: 0.03, tau: 1 },
    ]);
    try {
      jobUpdate(language, 0.02, 'Recording the voice…');
      panel.step('voices', 'Recording the voice…');
      const takes = await ensureTakes(language, (p, done, total) => panel.set(p, `Voice: scene ${done} of ${total}`));
      const timeline = VM.buildTimeline(state.project, language, takes);
      panel.step('music', 'Music, sound effects and mix…');
      const soundtrack = await soundtrackFor(language, timeline, takes);
      const started = performance.now();
      const totalFrames = Math.ceil(timeline.duration * 30);
      panel.step('frames', 'Drawing and encoding frames…');
      const result = await VM.renderMp4({
        project: state.project, timeline, images: runtime.images, captions: state.settings.captions,
        captionStyle: state.settings.captionsBold ? 'bold' : 'subtle', soundtrack, fps: 30,
        onProgress: (stage, ratio) => {
          if (stage === 'frames') {
            const elapsed = (performance.now() - started) / 1000;
            const left = ratio > 0.03 ? elapsed / ratio - elapsed + 3 : undefined;
            panel.set(ratio, `Frames: ${Math.round(ratio * totalFrames)} of ${totalFrames}`, left);
          } else if (stage === 'audio') panel.step('audio', 'Encoding the sound…');
          else panel.step('mux', 'Assembling the file…');
        },
      });
      if (job.url) URL.revokeObjectURL(job.url);
      job.url = URL.createObjectURL(result.blob);
      job.filename = `${slug(state.project.productName)}-${language}.${result.extension || 'mp4'}`;
      const size = (result.blob.size / 1048576).toFixed(1);
      const sound = { aac: 'AAC sound', pcm: 'PCM sound, .mov file (plays on iPhone, Mac, LinkedIn)', opus: 'Opus sound (Apple devices cannot play it: prefer Chrome or Edge on a computer)' }[result.audioCodec] || 'no sound';
      const check = result.audioCheck === 'silent' ? ' · Warning: the sound track reads back silent.'
        : result.audioCheck === 'unreadable' ? ' · This browser could not read the sound track back to check it.' : '';
      const note = ` · ${sound}${check}`;
      panel.done('Done.');
      jobUpdate(language, 1, `Ready: ${formatTime(timeline.duration)}, ${size} MB, ${result.videoCodec.startsWith('avc1') ? 'H.264' : 'VP9'}${note}`);
    } catch (error) {
      panel.fail(`Failed: ${error.message}`);
      jobUpdate(language, 0, `Failed: ${error.message}`);
    } finally {
      runtime.busy = false;
      renderProduce();
    }
  }

  async function produceAll() {
    const languages = state.project.languages;
    for (const [index, language] of languages.entries()) {
      setStatus('produce-overall', `Video ${index + 1} of ${languages.length}: ${LANG_LABELS[language] || language}…`);
      await produce(language);
    }
    const failed = languages.filter(language => /^Failed/.test(jobs[language].status || ''));
    setStatus('produce-overall', failed.length ? `${failed.length} video(s) failed.` : `${languages.length} video(s) ready to download.`, failed.length ? 'error' : 'ok');
  }

  // ── navigation, init ─────────────────────────────────────────────────────
  async function addPictures(files) {
    let added = 0;
    const failures = [];
    for (const file of files) {
      setStatus('assets-status', `Adding ${file.name || 'picture'}…`);
      try {
        await addAsset(file, file.name, 'upload', state.assets.filter(a => a.selected).length < MAX_SCRIPT_IMAGES);
        added++;
      } catch (error) {
        failures.push(`${file.name || 'picture'} (${error && error.message ? error.message : 'unreadable'})`);
      }
    }
    if (failures.length) setStatus('assets-status', `${added} picture(s) added. Could not read: ${failures.join(', ')}.`, 'error');
    else {
      setStatus('assets-status', '');
      renderAssets();
    }
  }

  /** Opens one of the source rows (web page, GitHub) and closes the other. */
  function disclose(name, open) {
    document.querySelectorAll('[data-disclose]').forEach(button => {
      const pane = $(`disclose-${button.dataset.disclose}`);
      const show = button.dataset.disclose === name ? (open === undefined ? pane.hidden : open) : false;
      pane.hidden = !show;
      button.setAttribute('aria-expanded', String(show));
      button.classList.toggle('is-open', show);
      if (show && open === undefined) { const input = pane.querySelector('input'); if (input) input.focus(); }
    });
  }

  /** The inspector shows either the selected scene or the settings of the whole film. */
  function inspect(pane) {
    document.querySelectorAll('[data-inspect]').forEach(button => {
      const on = button.dataset.inspect === pane;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('[data-pane]').forEach(node => { node.hidden = node.dataset.pane !== pane; });
  }

  /**
   * Segmented control or tiles built from a hidden <select>, which stays the
   * source of truth ("Title: description" options show the description on tiles).
   */
  const segments = [];
  function segmented(host) {
    const select = $(host.dataset.seg);
    if (!select) return;
    const tiles = host.classList.contains('vm-tiles');
    const buttons = [...select.options].map(option => {
      const [title, detail] = option.textContent.split(/:\s(.+)/);
      const button = el('button', { type: 'button', class: 'vm-seg__btn', title: detail || '', 'data-value': option.value },
        el('strong', { text: title }), tiles && detail ? el('small', { text: detail }) : null);
      button.addEventListener('click', () => {
        if (select.disabled || select.value === option.value) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSegments();
      });
      return button;
    });
    host.replaceChildren(...buttons);
    host.setAttribute('role', 'radiogroup');
    segments.push(() => buttons.forEach(button => {
      const on = button.dataset.value === select.value;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-checked', String(on));
      button.setAttribute('role', 'radio');
      button.disabled = select.disabled;
    }));
    syncSegments();
  }
  function syncSegments() { segments.forEach(sync => sync()); }

  // The page's configuration comes from the AI settings (the author's own keys).
  async function loadConfig() {
    try {
      const response = await postJson('config', {});
      runtime.config = await response.json();
      runtime.configError = '';
    } catch (error) {
      runtime.config = { voices: {}, ai: { ready: false }, voiceReady: false };
      runtime.configError = error.message;
    }
    renderAiStatus();
  }

  // AI status in the brand bar, as in CrisisMaker: connected once a key (or a
  // local server) and a model are set. Click to open the AI settings.
  function renderAiStatus() {
    const node = $('ai-status');
    if (!node) return;
    const ai = (runtime.config && runtime.config.ai) || {};
    let tone = 'is-off';
    let label = 'AI not set up';
    let title = 'Add your own API key in the AI settings to write scripts. Click to open them.';
    if (runtime.configError) {
      tone = 'is-error';
      label = 'AI unreachable';
      title = `The AI settings could not be read: ${runtime.configError}`;
    } else if (ai.ready) {
      tone = 'is-live';
      label = 'AI connected';
      title = `Script writer: ${ai.label} (${ai.model}). ${runtime.config.voiceReady ? 'Voice-over on.' : 'No voice-over key: the film plays with music and captions.'} Click to change it.`;
    }
    node.className = `vm-ai-status ${tone}`;
    node.textContent = label;
    node.title = title;
  }

  // Welcome screen, as in CrisisMaker: on a first visit, and from the VideoMaker name.
  function showLaunch(open) {
    const overlay = $('vm-launch');
    if (!overlay) return;
    overlay.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      overlay.scrollTop = 0;
      $('vm-launch-start').focus({ preventScroll: true });
    }
  }

  function goTo(step) {
    document.querySelectorAll('.vm-step').forEach(button => button.classList.toggle('is-active', button.dataset.step === step));
    document.querySelectorAll('.vm-panel').forEach(panel => panel.classList.toggle('is-active', panel.id === `panel-${step}`));
    if (step !== 'script') stop();
    if (step === 'script') renderScript();
    if (step === 'produce') renderProduce();
    window.scrollTo({ top: 0 });
  }

  /** Binds a listener if the element exists, so one missing element never stops the page. */
  function on(id, type, handler) {
    const node = $(id);
    if (node) node.addEventListener(type, handler);
    else console.warn(`[videomaker] #${id} is missing`);
  }

  function bind() {
    document.querySelectorAll('.vm-step').forEach(button => button.addEventListener('click', () => { readBrief(); goTo(button.dataset.step); }));
    on('analyze', 'click', analyze);
    on('blank', 'click', blankProject);
    on('generate', 'click', generate);
    // A product pitch is cut fast by default; the other purposes breathe more. Runs before readBrief.
    on('purpose', 'change', event => { $('pace').value = event.target.value === 'pitch' ? 'fast' : 'standard'; });
    ['product-name', 'product-url', 'audience', 'tone', 'duration', 'brand', 'notes', 'repo', 'style-brief', 'marketing', 'source-text', 'purpose', 'pace', 'price'].forEach(id => $(id).addEventListener('change', readBrief));
    document.querySelectorAll('#languages input').forEach(input => input.addEventListener('change', () => {
      const checked = document.querySelectorAll('#languages input:checked');
      if (!checked.length) input.checked = true;
      readBrief();
    }));
    on('source-file', 'change', event => {
      const files = [...event.target.files];
      event.target.value = '';
      if (files.length) addDocuments(files);
    });
    on('upload', 'change', event => {
      const files = [...event.target.files];
      event.target.value = '';
      addPictures(files);
    });
    const drop = $('drop');
    if (drop) {
      ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', event => {
        event.preventDefault();
        const files = [...(event.dataTransfer ? event.dataTransfer.files : [])].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/') || /\.(png|jpe?g|webp|gif|heic|mp4|m4v|webm|mov)$/i.test(file.name));
        if (files.length) addPictures(files);
      });
    }
    // documents dropped on the source box are read like picked ones
    const sourceBox = $('source-text');
    if (sourceBox) {
      sourceBox.addEventListener('dragover', event => { if (event.dataTransfer && [...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
      sourceBox.addEventListener('drop', event => {
        const files = [...(event.dataTransfer ? event.dataTransfer.files : [])].filter(file => VM.documentKind(file));
        if (!files.length) return;
        event.preventDefault();
        addDocuments(files);
      });
    }
    document.querySelectorAll('[data-disclose]').forEach(button => button.addEventListener('click', () => disclose(button.dataset.disclose)));
    document.querySelectorAll('[data-inspect]').forEach(button => button.addEventListener('click', () => inspect(button.dataset.inspect)));
    on('to-export', 'click', () => goTo('produce'));
    on('produce-all', 'click', produceAll);
    document.querySelectorAll('[data-seg]').forEach(host => segmented(host));
    document.addEventListener('paste', async event => {
      const files = [...(event.clipboardData ? event.clipboardData.files : [])].filter(file => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      for (const file of files) await addAsset(file, `pasted screenshot ${new Date().toLocaleTimeString()}`, 'paste', state.assets.filter(a => a.selected).length < MAX_SCRIPT_IMAGES);
    });
    on('play', 'click', play);
    on('scrub', 'input', event => seek(Number(event.target.value) / 1000));
    on('voices', 'click', listen);
    on('voice', 'change', event => { state.settings.voices[lang()] = event.target.value; changed(false); });
    on('rate', 'change', event => { state.settings.rate = event.target.value; changed(false); });
    on('music', 'change', event => { state.settings.music = event.target.value; changed(false); });
    on('music-level', 'change', event => { state.settings.musicLevel = Number(event.target.value); changed(false); });
    on('captions', 'change', event => { state.settings.captions = event.target.checked; changed(false); });
    on('captions-bold', 'change', event => { state.settings.captionsBold = event.target.checked; changed(false); });
    on('style', 'change', event => { state.project.style = event.target.value; syncFormat(); changed(true); });
    on('pace-project', 'change', event => { state.project.pace = event.target.value; changed(false); });
    on('format', 'change', event => { state.project.format = event.target.value; changed(false); });
    on('theme-surface', 'change', event => { state.project.theme.surface = event.target.value; changed(false); });
    on('theme-paper', 'change', event => { state.project.theme.paper = event.target.value; changed(false); });
    on('add-scene', 'click', () => {
      if (!state.project) return;
      const scene = blankScene($('new-scene-type').value, state.project.languages);
      state.project.scenes.splice(state.selected + 1, 0, scene);
      state.selected += 1;
      changed(true);
    });
    on('export-json', 'click', () => {
      const answer = prompt('File name for the project:', `${slug(state.project ? state.project.productName : 'projet')}.videomaker.json`);
      if (answer === null) return;
      const name = answer.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'projet.videomaker.json';
      const filename = /\.json$/i.test(name) ? name : `${name}.videomaker.json`;
      const blob = new Blob([JSON.stringify({ project: state.project, assets: state.assets, brief: state.brief, repo: state.repo, settings: state.settings }, null, 2)], { type: 'application/json' });
      const link = el('a', { href: URL.createObjectURL(blob), download: filename });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    on('import-json', 'change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.project || !Array.isArray(data.project.scenes)) throw new Error('Invalid project file.');
        Object.assign(state, { project: data.project, assets: data.assets || [], brief: Object.assign(state.brief, data.brief || {}), repo: data.repo || '', settings: Object.assign(state.settings, data.settings || {}) });
        await restoreImages();
        state.selected = 0;
        writeBrief();
        renderAssets();
        changed(true);
        goTo('script');
      } catch (error) {
        alert(error.message);
      }
      event.target.value = '';
    });
    on('ai-status', 'click', () => { if (VM.openSettings) VM.openSettings(); });
    // The AI settings dialog (settings-ui.js) saved new keys or choices.
    document.addEventListener('vm-settings-saved', async () => {
      await loadConfig();
      renderVoiceSelect();
      scheduleSave();
    });
    on('vm-home', 'click', () => showLaunch(true));
    on('vm-launch-close', 'click', () => showLaunch(false));
    on('vm-launch-start', 'click', () => showLaunch(false));
    on('vm-launch-load', 'click', () => { showLaunch(false); $('import-json').click(); });
    on('vm-launch', 'click', event => { if (event.target === event.currentTarget) showLaunch(false); });
    document.querySelectorAll('[data-launch-step]').forEach(button => button.addEventListener('click', () => {
      showLaunch(false);
      goTo(button.dataset.launchStep);
    }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('vm-launch').hidden) showLaunch(false); });
    on('vm-new', 'click', () => {
      if (!confirm('Start a new, empty project? The current project will be erased from this browser.')) return;
      stop();
      state.project = null;
      state.analysis = null;
      state.assets = [];
      state.repo = '';
      runtime.images.clear();
      [...VM.clips.keys()].forEach(id => VM.releaseClip(id));
      runtime.takes = {};
      runtime.soundtrack = null;
      Object.assign(state.brief, { productName: '', productUrl: '', audience: '', tone: '', notes: '', sourceText: '' });
      writeBrief();
      renderAssets();
      scheduleSave();
      goTo('source');
    });
    window.addEventListener('beforeunload', event => { if (runtime.busy) { event.preventDefault(); event.returnValue = ''; } });
  }

  async function restoreImages() {
    runtime.images.clear();
    [...VM.clips.keys()].forEach(id => VM.releaseClip(id));
    for (const asset of state.assets) {
      try {
        if (asset.clip) {
          runtime.images.set(asset.id, VM.registerClip(asset.id, await VM.unpackClip(asset.clip)));
          continue;
        }
      } catch { delete asset.clip; /* falls back to the still picture */ }
      try { runtime.images.set(asset.id, await bitmapFromDataUrl(asset.dataUrl)); } catch { /* skip broken */ }
    }
  }

  async function init() {
    VM.THEME_SURFACES.forEach(name => $('theme-surface').append(el('option', { value: name, text: { indigo: 'Indigo', midnight: 'Midnight', ink: 'Ink' }[name] })));
    bind();
    const saved = await loadState();
    if (saved) {
      Object.assign(state, saved, { brief: Object.assign(state.brief, saved.brief || {}), settings: Object.assign(state.settings, saved.settings || {}) });
      // New defaults (continuous "product" style, Rémy Multilingual voice) replace the old ones once.
      if ((state.settings.defaultsVersion || 1) < 2) {
        state.brief.style = 'product';
        state.settings.voices = {};
        state.settings.defaultsVersion = 2;
      }
      await restoreImages();
    }
    await loadConfig();
    writeBrief();
    renderAiStatus();
    renderAssets();
    await VM.fontsReady();
    const support = await VM.exportSupport();
    setStatus('support', support.ok
      ? `This browser can make the videos (${support.video.codec.startsWith('avc1') ? 'H.264' : 'VP9'}, ${{ pcm: 'PCM sound in a .mov', opus: 'Opus sound' }[support.audio.codec] || 'AAC sound'}).`
      : support.reason, support.ok ? 'ok' : 'error');
    if (state.project) goTo('script');
    else if (!state.brief.sourceText && !state.assets.length) showLaunch(true);
  }

  init();
})();
