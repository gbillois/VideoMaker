// Video Maker line icons (24×24 viewBox, drawn with a stroke on the canvas).
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  const PATHS = {
    spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
    shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 3',
    users: 'M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
    chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM21 21l-5-5',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    doc: 'M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h7',
    cloud: 'M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
    gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    check: 'M4 12l5 5L20 6',
    target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
    globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
    cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
    rocket: 'M12 15l-3-3c1-5 5-9 11-9 0 6-4 10-9 11zM9 12l-4 1-2 3 4 1M12 15l-1 4-3 2-1-4M15 8.5a1.5 1.5 0 1 0 .01 0',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
    euro: 'M18 6a7 7 0 1 0 0 12M4 10h10M4 14h10',
    brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4.5A3 3 0 0 0 9 4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2',
  };

  const cache = new Map();
  VM.ICON_NAMES = Object.keys(PATHS);

  /** Draws icon `name` centred on (cx, cy), `size` px wide. */
  VM.drawIcon = function (ctx, name, cx, cy, size, color, lineWidth) {
    const d = PATHS[name] || PATHS.spark;
    if (!cache.has(d)) cache.set(d, new Path2D(d));
    const scale = size / 24;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = (lineWidth || 2) / 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(cache.get(d));
    ctx.restore();
  };
})();
