import { SkyHop } from "@/components/games/sky-hop/sky-hop";
import { GAME } from "@/components/games/sky-hop/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={SkyHop} />;
}
