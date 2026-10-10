import { CannonCove } from "@/components/games/cannon-cove/cannon-cove";
import { GAME } from "@/components/games/cannon-cove/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={CannonCove} />;
}
