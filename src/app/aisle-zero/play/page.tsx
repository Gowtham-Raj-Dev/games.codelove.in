import { GAME } from "@/components/games/aisle-zero/manifest";
import { ComingSoonPlay, playMetadata, playViewport } from "@/components/games/play-page";

// Coming soon: Aisle Zero is held back for now, so this route doesn't import the game.
// To bring it back, drop `comingSoon` from the manifest and render
// <PlayPage game={GAME} Player={AisleZero} /> (from "@/components/games/aisle-zero/aisle-zero") instead.

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <ComingSoonPlay game={GAME} />;
}
