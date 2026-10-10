import { HexHaven } from "@/components/games/hex-haven/hex-haven";
import { GAME } from "@/components/games/hex-haven/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={HexHaven} />;
}
