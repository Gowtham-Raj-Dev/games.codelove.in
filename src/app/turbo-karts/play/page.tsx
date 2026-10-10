import { TurboKarts } from "@/components/games/turbo-karts/turbo-karts";
import { GAME } from "@/components/games/turbo-karts/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={TurboKarts} />;
}
