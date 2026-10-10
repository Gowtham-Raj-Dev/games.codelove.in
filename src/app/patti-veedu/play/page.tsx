import { PattiVeedu } from "@/components/games/patti-veedu/patti-veedu";
import { GAME } from "@/components/games/patti-veedu/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={PattiVeedu} />;
}
