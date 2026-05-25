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
- **One-click install** — when signed in (login pill), the app's files are fetched from `raw.githubusercontent` and `PUT` straight onto your pod under `/public/apps/<name>/`; the card flips to ✓ Installed and home picks it up. Signed out, it falls back to copying the `jspod install <spec>` command for a terminal pod.
- **Search + filter** — All / Installed / Available, plus full-text search across names + descriptions.
- **PWA** — install to home screen, theme color matches the suite.

## How install works

No server-side endpoint needed: the browser resolves the app spec to its source
repo (`name` → `solid-apps/<name>@gh-pages`; `org/repo` and `#branch` honored),
lists the files via the GitHub trees API, fetches each from
`raw.githubusercontent` (always the current commit), and `PUT`s them to
`/public/apps/<name>/` with `window.xlogin.authFetch`. Dot-prefixed resources
(e.g. `.gitignore`) are skipped — JSS reserves them. Same path the `settings`
app uses to update apps.

## How it builds the catalogue

`store.js` fetches each known bundle from `raw.githubusercontent.com/solid-apps/bundles/HEAD/<name>.jsonld` in parallel, merges them by app name, and notes which bundles each app appears in. Adding a new bundle to the suite = adding its name to the `BUNDLE_NAMES` constant in `store.js`.

## License

[AGPL-3.0-only](./LICENSE)
