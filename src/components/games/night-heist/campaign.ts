import { MUSEUM } from "./heists-1";
import { MANOR } from "./heists-2";
import { HARBOR } from "./heists-3";
import { CASINO } from "./heists-4";
import { TOWER } from "./heists-5";
import type { LevelDef } from "./levels";

/** The forty heists in order: five districts of eight (content.ts names the districts). */
export const LEVELS: LevelDef[] = [...MUSEUM, ...MANOR, ...HARBOR, ...CASINO, ...TOWER];
