/* global VideoEncoder, AudioEncoder, AudioData, VideoFrame */
// Video Maker export: draws every frame of a timeline, encodes it with
// WebCodecs and muxes the file in the browser. No server-side rendering.
// Audio: AAC in an MP4 when the browser can encode it; otherwise, with H.264
// video, uncompressed PCM in a QuickTime .mov (Safari: Apple devices cannot
// play Opus inside an MP4); Opus only alongside VP9.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  // H.264 plays everywhere (PowerPoint, QuickTime, LinkedIn). VP9 is the last
  // resort for browsers without an H.264 encoder (open-source Chromium builds).
  const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.420028', 'vp09.00.40.08'];

  /**
   * Safari and every iOS browser run WebKit, whose WebCodecs AAC output has
   * produced silent files on iPhone: there, sound always goes out as PCM in a
   * QuickTime .mov, the format Apple devices play natively.
   */
  function isAppleWebKit() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR|Firefox)\//.test(ua);
    return ios || safari;
  }

  VM.exportSupport = async function (size) {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return { ok: false, reason: 'WebCodecs is not available: use a recent Chrome or Edge.' };
    const { width, height } = size || VM.SIZE;
    const video = await pickVideoConfig(width, height, (size && size.fps) || 30, (size && size.bitrate) || 8_000_000);
    if (!video) return { ok: false, reason: 'This browser cannot encode 1080p video.' };
    let audio = await pickAudioConfig();
    if ((!audio || audio.codec === 'opus' || isAppleWebKit()) && video.codec.startsWith('avc1')) {
      audio = { codec: 'pcm', sampleRate: 48000, numberOfChannels: 2 };
    }
    return { ok: !!audio, video, audio, reason: audio ? '' : 'No audio encoder (AAC or Opus) available.' };
  };

  async function pickVideoConfig(width, height, fps, bitrate) {
    for (const codec of VIDEO_CODECS) {
      for (const acceleration of ['prefer-hardware', 'no-preference']) {
        const config = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration: acceleration };
        if (codec.startsWith('avc1')) config.avc = { format: 'avc' };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) return support.config;
        } catch { /* try the next one */ }
      }
    }
    return null;
  }

  async function pickAudioConfig() {
    const candidates = [
      { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000, aac: { format: 'aac' } },
      { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 },
    ];
    for (const config of candidates) {
      try {
        const support = await AudioEncoder.isConfigSupported(config);
        if (support.supported) return support.config;
      } catch { /* next */ }
    }
    return null;
  }

  function copyChunk(chunk) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return { data, timestamp: chunk.timestamp, duration: chunk.duration || 0, key: chunk.type === 'key' };
  }

  function drain(encoder, limit) {
    if (encoder.encodeQueueSize <= limit) return Promise.resolve();
    return new Promise(resolve => {
      const check = () => (encoder.encodeQueueSize <= limit ? resolve() : setTimeout(check, 2));
      check();
    });
  }

  /** 16-bit little-endian interleaved PCM, in ~1 s blocks. */
  function pcmBlocks(buffer) {
    const channels = [buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)];
    const size = buffer.sampleRate;
    const blocks = [];
    for (let offset = 0; offset < buffer.length; offset += size) {
      const frames = Math.min(size, buffer.length - offset);
      const view = new DataView(new ArrayBuffer(frames * 4));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < 2; c++) {
          const v = Math.max(-1, Math.min(1, channels[c][offset + i]));
          view.setInt16((i * 2 + c) * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        }
      }
      blocks.push({ data: new Uint8Array(view.buffer), frames, timestamp: Math.round(offset * 1e6 / buffer.sampleRate) });
    }
    return { codec: 'pcm', sampleRate: buffer.sampleRate, channels: 2, samples: blocks };
  }

  /**
   * The AAC AudioSpecificConfig (2 bytes for AAC-LC) from whatever an encoder
   * returns as its description: the raw config, or an ES_Descriptor / esds
   * wrapper around it (as some encoders hand back their "magic cookie").
   */
  function audioSpecificConfig(description) {
    if (!description) return null;
    let bytes = description instanceof Uint8Array ? description
      : ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
        : new Uint8Array(description);
    // A whole 'esds' box: skip size, type, version and flags.
    if (bytes.length > 12 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === 'esds') bytes = bytes.subarray(12);
    if (bytes[0] !== 0x03 && bytes[0] !== 0x04) return bytes.length >= 2 && bytes.length <= 16 ? bytes : null;
    // Walk the MPEG-4 descriptors down to DecoderSpecificInfo (tag 0x05).
    let i = 0;
    const readLength = () => {
      let length = 0;
      for (let k = 0; k < 4 && i < bytes.length; k++) {
        const b = bytes[i++];
        length = (length << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return length;
    };
    while (i < bytes.length) {
      const tag = bytes[i++];
      const length = readLength();
      if (tag === 0x05) return bytes.subarray(i, i + length);
      if (tag === 0x03) {
        i += 2; // ES_ID
        const flags = bytes[i++];
        if (flags & 0x80) i += 2;
        if (flags & 0x40) i += 1 + bytes[i];
        if (flags & 0x20) i += 2;
      } else if (tag === 0x04) {
        i += 13; // objectType, streamType, buffer size, max and average bitrate
      } else {
        i += length;
      }
    }
    return null;
  }
  VM.audioSpecificConfig = audioSpecificConfig;

  /** Safari may emit AAC with ADTS headers: strip them, keep the AudioSpecificConfig. */
  function stripAdts(samples) {
    let asc = null;
    for (const sample of samples) {
      const d = sample.data;
      if (d.length > 7 && d[0] === 0xff && (d[1] & 0xf6) === 0xf0) {
        if (!asc) {
          const profile = (d[2] >> 6) + 1;
          const index = (d[2] >> 2) & 15;
          const channels = ((d[2] & 1) << 2) | (d[3] >> 6);
          asc = new Uint8Array([(profile << 3) | (index >> 1), ((index & 1) << 7) | (channels << 3)]);
        }
        sample.data = d.subarray((d[1] & 1) ? 7 : 9);
      }
    }
    return asc;
  }

  async function encodeAudio(buffer, config, onProgress) {
    if (config.codec === 'pcm') return pcmBlocks(buffer);
    const samples = [];
    let description = null;
    let failure = null;
    const encoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description) description = meta.decoderConfig.description;
        samples.push(copyChunk(chunk));
      },
      error: error => { failure = error; },
    });
    encoder.configure(config);
    const channels = [buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)];
    const block = 4800;
    for (let offset = 0; offset < buffer.length; offset += block) {
      if (failure) throw failure;
      const frames = Math.min(block, buffer.length - offset);
      const data = new Float32Array(frames * 2);
      data.set(channels[0].subarray(offset, offset + frames), 0);
      data.set(channels[1].subarray(offset, offset + frames), frames);
      const audioData = new AudioData({
        format: 'f32-planar', sampleRate: buffer.sampleRate, numberOfFrames: frames, numberOfChannels: 2,
        timestamp: Math.round(offset * 1e6 / buffer.sampleRate), data,
      });
      encoder.encode(audioData);
      audioData.close();
      if (offset % (block * 50) === 0) {
        await drain(encoder, 20);
        onProgress(offset / buffer.length);
      }
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    if (!samples.length) throw new Error('The browser encoded no audio. Try Chrome or Edge on a computer.');
    if (config.codec !== 'opus') {
      const adts = stripAdts(samples);
      description = audioSpecificConfig(description) || adts || null;
    }
    let preSkip = 312;
    if (config.codec === 'opus' && description) {
      const head = new Uint8Array(description instanceof ArrayBuffer ? description : description.buffer);
      if (head.length >= 12) preSkip = head[10] | (head[11] << 8);
    }
    return {
      codec: config.codec === 'opus' ? 'opus' : 'aac', sampleRate: config.sampleRate, channels: 2,
      bitrate: config.bitrate, description: config.codec === 'opus' ? null : description, preSkip, samples,
    };
  }

  /**
   * Reads the finished file's sound back: 'ok', 'silent', or 'unreadable' when
   * this browser cannot decode it (the file may still play elsewhere).
   */
  async function checkAudio(blob) {
    try {
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const data = decoded.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 97) peak = Math.max(peak, Math.abs(data[i]));
      return peak > 0.001 ? 'ok' : 'silent';
    } catch {
      return 'unreadable';
    }
  }

  /**
   * opts: { project, timeline, images, captions, soundtrack: AudioBuffer, fps, onProgress(stage, ratio), isCancelled() }
   * Other pages (the front-page newscast) pass { size, duration, draw(ctx, seconds), bitrate } instead of a project.
   */
  VM.renderMp4 = async function (opts) {
    const fps = opts.fps || 30;
    const { width, height } = opts.size || VM.frameSize(opts.project);
    const support = await VM.exportSupport({ width, height, fps, bitrate: opts.bitrate });
    if (!support.ok) throw new Error(support.reason);
    if (VM.fontsReady) await VM.fontsReady();
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { alpha: false });
    const env = { project: opts.project, images: opts.images, captions: opts.captions, captionStyle: opts.captionStyle };
    const samples = [];
    let description = null;
    let failure = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta && meta.decoderConfig && meta.decoderConfig.description) description = meta.decoderConfig.description;
        samples.push(copyChunk(chunk));
      },
      error: error => { failure = error; },
    });
    encoder.configure(support.video);
    const draw = opts.draw || ((context, seconds) => VM.renderFrame(context, opts.timeline, seconds, env));
    const total = Math.ceil((opts.duration || opts.timeline.duration) * fps);
    const frameDuration = Math.round(1e6 / fps);
    for (let i = 0; i < total; i++) {
      if (failure) throw failure;
      if (opts.isCancelled && opts.isCancelled()) { encoder.close(); throw new Error('Export cancelled'); }
      draw(ctx, i / fps);
      const frame = new VideoFrame(canvas, { timestamp: i * frameDuration, duration: frameDuration });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      await drain(encoder, 6);
      if (i % 10 === 0) opts.onProgress('frames', i / total);
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    opts.onProgress('frames', 1);
    const audio = opts.soundtrack ? await encodeAudio(opts.soundtrack, support.audio, r => opts.onProgress('audio', r)) : null;
    opts.onProgress('mux', 0);
    const codec = support.video.codec.startsWith('vp09') ? 'vp9' : 'avc';
    const blob = VM.muxMp4({ codec, width, height, description, samples }, audio);
    opts.onProgress('mux', 1);
    const audioCheck = audio ? await checkAudio(blob) : 'none';
    return {
      blob, audioCodec: audio ? audio.codec : null, videoCodec: support.video.codec, audioCheck,
      extension: blob.type === 'video/quicktime' ? 'mov' : 'mp4',
    };
  };
})();
