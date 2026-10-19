# Releasing

1. Every user-facing change adds a changeset (`pnpm changeset`).
2. To release: `pnpm changeset version` (bumps `packages/threeplay/package.json` and writes
   `CHANGELOG.md`), then `pnpm build && pnpm test && pnpm smoke`, commit and push.
3. Publish from `packages/threeplay` with **npm** (not `pnpm publish`) in a real terminal:
   `npm login` (web flow; it needs a TTY) and `npm publish --access public` (2FA).
   Being logged in is not enough: every publish asks for 2FA. Without a TTY (an agent, CI,
   `!` in Claude Code) npm fails at once with `EOTP` instead of waiting for the browser, so
   either run `npm publish` in a real terminal or pass a code: `npm publish --otp 123456`.
   A `202` answer ("Your package is being processed and may take a few minutes") is a success,
   but the version shows up in the registry a few minutes later: check
   `curl -s https://registry.npmjs.org/threeplay | jq '."dist-tags"'` before tagging.
4. Tag and release: `git tag -a threeplay@X.Y.Z -m "threeplay X.Y.Z" && git push origin threeplay@X.Y.Z`,
   then `gh release create threeplay@X.Y.Z` with the changelog section.
5. jsDelivr caches 404s: if the new version doesn't load, purge
   `https://purge.jsdelivr.net/npm/threeplay@X.Y/dist/standalone/threeplay.mjs`.

Notes:
- npm has *staged publishing* (since May 2026): `npm stage publish` (npm ≥ 11.15) uploads a version
  that a maintainer approves with 2FA (`npm stage list`, `npm stage approve <id>` or the package's
  "Staged packages" tab). For a brand-new package it publishes a `0.0.0-stage` placeholder; ours is
  left over from a first attempt with pnpm.
- The site redeploys to GitHub Pages on every push to `main` that touches the engine, the examples
  or the site (`.github/workflows/site.yml`).
