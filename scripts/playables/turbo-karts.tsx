import { createRoot } from "react-dom/client";
import { TurboKarts } from "@/components/games/turbo-karts/turbo-karts";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<TurboKarts sizes={__MODEL_SIZES__} />);
