import { inPlayables, playablesSave } from "../shared/playables";
import { createRecords } from "../shared/ui";
import { NO_TUNE, type Tune } from "./garage";

/** Everything Turbo Karts keeps in this browser: settings, best times, trophies, coins and the garage. */
const DEFAULTS = {
  driver: 0,
  cls: 1,
  mode: "cup" as "cup" | "time",
  /** Index into CUPS. */
  cup: 0,
  ttTrack: 0,
  /** Best lap and best 3-lap time per circuit id (Time Trial). */
  laps: {} as Record<string, number>,
  races: {} as Record<string, number>,
  /** Best cup finish (1..5) per "cup:class" — the first cup also under its old key, the class alone. */
  cups: {} as Record<string, number>,
  races_run: 0,
  autoGas: null as boolean | null,
  /** Coins in the bank. */
  coins: 0,
  /** Upgrade levels per kart (driver key). */
  tunes: {} as Record<string, Tune>,
  /** Karts bought (driver keys); the free ones need no entry. */
  cars: [] as string[],
  /** Cups bought (ids); the first is free. */
  stages: [] as string[],
  /** Paint jobs owned, and the one in use. */
  skins: ["stock"] as string[],
  skin: "stock",
  /** Name shown to other players online. */
  name: "",
};

// In YouTube Playables progress goes to YouTube's cloud save instead of this browser.
export const records = createRecords("turbo-karts:v1", DEFAULTS, { cloud: inPlayables() ? playablesSave : undefined });

export type Saved = ReturnType<typeof records.get>;

/** A free kart is always yours; the others once they are bought. */
export const ownsDriver = (saved: Saved, driver: { key: string; cost?: number }) => !driver.cost || saved.cars.includes(driver.key);

/** The first cup is free; the others (and their circuits in Time Trial) once they are bought. */
export const ownsCup = (saved: Saved, cup: { id: string; cost: number }) => !cup.cost || saved.stages.includes(cup.id);

export const tuneOf = (saved: Saved, driverKey: string): Tune => saved.tunes[driverKey] ?? NO_TUNE;

/** Best finish in a cup at a class, or 0. */
export const cupBest = (saved: Saved, cup: number, cls: number) => saved.cups[`${cup}:${cls}`] ?? (cup === 0 ? saved.cups[String(cls)] : undefined) ?? 0;
