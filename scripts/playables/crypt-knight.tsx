import { createRoot } from "react-dom/client";
import { CryptKnight } from "@/components/games/crypt-knight/crypt-knight";

/** Bytes per model (written in by scripts/build-playables.mjs) so the loading bar is exact. */
declare const __MODEL_SIZES__: Record<string, number>;

createRoot(document.getElementById("game")!).render(<CryptKnight sizes={__MODEL_SIZES__} />);
