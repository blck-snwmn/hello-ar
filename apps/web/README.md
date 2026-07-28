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
- Uses hit-test surface normals to find a near-vertical wall.
- Ignores horizontal hit-test results from floors and tables.
- Shows a reticle on the detected wall.
- Places a compact 46 × 62 cm window at the selected wall position.
- Uses a WebXR Anchor when supported and falls back to the tracked wall pose.
- Aligns the back of the frame with the detected wall surface.
- Uses a rectangular stencil aperture so the room is visible only through the window.
- Keeps the generated room and splat entirely behind the detected wall plane.
- Renders a small room behind the window so head movement reveals parallax.
- Renders a procedural Gaussian splat inside that room with Spark.js.
- Repeated taps move the same window.

The current proof of concept generates the window, room, and splat procedurally.
It does not depend on an externally hosted visual asset.

The AR code lives in `src/scripts/ar.ts`. It is intentionally kept inside the web app instead of a shared package.
