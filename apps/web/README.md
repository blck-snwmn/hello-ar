# hello-ar-web

Astro static site for the WebXR and Spark.js AR placement sample.

## Develop

```sh
pnpm dev
```

## Build

```sh
pnpm build
```

## Deploy

```sh
pnpm run deploy
```

`deploy` builds the site before running Wrangler.

## Cloudflare Types

```sh
pnpm run cf-typegen
```

Local development is useful for layout and fallback checks. Android AR testing should use the deployed Cloudflare Workers HTTPS URL.

## AR behavior

- Starts an `immersive-ar` WebXR session when supported.
- Uses hit-test to find a floor or table surface.
- Shows a reticle on the detected surface.
- Renders a Gaussian splat with Spark.js in the Three.js scene.
- Places the sample splat on the detected surface. Repeated taps move the same sample.

The current proof of concept generates a small splat sphere procedurally. It does
not depend on an externally hosted visual asset.

The AR code lives in `src/scripts/ar.ts`. It is intentionally kept inside the web app instead of a shared package.
