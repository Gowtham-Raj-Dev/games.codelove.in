import { createRoot } from "react-dom/client";
import { NightHeist } from "@/components/games/night-heist/night-heist";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<NightHeist sizes={__MODEL_SIZES__} />);
