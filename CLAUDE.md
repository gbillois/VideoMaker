# Video Maker: instructions for Claude Code

- `docs/SPECS.md` is the living spec. Update it for structural changes only: modules added or removed, AI settings, the flow, hosting, CI/CD. Not for bug fixes, CSS tweaks or refactors.
- The app is a static page with no server and no backend dependency. Keys belong to the user (AI settings): sessionStorage for keys, never in project files, never in a URL or a log.
- Front end: vanilla JS and CSS, no npm package at run time. Mobile-first CSS. Every path in `index.html`, CSS and JS is relative (the site is served from a sub-path on GitHub Pages).
- New ES modules go in `js/videomaker/lib/`; they must not touch the DOM, so they can be tested in Node with a mocked `fetch`.
- Before every commit: `npm run verify` (ESLint and Vitest).
- Scripts in `index.html` carry one shared `?v=` cache-busting version: bump it on every front-end change.
- Publishing is GitHub Pages from `main`.
