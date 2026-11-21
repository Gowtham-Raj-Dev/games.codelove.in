import type { Barricade, BreakerId, DoorId, SensorId, SlotId } from "./layout";

/**
 * Aisle Zero's campaign as plain data (no three.js): the things that can be on a shopping list, the thirty
 * nights in five chapters, what each night changes (list, open rooms, power, sensors, barricades, how the
 * Wendigo and the hooded woman behave, the optional goal), the staff shop and the saved progress.
 */

// --- Shopping-list items -------------------------------------------------------------------------------

export type ItemKind = "bottle" | "bag" | "salt" | "jar" | "carton" | "loaf" | "flat" | "can";

export interface ItemDef {
  id: string;
  kind: ItemKind;
  /** Text on the package. */
  label: string;
  name: string;
  /** Glow colour. */
  color: number;
  /** Package colour. */
  bg: string;
  slot: SlotId;
}

const item = <I extends string>(id: I, kind: ItemKind, label: string, name: string, color: number, bg: string, slot: SlotId): ItemDef & { id: I } => ({ id, kind, label, name, color, bg, slot });

export const ITEM_DEFS = [
  item("oil", "bottle", "OIL", "Cooking oil", 0x7dff9a, "#7a8a2a", "a1a"),
  item("ghee", "jar", "GHEE", "Ghee", 0xffe27a, "#b8962a", "a1b"),
  item("chilli", "salt", "CHILLI", "Chilli powder", 0xff6a4a, "#a8281a", "a2a"),
  item("turmeric", "jar", "TURMERIC", "Turmeric", 0xffc21a, "#b8860a", "a2b"),
  item("rice", "bag", "RICE", "Rice bag", 0xffe9a0, "#b8a46a", "a3a"),
  item("flour", "bag", "FLOUR", "Wheat flour", 0xf2e6cf, "#9a8a6a", "a3b"),
  item("chips", "bag", "CHIPS", "Potato chips", 0xffd23a, "#c8501a", "a4a"),
  item("crackers", "flat", "CRACKERS", "Crackers", 0xffb46a, "#8a5a2a", "a4b"),
  item("tea", "carton", "TEA", "Tea", 0x9ae6a0, "#2a6a3a", "a5a"),
  item("coffee", "jar", "COFFEE", "Coffee", 0xc89a6a, "#4a2a1a", "a5b"),
  item("juice", "bottle", "JUICE", "Mango juice", 0xffa23a, "#c86a0a", "a5c"),
  item("salt", "salt", "SALT", "Salt", 0xffffff, "#cfd4d8", "a6a"),
  item("sugar", "bag", "SUGAR", "Sugar", 0xe8f0ff, "#8aa0c8", "a6b"),
  item("soap", "flat", "SOAP", "Soap", 0x9ad8ff, "#2a6aa8", "a7a"),
  item("detergent", "bottle", "WASH", "Detergent", 0x6ab4ff, "#1a4a9a", "a7b"),
  item("honey", "jar", "HONEY", "Honey", 0xffc23a, "#c8861c", "a8a"),
  item("jam", "jar", "JAM", "Jam", 0xff5a7a, "#9a1a3a", "a8b"),
  item("chocolate", "flat", "CHOCO", "Chocolate", 0xd89a6a, "#4a2412", "a8c"),
  item("babyfood", "jar", "BABY", "Baby food", 0xbfe8ff, "#6aa0c0", "a9a"),
  item("petfood", "can", "PET", "Pet food", 0xffa0d0, "#a84a7a", "a9b"),
  item("diapers", "bag", "NAPPIES", "Nappies", 0xd0f0ff, "#5a90b0", "a9c"),
  item("peas", "bag", "PEAS", "Frozen peas", 0x8aff8a, "#2a7a3a", "a10a"),
  item("icecream", "jar", "ICE", "Ice cream", 0xffd0f0, "#b05a90", "a10b"),
  item("milk", "carton", "MILK", "Milk packet", 0xcfe8ff, "#dfe6ee", "freezer1"),
  item("curd", "jar", "CURD", "Curd", 0xf0f8ff, "#9ab0c0", "freezer2"),
  item("bread", "loaf", "BREAD", "Bread", 0xffb870, "#a8743a", "bakery"),
  item("onions", "bag", "ONIONS", "Onions", 0xe89ad0, "#8a3a6a", "produce1"),
  item("lemons", "bag", "LEMONS", "Lemons", 0xf0ff5a, "#9aa01a", "produce2"),
  item("biscuit", "flat", "BISCUITS", "Biscuits", 0xff9ad0, "#b04a6a", "stock1"),
  item("candles", "carton", "CANDLES", "Candles", 0xfff0c0, "#a89050", "stock2"),
  item("tin", "can", "TINS", "Tinned food", 0xff7a5a, "#b8402a", "stock3"),
  item("matches", "salt", "MATCHES", "Matches", 0xff8a5a, "#7a2a1a", "stock4"),
  item("fish", "flat", "FISH", "Frozen fish", 0xa0d8ff, "#2a5a8a", "cold1"),
  item("butter", "salt", "BUTTER", "Butter", 0xfff08a, "#b8a02a", "cold2"),
  item("paneer", "carton", "PANEER", "Paneer", 0xffffff, "#8aa0a8", "cold3"),
  item("icecubes", "bag", "ICE", "Bag of ice", 0xc0f0ff, "#4a8ab0", "cold4"),
  item("ledger", "flat", "LEDGER", "Stock ledger", 0xd0b890, "#5a4a30", "office1"),
  item("firstaid", "carton", "AID", "First-aid kit", 0xff8080, "#a02020", "office2"),
  item("bulbs", "carton", "BULBS", "Light bulbs", 0xfff8c0, "#b0a040", "office3"),
  item("tape", "can", "TAPE", "Packing tape", 0xd0d0d0, "#606060", "office4"),
] as const satisfies readonly ItemDef[];

export type ItemId = (typeof ITEM_DEFS)[number]["id"];

// --- The creatures -------------------------------------------------------------------------------------

/**
 * How the Wendigo behaves on a night:
 * stalker — patrols close to you; listener — nearly blind, hears twice as far; lightHunter — sees your torch
 * from across the store but little in the dark; ambusher — stands silent and dark between the shelves;
 * lockerChecker — opens the lockers near where it lost you; sprinter — charges in bursts; relentless — holds a
 * trail twice as long.
 */
export type Trait = "stalker" | "listener" | "lightHunter" | "ambusher" | "lockerChecker" | "sprinter" | "relentless";

export interface CreatureCfg {
  /** Seconds before it wakes. */
  delay: number;
  patrol: number;
  invest: number;
  search: number;
  chase: number;
  /** Chase speed once the alarm has gone off. */
  chase2: number;
  /** Multipliers on how far it sees and hears, and how fast it reacts. */
  sight: number;
  hearing: number;
  notice: number;
  /** Seconds out of sight before it gives up a chase. */
  lose: number;
  /** Seconds without meeting you before it sweeps your part of the store. */
  calm: number;
  /** How fast it sniffs you out of a locker it stands beside. */
  sniff: number;
  traits: Trait[];
}

/** Difficulty step 0–10 → the Wendigo's numbers. */
function creature(level: number, traits: Trait[] = [], over: Partial<CreatureCfg> = {}): CreatureCfg {
  const L = level;
  return {
    delay: 45 - 3 * L,
    patrol: 1.6 + 0.05 * L,
    invest: 2.5 + 0.07 * L,
    search: 2.1 + 0.05 * L,
    chase: 3.6 + 0.1 * L,
    chase2: 3.9 + 0.11 * L,
    sight: 0.8 + 0.035 * L,
    hearing: 0.8 + 0.035 * L,
    notice: 0.7 + 0.06 * L,
    lose: 5 + 0.3 * L,
    calm: 90 - 5 * L,
    sniff: 0.8 + 0.05 * L,
    traits,
    ...over,
  };
}

/** The hooded woman: she walks towards you while you are not looking at her. */
export interface GhostCfg {
  /** Seconds before she first appears, then between appearances (min, max). */
  first: number;
  every: [number, number];
  speed: number;
  /** What her touch does: scream (it comes running, your torch dies for a while), steal (also puts one item back), catch (the night ends). */
  touch: "scream" | "steal" | "catch";
}

const ghost = (touch: GhostCfg["touch"], speed: number, every: [number, number] = [35, 55], first = 40): GhostCfg => ({ first, every, speed, touch });

// --- Goals ---------------------------------------------------------------------------------------------

export type Goal =
  | { kind: "coins"; n: number }
  | { kind: "lure" }
  | { kind: "noHide" }
  | { kind: "noCans" }
  | { kind: "noSprint" }
  | { kind: "noAlarm" }
  | { kind: "battery"; pct: number }
  | { kind: "torch"; s: number }
  | { kind: "bonus"; name: string; slot: SlotId }
  | { kind: "banish"; n: number }
  | { kind: "noTouch" };

export function goalText(g: Goal): string {
  switch (g.kind) {
    case "coins":
      return `Pick up ${g.n} loose coins`;
    case "lure":
      return "Lure it away with a thrown can";
    case "noHide":
      return "Never hide in a locker";
    case "noCans":
      return "Throw no cans";
    case "noSprint":
      return "Never run";
    case "noAlarm":
      return "Trip no sensor";
    case "battery":
      return `Leave with ${g.pct}% battery or more`;
    case "torch":
      return `Keep your torch on for under ${g.s} seconds`;
    case "bonus":
      return `Bring out the ${g.name.toLowerCase()}`;
    case "banish":
      return g.n === 1 ? "Drive the hooded woman off with your torch" : `Drive the hooded woman off ${g.n} times`;
    case "noTouch":
      return "Never let the hooded woman touch you";
  }
}

// --- Nights --------------------------------------------------------------------------------------------

/** open: up from the start · pay: goes up with the alarm · key: needs its key · power: goes up with the power · shut: closed all night. */
export type DoorRule = "open" | "pay" | "key" | "power" | "shut";

export interface NightDef {
  name: string;
  /** What the night is, for the roster and the first seconds of the shift. */
  brief: string;
  items: ItemId[];
  doors: Record<DoorId, DoorRule>;
  /** Where the key of each "key" door lies. */
  keys?: Partial<Record<DoorId, SlotId>>;
  /** The power is out until the breaker is thrown (null: it cannot be fixed, the register runs on its backup). */
  power?: { breaker: BreakerId | null; fuses?: SlotId[] };
  /** The power dies for good once this many items are in the cart. */
  powerDiesAt?: number;
  sensors?: SensorId[];
  barricades?: Barricade[];
  batteries: number;
  coins: number;
  /** How fast the torch drains (1 = normal). */
  drain: number;
  /** Share of the ceiling lights that are dead (0–1). */
  dim: number;
  /** How often the lights cut out by themselves (0 = never, 1 = now and then). */
  flicker: number;
  creature: CreatureCfg;
  ghost: GhostCfg | null;
  goal: Goal;
  /** Seconds for the time star. */
  par: number;
}

const FRONT: Record<DoorId, DoorRule> = { stockW: "pay", stockE: "pay", cold: "shut", office: "shut" };
const BACK: Record<DoorId, DoorRule> = { stockW: "open", stockE: "open", cold: "shut", office: "shut" };
const ALL: Record<DoorId, DoorRule> = { stockW: "open", stockE: "open", cold: "open", office: "open" };

export const CHAPTERS = [
  { name: "First Week", blurb: "Learn the store. Learn what walks it." },
  { name: "Power Trouble", blurb: "Blackouts, fuses and locked cold rooms." },
  { name: "The Mourner", blurb: "A hooded woman who moves when you look away." },
  { name: "Bad Nights", blurb: "It listens. It waits. It checks the lockers." },
  { name: "Closing Time", blurb: "Everything at once, until the last receipt." },
] as const;

export const NIGHTS_PER_CHAPTER = 6;

export const NIGHTS: readonly NightDef[] = [
  // ── Chapter 1 · First Week ───────────────────────────────────────────────────────────────────────
  {
    name: "First Shift",
    brief: "Your first night. Four things on the list, then pay at register 4 and leave by the emergency exit at the back. It cannot see through shelves.",
    items: ["oil", "rice", "tea", "honey"],
    doors: FRONT,
    batteries: 1,
    coins: 6,
    drain: 0.6,
    dim: 0.2,
    flicker: 0,
    creature: creature(0, [], { delay: 60 }),
    ghost: null,
    goal: { kind: "coins", n: 4 },
    par: 200,
  },
  {
    name: "Aisle Runner",
    brief: "Five items right across the floor. When it is between you and the next shelf, throw a can to send it the wrong way.",
    items: ["chilli", "flour", "chips", "sugar", "soap"],
    doors: FRONT,
    batteries: 1,
    coins: 6,
    drain: 0.8,
    dim: 0.25,
    flicker: 0.5,
    creature: creature(1),
    ghost: null,
    goal: { kind: "lure" },
    par: 215,
  },
  {
    name: "Back Room",
    brief: "The stock room shutters are up tonight, and two things on the list are back there. That is where it sleeps.",
    items: ["ghee", "coffee", "jam", "petfood", "biscuit", "tin"],
    doors: BACK,
    batteries: 2,
    coins: 7,
    drain: 1,
    dim: 0.3,
    flicker: 0.6,
    creature: creature(2),
    ghost: null,
    goal: { kind: "noHide" },
    par: 240,
  },
  {
    name: "Low Battery",
    brief: "Half the lights are dead and your torch is on its last cells. Spare batteries glow green on the floor: walk over them.",
    items: ["turmeric", "juice", "salt", "detergent", "bread", "candles"],
    doors: BACK,
    batteries: 3,
    coins: 7,
    drain: 1.7,
    dim: 0.6,
    flicker: 1,
    creature: creature(2),
    ghost: null,
    goal: { kind: "battery", pct: 30 },
    par: 250,
  },
  {
    name: "Tripwires",
    brief: "Someone armed the theft sensors. Walk through a red ring and the whole store hears it. Crouch to slip through.",
    items: ["oil", "crackers", "tea", "babyfood", "milk", "matches"],
    doors: BACK,
    sensors: ["crossBackM", "crossFrontW", "crossFrontE", "backW", "lobbyM"],
    batteries: 2,
    coins: 7,
    drain: 1,
    dim: 0.3,
    flicker: 0.6,
    creature: creature(3),
    ghost: null,
    goal: { kind: "noAlarm" },
    par: 260,
  },
  {
    name: "Inventory Night",
    brief: "Stock-take: eight items, from the front shutters to the back wall. Your pay envelope was left on a stock room rack.",
    items: ["rice", "chips", "honey", "diapers", "peas", "curd", "onions", "tin"],
    doors: BACK,
    sensors: ["crossBackW", "crossFrontM"],
    batteries: 2,
    coins: 8,
    drain: 1,
    dim: 0.35,
    flicker: 0.8,
    creature: creature(4, ["stalker"]),
    ghost: null,
    goal: { kind: "bonus", name: "Pay envelope", slot: "xStock" },
    par: 320,
  },
  // ── Chapter 2 · Power Trouble ────────────────────────────────────────────────────────────────────
  {
    name: "Blackout",
    brief: "The power is out and the registers are dead. Throw the breaker on the stock room's back wall before you try to pay.",
    items: ["flour", "coffee", "sugar", "soap", "chocolate", "lemons"],
    doors: BACK,
    power: { breaker: "stock" },
    batteries: 3,
    coins: 7,
    drain: 1,
    dim: 0.3,
    flicker: 0.5,
    creature: creature(3),
    ghost: null,
    goal: { kind: "torch", s: 120 },
    par: 290,
  },
  {
    name: "Cold Chain",
    brief: "Two items are in cold storage, behind the stock room, and its door is locked. The keycard was left on a shelf in aisle 6.",
    items: ["ghee", "juice", "petfood", "icecream", "fish", "butter"],
    doors: { stockW: "open", stockE: "open", cold: "key", office: "shut" },
    keys: { cold: "x6" },
    batteries: 2,
    coins: 8,
    drain: 1,
    dim: 0.35,
    flicker: 0.8,
    creature: creature(4),
    ghost: null,
    goal: { kind: "noSprint" },
    par: 300,
  },
  {
    name: "Fuse Hunt",
    brief: "The breaker box by the lobby's west wall is missing two fuses. Find them on the shelves, fit them, then pay.",
    items: ["chilli", "crackers", "detergent", "jam", "milk"],
    doors: BACK,
    power: { breaker: "lobby", fuses: ["x3", "x9"] },
    batteries: 3,
    coins: 8,
    drain: 1,
    dim: 0.3,
    flicker: 0.5,
    creature: creature(4),
    ghost: null,
    goal: { kind: "noCans" },
    par: 300,
  },
  {
    name: "Deep Freeze",
    brief: "No power, and the back shutters are electric: throw the lobby breaker to raise them. Tonight it is nearly blind, but it hears twice as far.",
    items: ["turmeric", "tea", "salt", "babyfood", "candles", "paneer", "icecubes"],
    doors: { stockW: "power", stockE: "power", cold: "power", office: "shut" },
    power: { breaker: "lobby" },
    batteries: 3,
    coins: 8,
    drain: 1,
    dim: 0.35,
    flicker: 0.6,
    creature: creature(5, ["listener"]),
    ghost: null,
    goal: { kind: "noHide" },
    par: 350,
  },
  {
    name: "Restock",
    brief: "Delivery night: pallets block half the aisles and the sensors are armed. Open the map and plan your way round.",
    items: ["oil", "rice", "chips", "coffee", "sugar", "honey", "diapers"],
    doors: BACK,
    sensors: ["crossBackM", "crossFrontM", "backE"],
    barricades: [
      [3, "back"],
      [5, "mid"],
      [6, "front"],
      [8, "back"],
      [9, "mid"],
    ],
    batteries: 2,
    coins: 10,
    drain: 1,
    dim: 0.35,
    flicker: 0.8,
    creature: creature(5),
    ghost: null,
    goal: { kind: "coins", n: 8 },
    par: 300,
  },
  {
    name: "Night Audit",
    brief: "Audit night. The ledger is in the staff office, the office key is in cold storage, and the cold-room keycard is in aisle 2.",
    items: ["flour", "soap", "chocolate", "curd", "tin", "fish", "ledger", "firstaid"],
    doors: { stockW: "open", stockE: "open", cold: "key", office: "key" },
    keys: { cold: "x2", office: "xCold" },
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.4,
    flicker: 2.2,
    creature: creature(6, ["stalker"]),
    ghost: null,
    goal: { kind: "bonus", name: "Cash box", slot: "xOffice" },
    par: 400,
  },
  // ── Chapter 3 · The Mourner ──────────────────────────────────────────────────────────────────────
  {
    name: "Someone Else",
    brief: "You are not the only shopper. A hooded woman walks towards you whenever you look away. Hold your torch on her and she leaves; if she reaches you she screams, and it comes.",
    items: ["chilli", "juice", "salt", "detergent", "bread", "biscuit"],
    doors: BACK,
    batteries: 3,
    coins: 8,
    drain: 1,
    dim: 0.4,
    flicker: 0.8,
    creature: creature(5),
    ghost: ghost("scream", 1.7),
    goal: { kind: "banish", n: 2 },
    par: 290,
  },
  {
    name: "Lights Out Policy",
    brief: "Tonight it hunts the light: it sees your torch from across the store, and almost nothing in the dark. She still only leaves for the torch.",
    items: ["ghee", "crackers", "coffee", "jam", "petfood", "peas"],
    doors: BACK,
    batteries: 3,
    coins: 8,
    drain: 1,
    dim: 0.3,
    flicker: 0.6,
    creature: creature(5, ["lightHunter"]),
    ghost: ghost("scream", 1.8, [40, 60]),
    goal: { kind: "noHide" },
    par: 280,
  },
  {
    name: "Sticky Fingers",
    brief: "She has started putting things back. If she touches you, one item leaves your cart for its shelf. Cold storage is open.",
    items: ["oil", "rice", "tea", "honey", "milk", "matches", "butter"],
    doors: { stockW: "open", stockE: "open", cold: "open", office: "shut" },
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.4,
    flicker: 0.8,
    creature: creature(6),
    ghost: ghost("steal", 2.0, [30, 50]),
    goal: { kind: "noTouch" },
    par: 330,
  },
  {
    name: "Double Shift",
    brief: "A double shift: ten items, every room unlocked. It never strays far from you tonight.",
    items: ["turmeric", "chips", "sugar", "soap", "babyfood", "lemons", "candles", "icecubes", "bulbs", "curd"],
    doors: ALL,
    batteries: 4,
    coins: 12,
    drain: 1,
    dim: 0.4,
    flicker: 0.8,
    creature: creature(6, ["stalker"]),
    ghost: ghost("scream", 2.0),
    goal: { kind: "coins", n: 10 },
    par: 460,
  },
  {
    name: "Cold Shoulder",
    brief: "Blackout again, and the only working breaker is on the back wall of cold storage. She is quicker in the dark.",
    items: ["flour", "juice", "chocolate", "onions", "tin", "fish", "paneer"],
    doors: { stockW: "open", stockE: "open", cold: "open", office: "shut" },
    power: { breaker: "cold" },
    batteries: 4,
    coins: 9,
    drain: 1,
    dim: 0.4,
    flicker: 0.5,
    creature: creature(7),
    ghost: ghost("scream", 2.2, [30, 50]),
    goal: { kind: "battery", pct: 25 },
    par: 360,
  },
  {
    name: "Vigil",
    brief: "From tonight her touch ends the shift. Two things on the list are in the staff office; its key is in aisle 7. Keep the torch charged.",
    items: ["salt", "jam", "diapers", "icecream", "bread", "biscuit", "tape", "firstaid"],
    doors: { stockW: "open", stockE: "open", cold: "shut", office: "key" },
    keys: { office: "x7" },
    sensors: ["stockMid", "crossBackE", "lobbyW"],
    batteries: 4,
    coins: 9,
    drain: 1,
    dim: 0.45,
    flicker: 1,
    creature: creature(7),
    ghost: ghost("catch", 2.0, [40, 60]),
    goal: { kind: "bonus", name: "Night-shift bonus", slot: "x10" },
    par: 400,
  },
  // ── Chapter 4 · Bad Nights ───────────────────────────────────────────────────────────────────────
  {
    name: "It Listens",
    brief: "It has gone blind and its ears have grown. Every step, every squeaking wheel, every sensor. Crouch, and keep the cart slow.",
    items: ["oil", "crackers", "coffee", "detergent", "petfood", "peas", "candles"],
    doors: BACK,
    sensors: ["crossBackW", "crossBackE", "crossFrontM", "lobbyM", "backM", "stockMid"],
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.45,
    flicker: 0.8,
    creature: creature(7, ["listener"]),
    ghost: null,
    goal: { kind: "noAlarm" },
    par: 340,
  },
  {
    name: "Ambush",
    brief: "It has stopped patrolling. It stands silent and dark between the shelves and waits for you to walk into it. Look down every aisle first.",
    items: ["chilli", "rice", "tea", "honey", "curd", "matches", "icecubes"],
    doors: { stockW: "open", stockE: "open", cold: "open", office: "shut" },
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.45,
    flicker: 0.8,
    creature: creature(7, ["ambusher"]),
    ghost: ghost("scream", 2.0, [45, 70]),
    goal: { kind: "noCans" },
    par: 360,
  },
  {
    name: "Locker Check",
    brief: "It has learned where you hide. When it loses you it goes to the nearest lockers and opens them, one by one.",
    items: ["ghee", "flour", "sugar", "jam", "babyfood", "milk", "tin", "ledger"],
    doors: { stockW: "open", stockE: "open", cold: "shut", office: "open" },
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.45,
    flicker: 0.8,
    creature: creature(8, ["lockerChecker"], { sniff: 2.2 }),
    ghost: null,
    goal: { kind: "noHide" },
    par: 380,
  },
  {
    name: "Sprint Finish",
    brief: "It charges in bursts now, faster than you can run, then tires. Pallets block the straight lines: break its line of sight instead of outrunning it.",
    items: ["turmeric", "chips", "juice", "soap", "chocolate", "diapers", "lemons", "biscuit"],
    doors: BACK,
    barricades: [
      [2, "mid"],
      [4, "front"],
      [5, "mid"],
      [7, "back"],
      [9, "back"],
    ],
    batteries: 3,
    coins: 9,
    drain: 1,
    dim: 0.45,
    flicker: 0.8,
    creature: creature(8, ["sprinter"]),
    ghost: null,
    goal: { kind: "noSprint" },
    par: 370,
  },
  {
    name: "Short Circuit",
    brief: "Three fuses, one breaker, and it is inside the locked staff office (the key is in aisle 9). She wants your shopping back on the shelves.",
    items: ["salt", "coffee", "petfood", "icecream", "onions", "candles", "bulbs"],
    doors: { stockW: "open", stockE: "open", cold: "shut", office: "key" },
    keys: { office: "x9" },
    power: { breaker: "office", fuses: ["x4", "xProduce", "xStock"] },
    batteries: 4,
    coins: 9,
    drain: 1,
    dim: 0.4,
    flicker: 0.5,
    creature: creature(8),
    ghost: ghost("steal", 2.1, [35, 55]),
    goal: { kind: "torch", s: 150 },
    par: 440,
  },
  {
    name: "Black Friday",
    brief: "Twelve items and every room open. It stalks, it sprints, and she is still here.",
    items: ["oil", "chilli", "flour", "crackers", "tea", "sugar", "detergent", "honey", "babyfood", "peas", "bread", "tin"],
    doors: ALL,
    sensors: ["crossBackM", "crossFrontM", "lobbyW", "lobbyE"],
    batteries: 4,
    coins: 12,
    drain: 1,
    dim: 0.45,
    flicker: 1,
    creature: creature(9, ["stalker", "sprinter"]),
    ghost: ghost("scream", 2.2, [40, 60]),
    goal: { kind: "bonus", name: "Golden price gun", slot: "xOffice" },
    par: 500,
  },
  // ── Chapter 5 · Closing Time ─────────────────────────────────────────────────────────────────────
  {
    name: "Skeleton Crew",
    brief: "It hunts the light, the sensors are armed and three aisles are blocked. Go dark and go low.",
    items: ["ghee", "flour", "chips", "soap", "jam", "curd", "matches", "butter"],
    doors: { stockW: "open", stockE: "open", cold: "open", office: "shut" },
    sensors: ["crossBackW", "crossBackM", "crossBackE", "crossFrontW", "crossFrontE", "backW", "backE", "stockMid"],
    barricades: [
      [3, "mid"],
      [6, "back"],
      [8, "front"],
    ],
    batteries: 3,
    coins: 10,
    drain: 1,
    dim: 0.5,
    flicker: 0.8,
    creature: creature(8, ["lightHunter"]),
    ghost: null,
    goal: { kind: "noAlarm" },
    par: 420,
  },
  {
    name: "Cold Storage",
    brief: "Tonight's list lives in the back: the stock room and cold storage (keycard in aisle 2). It waits there, standing still. She walks the front.",
    items: ["juice", "salt", "chocolate", "biscuit", "candles", "fish", "butter", "paneer", "icecubes"],
    doors: { stockW: "open", stockE: "open", cold: "key", office: "shut" },
    keys: { cold: "x2" },
    batteries: 4,
    coins: 10,
    drain: 1,
    dim: 0.5,
    flicker: 0.8,
    creature: creature(9, ["ambusher"]),
    ghost: ghost("catch", 2.1, [40, 60]),
    goal: { kind: "banish", n: 3 },
    par: 420,
  },
  {
    name: "Dead Stock",
    brief: "The mains are dead for good; the register runs on its backup. Eight items by torchlight, and it listens.",
    items: ["oil", "turmeric", "tea", "detergent", "diapers", "milk", "lemons", "tape"],
    doors: { stockW: "open", stockE: "open", cold: "shut", office: "open" },
    power: { breaker: null },
    batteries: 5,
    coins: 10,
    drain: 0.9,
    dim: 0.5,
    flicker: 0,
    creature: creature(9, ["listener"]),
    ghost: ghost("scream", 2.2, [45, 65]),
    goal: { kind: "battery", pct: 20 },
    par: 420,
  },
  {
    name: "Hunted",
    brief: "No warm-up tonight. It is awake, it is close, and it does not give up a trail. Six items: be quick.",
    items: ["chilli", "crackers", "sugar", "honey", "petfood", "bread"],
    doors: BACK,
    batteries: 3,
    coins: 8,
    drain: 1,
    dim: 0.5,
    flicker: 1,
    creature: creature(10, ["relentless", "stalker"], { delay: 4 }),
    ghost: null,
    goal: { kind: "noCans" },
    par: 280,
  },
  {
    name: "Last Inventory",
    brief: "Everything at once: twelve items, two locked rooms (keycard in aisle 6, office key in cold storage), two fuses and a dead register. The breaker is in the office.",
    items: ["ghee", "rice", "chips", "coffee", "soap", "jam", "babyfood", "peas", "tin", "fish", "ledger", "firstaid"],
    doors: { stockW: "open", stockE: "open", cold: "key", office: "key" },
    keys: { cold: "x6", office: "xCold" },
    power: { breaker: "office", fuses: ["x3", "xProduce"] },
    batteries: 5,
    coins: 14,
    drain: 1,
    dim: 0.45,
    flicker: 0.5,
    creature: creature(9, ["stalker"]),
    ghost: ghost("steal", 2.2, [40, 60]),
    goal: { kind: "coins", n: 12 },
    par: 600,
  },
  {
    name: "Aisle Zero",
    brief: "The last night. Ten items, every room open. When the fifth goes in the cart the power dies for good. Do not stop.",
    items: ["oil", "flour", "juice", "salt", "chocolate", "curd", "onions", "matches", "icecubes", "bulbs"],
    doors: ALL,
    powerDiesAt: 5,
    sensors: ["exit", "stockMid", "backM"],
    batteries: 5,
    coins: 12,
    drain: 1,
    dim: 0.5,
    flicker: 1.2,
    creature: creature(10, ["stalker", "sprinter", "lockerChecker"]),
    ghost: ghost("catch", 2.3, [40, 60]),
    goal: { kind: "bonus", name: "First receipt", slot: "xCold" },
    par: 520,
  },
];

export const NIGHT_COUNT = NIGHTS.length;
export const chapterOf = (night: number) => Math.floor(night / NIGHTS_PER_CHAPTER);

/** Wages for a night: a base that grows through the campaign, 20 per star won this run, 5 per coin. */
export const COIN_VALUE = 5;
export const STAR_BONUS = 20;
export const basePay = (night: number) => 30 + night * 8;
export const wages = (night: number, won: boolean, stars: number, coins: number) => (won ? basePay(night) + stars * STAR_BONUS + coins * COIN_VALUE : Math.floor((coins * COIN_VALUE) / 2));

/** Stars are three separate challenges, kept as bits: in time, never spotted, the night's goal. */
export const STAR = { time: 1, unseen: 2, goal: 4 } as const;
export const starCount = (bits: number) => (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);

// --- Staff shop ----------------------------------------------------------------------------------------

export type GearId = "battery" | "lens" | "soles" | "pouch" | "lungs" | "wheels";

export interface GearDef {
  id: GearId;
  name: string;
  /** What each level does, starting with the one you have for free. */
  levels: string[];
  /** Price of level 1, 2, 3… */
  prices: number[];
  blurb: string;
}

export const GEAR: readonly GearDef[] = [
  { id: "battery", name: "Battery pack", blurb: "How long the torch burns on a full charge.", levels: ["2:30 of light", "3:10 of light", "4:00 of light", "5:00 of light"], prices: [200, 450, 900] },
  { id: "lens", name: "Torch lens", blurb: "A wider, longer beam. It does not make you easier to see.", levels: ["Narrow beam", "Wide beam", "Flood beam"], prices: [250, 650] },
  { id: "soles", name: "Soft soles", blurb: "Quieter steps when you walk and run.", levels: ["Work boots", "Rubber soles", "Felt soles", "Sock feet"], prices: [180, 420, 850] },
  { id: "pouch", name: "Can pouch", blurb: "Cans to throw at the start of a night.", levels: ["3 cans", "4 cans", "5 cans", "6 cans"], prices: [120, 300, 650] },
  { id: "lungs", name: "Night legs", blurb: "Run for longer before you are winded.", levels: ["6 s of running", "7.5 s of running", "9 s of running", "10 s of running"], prices: [160, 380, 800] },
  { id: "wheels", name: "Oiled wheels", blurb: "A quieter cart when you sneak.", levels: ["Squeaky", "Oiled", "Silent"], prices: [150, 400] },
];

/** What the gear levels mean in the game. */
export const GEAR_VALUES = {
  battery: [150, 190, 240, 300],
  lens: [
    { range: 40, angle: 0.5, power: 4.4 },
    { range: 46, angle: 0.56, power: 5 },
    { range: 52, angle: 0.63, power: 5.6 },
  ],
  /** Hearing radius of a walk and of a run. */
  soles: [
    { walk: 7, run: 15 },
    { walk: 6.2, run: 13.5 },
    { walk: 5.5, run: 12 },
    { walk: 4.8, run: 10.5 },
  ],
  pouch: [3, 4, 5, 6],
  lungs: [100, 120, 144, 160],
  /** Hearing radius while sneaking, and how often the wheels squeak. */
  wheels: [
    { sneak: 3, squeak: 1 },
    { sneak: 2.5, squeak: 0.45 },
    { sneak: 2.1, squeak: 0.1 },
  ],
} as const;

export interface CartDef {
  id: string;
  name: string;
  price: number;
  /** Frame, basket and handle-grip colours. */
  frame: number;
  basket: number;
  grip: number;
  /** A faint glow on the frame (0 = none). */
  glow: number;
  swatch: string;
}

export const CARTS: readonly CartDef[] = [
  { id: "steel", name: "Store steel", price: 0, frame: 0xb4b8ba, basket: 0xc4c8ca, grip: 0x8a1a12, glow: 0, swatch: "linear-gradient(135deg,#d6dadc,#7c8285)" },
  { id: "rust", name: "Rust bucket", price: 150, frame: 0x8a4a2a, basket: 0x9a6a4a, grip: 0x2a2018, glow: 0, swatch: "linear-gradient(135deg,#b06a3a,#4a2412)" },
  { id: "midnight", name: "Midnight", price: 250, frame: 0x2a3a6a, basket: 0x4a5a8a, grip: 0xc8c8d8, glow: 0, swatch: "linear-gradient(135deg,#4a5a9a,#141a33)" },
  { id: "moss", name: "Cold moss", price: 350, frame: 0x3a6a4a, basket: 0x5a8a66, grip: 0x1a2a1e, glow: 0, swatch: "linear-gradient(135deg,#6a9a72,#1c3324)" },
  { id: "hazard", name: "Hazard", price: 500, frame: 0xd8b010, basket: 0x2a2a2a, grip: 0x111111, glow: 0, swatch: "repeating-linear-gradient(135deg,#e2bc14 0 8px,#1a1a1a 8px 16px)" },
  { id: "bone", name: "Bone white", price: 700, frame: 0xe6dfc9, basket: 0xf2ecd8, grip: 0x5a2a22, glow: 0, swatch: "linear-gradient(135deg,#f5efdc,#a59f8a)" },
  { id: "ember", name: "Ember", price: 1000, frame: 0x7a1a12, basket: 0xb3261a, grip: 0x1a0a08, glow: 0.35, swatch: "radial-gradient(circle at 40% 40%,#ff6a4a,#7a120c 55%,#1a0605)" },
  { id: "gold", name: "Employee of the month", price: 1500, frame: 0xd8a83a, basket: 0xf0c85a, grip: 0x2a1a08, glow: 0.2, swatch: "linear-gradient(135deg,#fde68a,#d8a83a 55%,#7a5210)" },
];

export const findCart = (id: string) => CARTS.find((c) => c.id === id) ?? CARTS[0];

// --- Saved progress ------------------------------------------------------------------------------------

export interface Save {
  /** Per night: escaped at least once (0 / 1), the stars won (bits, see STAR) and the fastest escape in seconds. */
  done: number[];
  stars: number[];
  times: number[];
  /** Wages saved. */
  bank: number;
  gear: Record<GearId, number>;
  /** Carts bought. */
  carts: string[];
  cart: string;
  /** Look speed: 0 slow, 1 normal, 2 fast. */
  look: number;
  listOpen: boolean;
  runs: number;
}

export const SAVE_DEFAULTS: Save = {
  done: [],
  stars: [],
  times: [],
  bank: 0,
  gear: { battery: 0, lens: 0, soles: 0, pouch: 0, lungs: 0, wheels: 0 },
  carts: [],
  cart: "steel",
  look: 1,
  listOpen: true,
  runs: 0,
};

const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const perNight = (v: unknown, hi: number) => Array.from({ length: NIGHT_COUNT }, (_, i) => (Array.isArray(v) ? int(v[i], 0, hi) : 0));

/** Whatever was in storage (an old version, a half-written or edited save) → a save the game can trust. */
export function readSave(raw: unknown): Save {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const g = (r.gear && typeof r.gear === "object" && !Array.isArray(r.gear) ? r.gear : {}) as Record<string, unknown>;
  const gear = { ...SAVE_DEFAULTS.gear };
  for (const def of GEAR) gear[def.id] = int(g[def.id], 0, def.prices.length);
  const carts = Array.isArray(r.carts) ? CARTS.filter((c) => c.price > 0 && (r.carts as unknown[]).includes(c.id)).map((c) => c.id) : [];
  const cart = typeof r.cart === "string" && (carts.includes(r.cart) || findCart(r.cart).price === 0) ? findCart(r.cart).id : CARTS[0].id;
  const done = perNight(r.done, 1);
  return {
    done,
    stars: perNight(r.stars, 7).map((s, i) => (done[i] ? s : 0)),
    times: perNight(r.times, 359999).map((t, i) => (done[i] ? t : 0)),
    bank: int(r.bank, 0, 9_999_999),
    gear,
    carts,
    cart,
    look: int(r.look ?? 1, 0, 2),
    listOpen: r.listOpen !== false,
    runs: int(r.runs, 0, 9_999_999),
  };
}

/** A night opens once the one before it has been escaped. */
export const nightOpen = (save: Save, night: number) => night === 0 || !!save.done[night - 1];
/** The first night not escaped yet (the last one when all are). */
export const nextNight = (save: Save) => {
  const i = save.done.findIndex((d) => !d);
  return i < 0 ? NIGHT_COUNT - 1 : i;
};
export const totalStars = (save: Save) => save.stars.reduce((n, s) => n + starCount(s), 0);
export const nightsDone = (save: Save) => save.done.reduce((n, d) => n + (d ? 1 : 0), 0);

export const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
