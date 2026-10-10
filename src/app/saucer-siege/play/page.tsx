import { SaucerSiege } from "@/components/games/saucer-siege/saucer-siege";
import { GAME } from "@/components/games/saucer-siege/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={SaucerSiege} />;
}
