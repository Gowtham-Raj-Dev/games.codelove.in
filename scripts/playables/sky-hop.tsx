import { createRoot } from "react-dom/client";
import { SkyHop } from "@/components/games/sky-hop/sky-hop";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<SkyHop sizes={__MODEL_SIZES__} />);
