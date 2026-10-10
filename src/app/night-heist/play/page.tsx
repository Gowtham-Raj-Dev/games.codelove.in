import { GAME } from "@/components/games/night-heist/manifest";
import { ComingSoonPlay, playMetadata, playViewport } from "@/components/games/play-page";

// Coming soon: the game in src/components/games/night-heist/ is unfinished, so this route doesn't import it.
// When it's done, drop `comingSoon` from the manifest and render
// <PlayPage game={GAME} Player={NightHeist} /> (from "@/components/games/night-heist/night-heist") instead.

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <ComingSoonPlay game={GAME} />;
}
