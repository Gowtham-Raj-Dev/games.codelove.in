# games.codelove.in

Free 3D browser games, built from the models of [models.codelove.in](https://models.codelove.in). A static Next.js site hosted on GitHub Pages.

| URL | Page |
| --- | --- |
| `/` | all games |
| `/<game>/` | a game's page: trailer, how to play, controls, the models it uses |
| `/<game>/play/` | the game, full screen |

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
