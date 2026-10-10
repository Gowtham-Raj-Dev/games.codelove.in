import {
  Alegreya,
  Alegreya_Sans,
  Baloo_2,
  Bungee,
  Caveat_Brush,
  Cinzel,
  Courier_Prime,
  Creepster,
  Crimson_Text,
  Exo_2,
  Fredoka,
  Hind_Madurai,
  Josefin_Sans,
  Karla,
  Lilita_One,
  Limelight,
  Lobster,
  Luckiest_Guy,
  MedievalSharp,
  Monoton,
  Nunito,
  Orbitron,
  Outfit,
  Patrick_Hand,
  Pirata_One,
  Playfair_Display,
  Press_Start_2P,
  Quicksand,
  Racing_Sans_One,
  Rubik,
  Share_Tech_Mono,
  Signika,
  Special_Elite,
  Titillium_Web,
} from "next/font/google";

/**
 * Each game's own typefaces: a display face for titles/buttons (--game-display) and a body face
 * (--game-body). Self-hosted by next/font; not preloaded, so a page only downloads the faces it
 * actually renders.
 */

type Font = { className: string; variable: string };

// next/font needs literal options in every call.
const skateDisplay = Bungee({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const skateBody = Rubik({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const saucerDisplay = Orbitron({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-display" });
const saucerBody = Exo_2({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const coveDisplay = Pirata_One({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const coveBody = Alegreya({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const cryptDisplay = Cinzel({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-display" });
const cryptBody = Crimson_Text({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "600", "700"], variable: "--game-body" });
const orderDisplay = Lobster({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const orderBody = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const hexDisplay = Fredoka({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-display" });
const hexBody = Quicksand({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const hopDisplay = Luckiest_Guy({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const hopBody = Baloo_2({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const kartDisplay = Racing_Sans_One({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const kartBody = Titillium_Web({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "600", "700"], variable: "--game-body" });
const siegeDisplay = MedievalSharp({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const siegeBody = Alegreya_Sans({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "700"], variable: "--game-body" });
const beatDisplay = Monoton({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const beatBody = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const puttDisplay = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, style: ["normal", "italic"], variable: "--game-display" });
const puttBody = Karla({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });

const clashDisplay = Lilita_One({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const clashBody = Signika({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const castawayDisplay = Caveat_Brush({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const castawayBody = Patrick_Hand({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-body" });
const novaDisplay = Press_Start_2P({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const novaBody = Share_Tech_Mono({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-body" });
const heistDisplay = Special_Elite({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const heistBody = Courier_Prime({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--game-body" });
const courierDisplay = Limelight({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const courierBody = Josefin_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--game-body" });
const pattiDisplay = Creepster({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--game-display" });
const pattiBody = Hind_Madurai({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "600"], variable: "--game-body" });

export const GAME_FONTS: Record<string, { display: Font; body: Font }> = {
  "patti-veedu": { display: pattiDisplay, body: pattiBody },
  "skate-rush": { display: skateDisplay, body: skateBody },
  "saucer-siege": { display: saucerDisplay, body: saucerBody },
  "cannon-cove": { display: coveDisplay, body: coveBody },
  "crypt-knight": { display: cryptDisplay, body: cryptBody },
  "order-up": { display: orderDisplay, body: orderBody },
  "hex-haven": { display: hexDisplay, body: hexBody },
  "sky-hop": { display: hopDisplay, body: hopBody },
  "turbo-karts": { display: kartDisplay, body: kartBody },
  "siege-smash": { display: siegeDisplay, body: siegeBody },
  "beat-street": { display: beatDisplay, body: beatBody },
  "putt-paradise": { display: puttDisplay, body: puttBody },
  "kingdom-clash": { display: clashDisplay, body: clashBody },
  castaway: { display: castawayDisplay, body: castawayBody },
  "nova-strike": { display: novaDisplay, body: novaBody },
  "night-heist": { display: heistDisplay, body: heistBody },
  "sky-courier": { display: courierDisplay, body: courierBody },
};

/** Classes that define --game-display and --game-body for a game (put them on an ancestor). */
export function gameFontVars(slug: string): string {
  const f = GAME_FONTS[slug];
  return f ? `${f.display.variable} ${f.body.variable}` : "";
}

/** Class that sets the game's display face directly (titles on cards and detail pages). */
export function gameDisplayClass(slug: string): string {
  return GAME_FONTS[slug]?.display.className ?? "";
}
