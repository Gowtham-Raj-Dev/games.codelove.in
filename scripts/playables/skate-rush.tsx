import { createRoot } from "react-dom/client";
import { SkateRush } from "@/components/games/skate-rush/skate-rush";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<SkateRush sizes={__MODEL_SIZES__} />);
