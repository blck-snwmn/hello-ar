# Architecture

## Current target

The current app is a WebAR sample for Android Chrome. Cloudflare Workers is used only as the HTTPS static hosting target.

```text
Astro static build -> dist/ -> Cloudflare Workers Static Assets -> Android Chrome
```

## AR boundary

AR behavior runs in the browser with WebXR and Three.js:

- session start: `immersive-ar`
- surface detection: WebXR hit-test
- placement unit: meters
- first object: a furniture-sized box

The Worker does not run AR logic or app APIs.

## Native boundary

`apps/android` is reserved for a future native Android app. There is no shared `packages/` directory yet because the WebXR and native ARCore boundaries are different enough that early shared code would likely be speculative.

If a native app is added later, move only proven shared data out of `apps/web`, such as stable object dimensions or model assets.
