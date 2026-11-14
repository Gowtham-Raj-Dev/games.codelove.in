import { GAME } from "@/components/games/night-heist/manifest";
import { NightHeist } from "@/components/games/night-heist/night-heist";
import { PlayPage, playMetadata, playViewport } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);
export const viewport = playViewport;

export default function Page() {
  return <PlayPage game={GAME} Player={NightHeist} />;
}
