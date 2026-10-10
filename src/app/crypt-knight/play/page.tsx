import { CryptKnight } from "@/components/games/crypt-knight/crypt-knight";
import { GAME } from "@/components/games/crypt-knight/manifest";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={CryptKnight} />;
}
