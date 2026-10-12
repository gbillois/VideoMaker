// Video Maker documents: reads the text (and the pictures) of a PPTX or DOCX
// file in the browser, with no library: an Office file is a ZIP of XML parts.
// A PDF file is read with the vendored pdf.js (js/vendor/pdfjs), also in the browser.
(function () {
  'use strict';
  const VM = (window.VM = window.VM || {});

  const SCRIPT_URL = document.currentScript ? document.currentScript.src : '';
  const MAX_PDF_BYTES = 10 * 1024 * 1024;
  const MAX_PDF_PAGES = 200;
  const MAX_PDF_CHARS = 200_000;

  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const MAX_PICTURES = 8;
  // Pictures under this size are icons, bullets or logos, not screenshots.
  const MIN_PICTURE_BYTES = 24 * 1024;

  /** Lists the entries of a ZIP archive (central directory; no ZIP64). */
  function zipEntries(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65_557); offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
    }
    if (end < 0) throw new Error('not a valid Office file');
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    const entries = new Map();
    for (let index = 0; index < count; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('damaged Office file');
      const method = view.getUint16(offset + 10, true);
      const size = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const local = view.getUint32(offset + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
      entries.set(name, { method, size, local });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function zipRead(buffer, entry) {
    const view = new DataView(buffer);
    const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
    const data = new Uint8Array(buffer, start, entry.size);
    if (entry.method === 0) return data;
    if (entry.method !== 8) throw new Error('unsupported compression in the Office file');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function zipText(buffer, entries, name) {
    const entry = entries.get(name);
    return entry ? new TextDecoder().decode(await zipRead(buffer, entry)) : '';
  }

  function xml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  /** Paragraph texts of an XML part: runs joined, one line per paragraph. */
  function paragraphs(doc, ns) {
    return [...doc.getElementsByTagNameNS(ns, 'p')].map(p => {
      let line = '';
      for (const node of p.getElementsByTagNameNS(ns, '*')) {
        if (node.localName === 't') line += node.textContent;
        else if (node.localName === 'tab') line += ' ';
        else if (node.localName === 'br') line += '\n';
      }
      return line.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean);
  }

  const number = name => Number((name.match(/(\d+)\.xml$/) || [])[1] || 0);

  async function pptxText(buffer, entries) {
    const slides = [...entries.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => number(a) - number(b));
    const out = [];
    for (const [index, name] of slides.entries()) {
      const lines = paragraphs(xml(await zipText(buffer, entries, name)), NS_A);
      // speaker notes, found through the slide's relationships
      const rels = await zipText(buffer, entries, name.replace('slides/', 'slides/_rels/') + '.rels');
      const target = (rels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/) || [])[1];
      const notes = target ? paragraphs(xml(await zipText(buffer, entries, `ppt/notesSlides/${target}`)), NS_A)
        .filter(line => !/^\d+$/.test(line)) : [];
      if (!lines.length && !notes.length) continue;
      out.push(`Slide ${index + 1}:\n${lines.join('\n')}${notes.length ? `\nSpeaker notes: ${notes.join(' ')}` : ''}`);
    }
    return out.join('\n\n');
  }

  async function docxText(buffer, entries) {
    return paragraphs(xml(await zipText(buffer, entries, 'word/document.xml')), NS_W).join('\n');
  }

  async function officePictures(buffer, entries, folder) {
    const found = [...entries.entries()]
      .filter(([name, entry]) => name.startsWith(folder) && /\.(png|jpe?g)$/i.test(name) && entry.size >= MIN_PICTURE_BYTES)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, MAX_PICTURES);
    const pictures = [];
    for (const [name, entry] of found) {
      const bytes = await zipRead(buffer, entry);
      pictures.push({ name: name.split('/').pop(), blob: new Blob([bytes], { type: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg' }) });
    }
    return pictures;
  }

  VM.documentKind = function (file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
    if (name.endsWith('.pptx') || /presentationml/.test(file.type)) return 'pptx';
    if (name.endsWith('.docx') || /wordprocessingml/.test(file.type)) return 'docx';
    return null;
  };

  /** The text of a PDF file, page by page (pictures and scans are not read). */
  VM.readPdf = async function (file) {
    if (file.size > MAX_PDF_BYTES) throw new Error('PDF too large (10 MB at most)');
    const pdfjs = await import(new URL('../vendor/pdfjs/pdf.min.mjs', SCRIPT_URL).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', SCRIPT_URL).href;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      const pages = [];
      let length = 0;
      for (let number = 1; number <= Math.min(pdf.numPages, MAX_PDF_PAGES) && length < MAX_PDF_CHARS; number++) {
        const content = await (await pdf.getPage(number)).getTextContent();
        const text = content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('')
          .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if (text) { pages.push(text); length += text.length; }
      }
      if (!pages.length) throw new Error('no text in this PDF (a scan?)');
      return pages.join('\n\n').slice(0, MAX_PDF_CHARS);
    } finally {
      await pdf.destroy();
    }
  };

  /** Reads a PPTX or DOCX file: { text, pictures: [{ name, blob }] }. */
  VM.readOfficeDocument = async function (file) {
    const kind = VM.documentKind(file);
    if (kind !== 'pptx' && kind !== 'docx') throw new Error('only PDF, PPTX and DOCX files are supported');
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot open Office files; please update it');
    const buffer = await file.arrayBuffer();
    const entries = zipEntries(buffer);
    const text = kind === 'pptx' ? await pptxText(buffer, entries) : await docxText(buffer, entries);
    const pictures = await officePictures(buffer, entries, kind === 'pptx' ? 'ppt/media/' : 'word/media/');
    return { text, pictures };
  };
})();
