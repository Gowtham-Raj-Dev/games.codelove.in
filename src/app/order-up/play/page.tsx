import { OrderUp } from "@/components/games/order-up/order-up";
import { GAME } from "@/components/games/order-up/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={OrderUp} />;
}
