/* global ImageDecoder */
// Video Maker animated pictures: a GIF or a short video clip can stand in for a
// screenshot. The clip is sampled once into a handful of small frames (10 per
// second, 6 seconds at most). Each frame is then drawn on a "live" canvas that
// every scene engine already knows how to draw as a picture, so the preview and
// the MP4 export need no change: before each frame the live canvas is set to the
// clip frame that matches the scene time, which keeps the export deterministic.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  VM.CLIP_MAX = 3;
  VM.CLIP_MAX_BYTES = 8 * 1024 * 1024;
  const MAX_SECONDS = 6;
  const MIN_SECONDS = 0.5;
  VM.CLIP_MAX_SECONDS = MAX_SECONDS;
  const FPS = 10;
  const MAX_SIDE = 800;

  /** assetId → { frames: ImageBitmap[], times: number[], duration, live: canvas, index } */
  VM.clips = new Map();

  /** 'gif', 'video' or null for a plain picture. */
  VM.clipKind = async function (blob) {
    const type = blob.type || '';
    const name = blob.name || '';
    if (type.startsWith('video/') || /\.(mp4|m4v|webm|mov)$/i.test(name)) return 'video';
    if (type === 'image/gif' || /\.gif$/i.test(name)) return 'gif';
    try {
      if ((await blob.slice(0, 4).text()) === 'GIF8') return 'gif';
    } catch { /* unreadable: treated as a picture */ }
    return null;
  };

  function frameCanvas(width, height) {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    return canvas;
  }

  async function snapshot(canvas, source) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await createImageBitmap(canvas);
  }

  function once(target, done, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('the video took too long to read')), ms);
      function finish(error) {
        clearTimeout(timer);
        target.removeEventListener(done, ok);
        target.removeEventListener('error', fail);
        if (error) reject(error); else resolve();
      }
      const ok = () => finish();
      const fail = () => finish(new Error('this video cannot be read by the browser (use MP4 H.264 or WebM)'));
      target.addEventListener(done, ok);
      target.addEventListener('error', fail);
    });
  }

  /** The window kept from a source: `start` seconds in, `length` seconds long (6 at most). */
  function windowOf(trim) {
    const start = Math.max(0, Number(trim && trim.start) || 0);
    const length = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Number(trim && trim.length) || MAX_SECONDS));
    return { start, length };
  }

  async function decodeGif(blob, trim) {
    if (typeof ImageDecoder === 'undefined') throw new Error('this browser cannot play animated GIFs');
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    try {
      await decoder.tracks.ready;
      const count = Math.min(decoder.tracks.selectedTrack.frameCount, 3000);
      if (count < 2) return null;
      let { start, length } = windowOf(trim);
      const frames = [];
      const times = [];
      let canvas = null;
      let clock = 0;
      let next = 0;
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i });
        const span = Math.max(0.01, (image.duration || 100000) / 1e6);
        const relative = Math.max(0, clock - start);
        // A frame is kept when it overlaps the window and the 10 fps sampling is due.
        if (clock + span > start && clock < start + length && relative >= next - 1e-6) {
          canvas = canvas || frameCanvas(image.displayWidth, image.displayHeight);
          frames.push(await snapshot(canvas, image));
          times.push(relative);
          next = relative + 1 / FPS;
        }
        clock += span;
        image.close();
      }
      const sourceDuration = clock;
      if (frames.length < 2) { frames.forEach(frame => frame.close()); return null; }
      start = Math.min(start, Math.max(0, sourceDuration - MIN_SECONDS));
      length = Math.min(length, sourceDuration - start);
      return { kind: 'gif', frames, times, duration: Math.max(MIN_SECONDS, length), sourceDuration, trim: { start, length } };
    } finally {
      decoder.close();
    }
  }

  // Needs `media-src blob:` in the page CSP (set for videomaker.html in _headers).
  async function decodeVideo(blob, trim) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(blob);
    try {
      video.src = url;
      await once(video, 'loadeddata', 15000);
      if (!video.videoWidth) throw new Error('this video cannot be read by the browser (use MP4 H.264 or WebM)');
      const sourceDuration = Number.isFinite(video.duration) ? video.duration : MAX_SECONDS;
      const wanted = windowOf(trim);
      const start = Math.min(wanted.start, Math.max(0, sourceDuration - MIN_SECONDS));
      const length = Math.min(wanted.length, sourceDuration - start);
      const canvas = frameCanvas(video.videoWidth, video.videoHeight);
      const count = Math.max(2, Math.floor(length * FPS));
      const frames = [];
      const times = [];
      for (let i = 0; i < count; i++) {
        const time = Math.max(0, Math.min(start + i / FPS, sourceDuration - 0.01));
        if (Math.abs(video.currentTime - time) > 1e-3) {
          video.currentTime = time;
          await once(video, 'seeked', 8000);
        }
        frames.push(await snapshot(canvas, video));
        times.push(i / FPS);
      }
      return { kind: 'video', frames, times, duration: count / FPS, sourceDuration, trim: { start, length } };
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    }
  }

  /**
   * Samples a GIF or video file, from `trim.start` for `trim.length` seconds
   * (the first 6 seconds by default). Resolves to null for a GIF with a single frame.
   */
  VM.decodeClip = function (blob, kind, trim) {
    return kind === 'gif' ? decodeGif(blob, trim) : decodeVideo(blob, trim);
  };

  /** The original file as base64, kept in the project so a clip can be trimmed again later. */
  VM.clipSource = async function (blob, kind) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('unreadable file'));
      reader.readAsDataURL(blob);
    });
    return { mime: blob.type || (kind === 'gif' ? 'image/gif' : 'video/mp4'), data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  };

  VM.clipBlob = function (source) {
    const binary = atob(source.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: source.mime });
  };

  /** The saved form: JPEG frames, so a project reloads without the original file. */
  VM.packClip = function (clip) {
    const first = clip.frames[0];
    const canvas = document.createElement('canvas');
    canvas.width = first.width;
    canvas.height = first.height;
    const ctx = canvas.getContext('2d');
    return {
      kind: clip.kind,
      duration: Math.round(clip.duration * 1000) / 1000,
      sourceDuration: Math.round((clip.sourceDuration || clip.duration) * 1000) / 1000,
      trim: clip.trim || { start: 0, length: clip.duration },
      times: clip.times.map(time => Math.round(time * 1000) / 1000),
      frames: clip.frames.map(frame => {
        ctx.drawImage(frame, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
      }),
    };
  };

  VM.unpackClip = async function (packed) {
    const frames = [];
    for (const dataUrl of packed.frames) {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      frames.push(await createImageBitmap(img));
    }
    return { kind: packed.kind, frames, times: packed.times, duration: packed.duration, sourceDuration: packed.sourceDuration, trim: packed.trim };
  };

  function paint(clip, index) {
    const ctx = clip.live.getContext('2d');
    ctx.clearRect(0, 0, clip.live.width, clip.live.height);
    ctx.drawImage(clip.frames[index], 0, 0, clip.live.width, clip.live.height);
    clip.index = index;
  }

  /** Registers a clip for an asset; returns the canvas that stands in for the picture. */
  VM.registerClip = function (id, clip) {
    const live = document.createElement('canvas');
    live.width = clip.frames[0].width;
    live.height = clip.frames[0].height;
    const entry = Object.assign(clip, { live, index: -1 });
    VM.clips.set(id, entry);
    paint(entry, 0);
    return live;
  };

  VM.releaseClip = function (id) {
    const clip = VM.clips.get(id);
    if (!clip) return;
    clip.frames.forEach(frame => frame.close && frame.close());
    VM.clips.delete(id);
  };

  /**
   * Sets every clip to the frame for time `t`. A clip plays from the start of the
   * scene that shows it (the latest one at or before `t`) and loops.
   */
  VM.syncClips = function (timeline, t) {
    VM.clips.forEach((clip, id) => {
      const scenes = (timeline.scenes || []).filter(s => s.scene && s.scene.image === id);
      if (!scenes.length) return;
      let start = scenes[0].start;
      scenes.forEach(s => { if (s.start <= t) start = s.start; });
      const local = clip.duration > 0 ? Math.max(0, t - start) % clip.duration : 0;
      let index = 0;
      while (index + 1 < clip.times.length && clip.times[index + 1] <= local) index++;
      if (index !== clip.index) paint(clip, index);
    });
  };
})();
