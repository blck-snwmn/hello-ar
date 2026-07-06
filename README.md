# hello-ar

Android Chrome で WebXR の家具配置に近い AR を試すためのサンプルです。

## Structure

```text
apps/
  web/      Astro static site deployed with Cloudflare Workers Static Assets
  android/  Placeholder for a future native Android app
docs/
  architecture.md
```

The first implementation is only `apps/web`. Shared packages are intentionally not used until there is a real native app that proves what should be shared.

## Web

```sh
cd apps/web
pnpm dev
pnpm build
pnpm run deploy
```

`pnpm run deploy` builds the static Astro site and deploys `dist/` with Wrangler. Use the deployed HTTPS URL on Android Chrome for AR testing.
