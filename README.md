# store

An app store for Solid apps on your pod.

Aggregates every curated bundle from [`solid-apps/bundles`](https://github.com/solid-apps/bundles),
merges them into a single catalogue, probes which apps are already on
your pod, and lets you copy a one-line install command for the rest.

**Live demo (preview, no pod):** [solid-apps.github.io/store](https://solid-apps.github.io/store/)

Served from your pod at `/public/apps/store/` once installed.

## What it does

- **All apps in one place** — `default`, `starter`, `jspod`, `all`, `media`, `productivity`, `agentic`, `teams` bundles, deduped.
- **Live install status** — reads `/public/apps/` from the pod it's served from. Installed apps show ✓ Installed.
- **One-click install** — copies `jspod install <spec>` to your clipboard. Paste in your terminal, the app lands on your pod, refresh the store and home picks it up.
- **Search + filter** — All / Installed / Available, plus full-text search across names + descriptions.
- **PWA** — install to home screen, theme color matches the suite.

## Why "copy command" instead of one-click install?

A browser-based app can't `git push` to the pod's `/public/apps/<name>/` without help — that's a developer-machine operation. There are three options for one-click:

1. JSS adds an `/api/install` endpoint (the right long-term answer, real engineering)
2. A sidecar Node service runs `jspod install` on request (works without JSS changes; new long-running service)
3. Browser-side git via `isomorphic-git` (heavy, fragile)

For v1, copy-to-clipboard is honest about the model and ships today. v2 will wire JSS's install endpoint when it lands.

## How it builds the catalogue

`store.js` fetches each known bundle from `raw.githubusercontent.com/solid-apps/bundles/HEAD/<name>.jsonld` in parallel, merges them by app name, and notes which bundles each app appears in. Adding a new bundle to the suite = adding its name to the `BUNDLE_NAMES` constant in `store.js`.

## License

[AGPL-3.0-only](./LICENSE)
