import { KingdomClash } from "@/components/games/kingdom-clash/kingdom-clash";
import { GAME } from "@/components/games/kingdom-clash/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={KingdomClash} />;
}
