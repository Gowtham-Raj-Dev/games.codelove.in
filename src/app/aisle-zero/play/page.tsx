import { AisleZero } from "@/components/games/aisle-zero/aisle-zero";
import { GAME } from "@/components/games/aisle-zero/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={AisleZero} />;
}
