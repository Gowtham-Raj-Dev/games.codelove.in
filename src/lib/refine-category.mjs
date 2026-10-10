// Shared by the site (src/lib/catalog.ts) and scripts/build-og.mjs, so both agree on categories.
// Source packs are categorized per pack; this fixes individual models within them.

const WEAPON =
  /\b(swords?|axes?|daggers?|blades?|bows?|crossbows?|arrows?|quivers?|spears?|lances?|maces?|halberds?|scythes?|shields?|staffs?|wands?|blasters?|guns?|pistols?|rifles?|shotguns?|cannons?|cannonballs?|ballistas?|catapults?|trebuchets?|turrets?|grenades?|bombs?|smokebomb|launchers?|weapons?|ammo|bullets?|katanas?|flails?)\b/i;

/** Names that look like weapons but aren't (decor, tools, signage, sports, kitchenware…). */
const NOT_WEAPON = /\b(indicator|banner|club|tool|art|sign|road|knife|knives)\b/i;

/** Collections whose weapon-looking names are something else (signage arrows, windmill blades, train names…). */
const NOT_WEAPON_IN = /^(factory-kit|fantasy-town-kit|platformer-kit|racing-kit|train-kit|watercraft-kit|food-kit|restaurant-bits)$/;

/** Categories whose items may be reclassified as weapons. */
const WEAPON_SOURCES = new Set(["Characters", "Props", "Nature", "Space", "Buildings"]);

/** Whole collections that are weapons. */
const WEAPON_COLLECTIONS = new Set(["blaster-kit"]);

/** Collections whose avatar items are characters even when not rigged. */
const AVATAR_COLLECTIONS = new Set(["retro-booth", "tomb-chaser-1"]);

/** Whole trees: "Tree Oak", "Pine Crooked", "Palm Bend", "Tree01", "Base Palm Tree01" (not "Pineapple", "Street"). */
const TREE = /\b(trees?|pines?|palms?)\d*\b/i;

/** Tree parts and kit pieces that only feature a tree (felled logs, trunks, stumps, ground tiles). */
const NOT_TREE = /\b(logs?|trunks?|stumps?|tiles?)\b/i;

/** Categories whose items may be reclassified as trees (trees ship in nature, city, racing and game kits). */
const TREE_SOURCES = new Set(["Nature", "Props", "Buildings", "Vehicles", "Furniture"]);

function isCharacterBody(m) {
  if (m.rigged) return true;
  if (/^character\b/i.test(m.title)) return true;
  return AVATAR_COLLECTIONS.has(m.collectionKey);
}

/**
 * @param {{ title: string, category: string, collectionKey: string, rigged: boolean }} m
 * @returns {string} the refined category
 */
export function refineCategory(m) {
  // 1. God of War & Ancient Warrior Legends
  if (m.collectionKey === "god-of-war" || /\b(kratos|spartan champion|spartan bow|god anubis|god bastet|god ra|leviathan axe|blades of chaos)\b/i.test(m.title)) {
    return "God of War";
  }

  // 2. Skeletons & Undead
  if (m.collectionKey === "character-pack-skeletons" || /\bskeleton\b/i.test(m.title)) {
    return "Skeletons";
  }

  // 3. Bikes, Motorcycles & Karts
  if (
    m.collectionKey === "bikes" ||
    /\b(racing bike|motorbike|motorcycle|chopper|bicycle|kart\b|skateboard)\b/i.test(m.title)
  ) {
    return "Bikes";
  }

  // 4. Gaming & Arcade
  if (
    m.collectionKey === "gaming" ||
    m.collectionKey === "mini-arcade" ||
    /\b(arcade machine|arcade cabinet|combat soldier|dungeon war arena|battle stage|collision stage)\b/i.test(m.title)
  ) {
    return "Gaming";
  }

  if (WEAPON_COLLECTIONS.has(m.collectionKey)) return "Weapons";
  if (TREE_SOURCES.has(m.category) && TREE.test(m.title) && !NOT_TREE.test(m.title)) return "Trees";
  const weapon =
    WEAPON_SOURCES.has(m.category) && WEAPON.test(m.title) && !NOT_WEAPON.test(m.title) && !NOT_WEAPON_IN.test(m.collectionKey);
  if (m.category === "Characters" && !isCharacterBody(m)) return weapon ? "Weapons" : "Props";
  if (weapon && !(m.category === "Characters" && isCharacterBody(m))) return "Weapons";
  return m.category;
}
