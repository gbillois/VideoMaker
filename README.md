# Video Maker

Turns a brief, documents (PDF, PowerPoint, Word) or a GitHub repository into narrated videos, one MP4 per language (English, French, German). An AI writes the script, a voice speaks it, and the film is drawn and encoded in the browser (Canvas, WebCodecs, an in-browser MP4 muxer).

It is a **static page with no server**. You bring your own API keys, as in CrisisMaker: they go straight from the page to your providers, stay in the browser tab (session storage) and are never saved in project files. Nothing to install, no account to create besides your own provider accounts.

## What it does

1. **Content**: a source box (text, documents, a GitHub repository), pictures (drop, paste, upload) and a brief (purpose, name, length, languages, look, rhythm).
2. **Edit**: timeline, live preview and an inspector for the selected scene and the whole film (look, format, voice, music, captions).
3. **Export**: one MP4 per language, plus the project as a JSON file you can save and reopen.

Pictures can be GIFs or short video clips (MP4 or WebM, 6 seconds and 8 MB at most, three per project). A clip plays in a loop inside the scene that shows it, and the Start and Length fields on its card cut another window out of the original file.

Four looks render the same project: Slides, Product (the default), Showcase and Launch.

## AI settings (top right)

| | Options | You need |
| --- | --- | --- |
| **Script writer** | Claude (Anthropic), OpenAI, OpenRouter, a local OpenAI-compatible server (Ollama's `/v1`, LM Studio, llama.cpp) | an API key (none for a local server) and a model; **Refresh** lists the models your key can use |
| **Voice-over** | Azure Speech (Microsoft neural voices) or OpenAI voices | the voice provider's key (Azure: and its region, for example `westeurope`) |

Without a voice key the film plays and exports with music and captions only.

Claude is called with `anthropic-dangerous-direct-browser-access`, which is how Anthropic allows calls made from a web page with the user's own key. A local server must allow requests from the page (for Ollama: `OLLAMA_ORIGINS=*` or the page's origin).

Not available without a server: reading a web page by its address and capturing a URL as a picture. Paste the text, or upload a screenshot, instead.

## Run it

```sh
npm start        # http://localhost:8080 (a dependency-free static server)
```

Any static file server does the same job: the page is `index.html` and its folders, with relative paths.

## Publish it

GitHub Pages: repository **Settings > Pages**, source **Deploy from a branch**, branch `main`, folder `/ (root)`. The site is then at `https://<user>.github.io/VideoMaker/`. Any other static host works the same way (Netlify, an S3 bucket, a company web server).

## Develop

```sh
npm install
npm run verify   # ESLint and the Vitest tests (mocked fetch: no key, no network)
```

```
index.html           the page (and its Content Security Policy)
css/  js/  assets/   styles, scripts, logos and fonts
js/videomaker/       the app: engines, audio, export, documents, clips
js/videomaker/lib/   ES modules: AI providers, script writer, GitHub, voices, settings
js/vendor/pdfjs/     pdf.js (Apache-2.0), reads PDF files in the browser
tests/               Vitest tests
docs/SPECS.md        flow, modules, hosting
```

The page is a 3-step SPA. Its "API" (`js/videomaker/api.js`) answers the page with real `Response` objects, so every step that used to be a server call now runs in the browser.
