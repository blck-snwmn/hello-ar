# hello-ar-web

Astro static site for the WebXR AR placement sample.

## Commands

```sh
pnpm dev
pnpm build
pnpm run deploy
pnpm run cf-typegen
```

Local development is useful for layout and fallback checks. Android AR testing should use the deployed Cloudflare Workers HTTPS URL.

## AR behavior

- Starts an `immersive-ar` WebXR session when supported.
- Uses hit-test to find a floor or table surface.
- Shows a reticle on the detected surface.
- Places a small test box: `0.3m x 0.3m x 0.3m`.

The AR code lives in `src/scripts/ar.ts`. It is intentionally kept inside the web app instead of a shared package.
