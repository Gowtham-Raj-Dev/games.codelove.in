# games.codelove.in

Free 3D browser games, built from the models of [models.codelove.in](https://models.codelove.in). A static Next.js site hosted on GitHub Pages.

| URL | Page |
| --- | --- |
| `/` | all games |
| `/<game>/` | a game's page: trailer, how to play, controls, the models it uses |
| `/<game>/play/` | the game, full screen |
| `/about/`, `/contact/`, `/privacy/` | who makes the site, how to reach them, the privacy policy |

## Develop

```
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in out/
```

Each game lives in `src/components/games/<game>/` and describes itself in its `manifest.ts`; `src/lib/games.ts` lists them. A game's routes are `src/app/[slug]/page.tsx` (its page) and `src/app/<game>/play/page.tsx` (its player).

## Assets

`public/` holds the games' covers, trailers and music (`games/`) and only the 3D models the games load (`library/`, `models/`, `animations/`). They are copied from the model library's project:

```
npm run assets:sync    # from ../Models.Codelove.in — or SOURCE=path/to/it
```

Run it after adding a model to a game's `models` list or changing a game's files there.

## Deploy

Every push to `main` builds and publishes the site (`.github/workflows/pages.yml`). In the repository's settings, Pages → Source is "GitHub Actions" and the custom domain is `games.codelove.in` (DNS: a `CNAME` record `games` → `gowtham-raj-dev.github.io`).

## YouTube Playables

Six games build as stand-alone [YouTube Playables](https://developers.google.com/youtube/gaming/playables) bundles (no Next.js, every path
relative, YouTube's SDK loaded before the game): Skate Rush, Sky Hop, Crypt Knight, Cannon Cove, Turbo Karts and Patti Veedu.

| Command | What it does |
| --- | --- |
| `npm run playables:build -- all` | Builds every game → `dist-playables/<slug>/` and `dist-playables/<slug>-playables.zip` (the file to upload). One game: `-- turbo-karts` |
| `npm run playables:serve` | Serves the builds on `http://localhost:4173/<slug>/` with YouTube's Content-Security-Policy |

Test a build in YouTube's [test suite](https://developers.google.com/youtube/gaming/playables/test_suite) with the **served build's URL**
(`http://localhost:4173/skate-rush/`), not the website's play page: the SDK is only in the Playables build.

In a Playables build (`src/components/games/shared/playables.ts`): progress goes to YouTube's cloud save, never localStorage; pause, resume
and mute come only from the SDK (no page-visibility API), and a paused game runs no frames; `firstFrameReady` is sent with the loading
screen and `gameReady` once it has gone; the best score goes to `sendScore`; there are no full-screen or rotate buttons, no online rooms
(Firebase is left out of the bundle) and no links out. Patti Veedu is its own page: `scripts/build-playables.mjs` copies it and
`scripts/playables/patti-veedu.js` links it to the SDK. A new React game needs an entry and stylesheet in `scripts/playables/` and a line in
`GAMES` in the build script.

What the Playables builds do to meet YouTube's certification requirements (checked against the requirement pages, October 2026):
Esc is never `preventDefault`-ed; the on-screen controls also show for a mouse until a key is pressed (mouse input for every
interaction); no language, clipboard, share or storage APIs; file names are checked at build time; models needed for the first
screen ship as one early-fetched `models.pack`; Patti Veedu plays in a centred 3:2 letterbox on upright screens instead of asking
the player to turn the phone, takes its language from the SDK and puts YouTube's CSP nonce on the scripts it loads.
