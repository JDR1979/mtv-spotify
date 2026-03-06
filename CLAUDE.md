# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page, no-build, no-dependencies Spotify visualizer. Open `index.html` directly in a browser — there is no build step, no package manager, no server required.

To run: open `index.html` in a browser. For OAuth to work, it must be served over HTTP (not `file://`) — use any static file server, e.g.:
```
npx serve .
```
Or deploy to GitHub Pages / Netlify (the `REDIRECT_URI` in `app.js` auto-detects the origin).

## Architecture

Two files:
- **`index.html`** — all markup and CSS inline in `<style>`. Loads `app.js?v=N` at the bottom (bump N whenever app.js changes to bust browser cache).
- **`app.js`** — all application logic as a plain script (no modules, no bundler). Runs in global scope.

### Key concepts in `app.js`

**Auth:** Spotify OAuth 2.0 with PKCE. Tokens stored in `localStorage`. PKCE verifier/challenge pre-generated on page load (synchronously) so the login button click is fully synchronous. Token refresh is handled automatically on 401.

**Polling:** `update()` uses recursive `setTimeout(update, 2000)` (not `setInterval`) to prevent stacking. Polls `/me/player/currently-playing` every 2 seconds.

**Animation:** A single `requestAnimationFrame` loop (`runAnimation`) drives two mutually exclusive modes:
- **Ken Burns (ZOOM mode):** A state machine (`ZOOM_IN → HOLD_PEAK → FADE_OUT → FADE_IN → ZOOM_OUT → HOLD_START → ZOOM_IN…`) pans and zooms album art using `transform: scale()` and `transformOrigin`. All movement is linear — no CSS transitions on the art element (intentional, see comment in HTML).
- **DVD Bounce mode:** Bounces the album art around the viewport using absolute pixel positioning. Triggers a white flash (`#corner-flash`) on corner hits.

**Visibility modes:** Clock, controls, and song info each have 3 states (`ON / FADE / OFF`) controlled by CSS classes `ui-hidden` and `vis-off`. The idle timer (3s) hides UI elements after no mouse movement.

**Album label fetch:** When the album changes, `fetchAlbumLabel(albumId)` calls `GET /v1/albums/{id}?market=from_token`. The `market=from_token` parameter is required to avoid 403 errors but causes the `label` field to be stripped from the response. The fallback is to extract the label from `data.copyrights` — find the entry with `type: 'P'` (phonogram) and parse the label name out of the copyright text (strip `℗`/`©`/`(P)`/`(C)`, strip leading "This [word] YYYY" prefix, truncate at the first comma or legal suffix like "Limited", "under", "a division of").

## Credits overlay (`#credits`)

Displays bottom-left over the album art. Four lines:
1. `#artist-name` — artist
2. `#song-name` — track title in quotes
3. `#album-name` — album title, italic (`font-style: italic`)
4. `#label-line` — record label and year, e.g. `Island Records (1984)`, `white-space: nowrap`

The `credits-focal` class scales the overlay up (`transform: scale(1.5)`) during the first/last 15 seconds of a track.

## Font

All text uses **Neue Kabel** (`font-family: neue-kabel, sans-serif; font-weight: 900`) served via Adobe Fonts (Typekit). The kit URL is `https://use.typekit.net/cis2web.css` loaded in `<head>`. Adobe Fonts kits are domain-restricted — add every domain you serve from (localhost, GitHub Pages URL, etc.) in the Adobe Fonts project settings or the font will not load.

## Spotify API

**Scopes:** `user-read-currently-playing`, `user-modify-playback-state`, `user-library-read`, `user-library-modify`

**Endpoints used:**
- `GET /me/player/currently-playing` — main poll (every 2s)
- `GET /me/tracks/contains?ids={id}` — like status check
- `PUT/DELETE /me/tracks?ids={id}` — like/unlike
- `POST /me/player/play`, `pause`, `next`, `previous` — playback control
- `GET /v1/albums/{id}?market=from_token` — full album details for label/copyright

**Token handling:** 401 responses trigger `refreshAccessToken()`. The album fetch also retries once after a 401. The `me/tracks/contains` endpoint may return 403 on free Spotify accounts.

## Changing the Spotify app

The `CLIENT_ID` is hardcoded at the top of `app.js`. To use a different Spotify developer app, update it there and ensure the redirect URI is registered in the Spotify developer dashboard.

## Deployment notes

- **Cache busting:** `index.html` loads `app.js?v=N`. Increment `N` in `index.html` whenever `app.js` changes, so browsers don't serve a stale cached version.
- **GitHub Pages:** Push to `main` branch at `github.com/JDR1979/mtv-spotify`. Changes are live within a minute.
- **No SRI on Typekit:** The Adobe Fonts CDN updates its CSS dynamically so Subresource Integrity cannot be applied — this is an accepted trade-off.
