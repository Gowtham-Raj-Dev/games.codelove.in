import { SiegeSmash } from "@/components/games/siege-smash/siege-smash";
import { GAME } from "@/components/games/siege-smash/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={SiegeSmash} />;
}
