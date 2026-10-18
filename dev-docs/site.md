# The website

`site/` is an Astro + Starlight project deployed to GitHub Pages at
`https://alex-roc.github.io/threeplay.js/` (`base: "/threeplay.js"`). Every internal link goes
through `url()` in `site/src/lib/url.ts` so it respects the base.

```sh
pnpm --filter threeplay build   # the site vendors the standalone build: build the engine first
pnpm site:dev                   # prepare + astro dev (http://localhost:4321/threeplay.js/)
pnpm site:build                 # prepare + astro build -> site/dist
pnpm thumbs                     # re-shoot the examples (pnpm smoke) into site/src/assets/thumbs/
```

## What lives where

- `site/scripts/prepare.mjs` runs before dev and build. It copies `packages/threeplay/dist/standalone/`
  to `public/vendor/threeplay/` and every `examples/<name>/` to `public/play/<name>/` with an import
  map (`threeplay` -> `../../vendor/threeplay/threeplay.mjs`). Both folders are generated and
  gitignored, as is `src/content/docs/api/` (typedoc output).
- Landing (`pages/index.astro`), gallery and example pages (`pages/examples/`) and the playground
  (`pages/playground.astro`) are custom pages on `layouts/Site.astro`; `styles/site.css` is their
  stylesheet. The docs are Starlight (`src/content/docs/`, themed by `styles/starlight.css`).
- `src/data/examples.ts` holds the copy of every example (title, genre, controls...) and reads each
  `main.js` at build time. **Adding an example** means a folder in `examples/`, an entry there and a
  thumbnail (`pnpm thumbs`).
- `components/PlayFrame.astro` is the click-to-play facade: games (Rapier alone is ~1.7 MB gzip) load
  only when asked. `lib/runner.ts` builds the playground's `srcdoc` (import map + user code +
  a bridge that posts console output and errors to the parent) and encodes the code for the URL.
- Playground: CodeMirror 6, code saved in `#code=<base64url>` and `localStorage`, `?example=<name>`
  loads an example. Ctrl/Cmd+Enter runs.
- API reference: `starlight-typedoc` from `packages/threeplay/src/index.ts`; it regenerates on every
  build from the TSDoc, so documenting a public function is all it takes.

## Gotchas

- Starlight 0.39+ no longer accepts `autogenerate` next to a `label`: use `items: [{ autogenerate }]`.
- Astro 7 strips Shiki themes it does not know about from the server bundle: import the theme object
  (`@shikijs/themes/night-owl`) and pass it to `<Code theme={...}>`; a theme name string fails the build.
- `astro dev` detaches into the background in Astro 7 (`astro dev stop`, `astro dev logs`).
- typedoc does not support TypeScript 7: keep `typescript` pinned to 6.x in the repo.
- GitHub Pages must be enabled (Settings > Pages > Source: GitHub Actions) before
  `.github/workflows/site.yml` can deploy; it is `workflow_dispatch` only for now.
