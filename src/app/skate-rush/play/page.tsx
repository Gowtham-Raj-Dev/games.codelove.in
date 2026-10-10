import { SkateRush } from "@/components/games/skate-rush/skate-rush";
import { GAME } from "@/components/games/skate-rush/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={SkateRush} />;
}
