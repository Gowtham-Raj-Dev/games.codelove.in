import { createRoot } from "react-dom/client";
import { CannonCove } from "@/components/games/cannon-cove/cannon-cove";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<CannonCove sizes={__MODEL_SIZES__} />);
