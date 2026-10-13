#!/usr/bin/env node
/**
 * Records the Skate Rush gameplay Shorts one after another (scripts/record-skate-gameplay.mjs does each
 * one) and keeps a list of what is done. A video's file is named by its YouTube title (an upload takes
 * the file's name as the title), in Tanglish like the commentary, as near to 99 characters as it gets:
 *   ../youtube game play/skate rush game play/<number> - <title>.mp4 …         126 videos
 *   ../youtube game play/skate rush game play/PROGRESS.md                      the list, rewritten after every video
 *
 *   npm run dev                                         (in another terminal)
 *   node scripts/record-skate-gameplay-batch.mjs 20     the next 20 that are not made yet
 *   node scripts/record-skate-gameplay-batch.mjs        all that are left
 *   node scripts/record-skate-gameplay-batch.mjs 0      only rewrite PROGRESS.md
 *
 * Video n is on stage n mod 7 with skater n mod 18, skin n mod 10 and board n mod 13: the stages take
 * turns, and over the 126 videos every skater rides every stage once (as does every skin and board).
 * A video that is already in the folder (or in its "posted" folder, where the uploaded ones are moved) is
 * skipped, so the batch can be stopped and started again.
 *
 * Every video has the Tamil commentary (VOICE=ta in record-skate-gameplay.mjs; VOICE=off records without).
 *
 * Env: OUT (the folder) and everything record-skate-gameplay.mjs reads.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "youtube game play", "skate rush game play");
const LIST = path.join(OUT, "PROGRESS.md");

async function content() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/skate-rush/content.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `skate-content-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { SKATERS, SKINS, BOARDS, STAGES } = await content();

/** What each stage's titles open with (they take turns). No characters a file's name can't have (? : | " and the like). */
const HOOKS = {
  city: ["City Rush Traffic-la Thappikka Mudiyuma", "City Rush-la Taxi Bus Naduvula Skating", "City Rush Full Speed Run"],
  docks: ["Sunset Docks-la Periya Trucks Naduvula Skating", "Sunset Docks Golden Hour Run", "Sunset Docks-la Oru Lane Thappuna Game Over"],
  snow: ["Snow Village Ice Road-la Skating", "Snow Village-la Vazhukkaama Oda Mudiyuma", "Frozen Snow Village Run"],
  neon: ["Neon Night Fastest Stage Run", "Neon Night Glowing City-la Skating", "Neon Night-la 10 Percent Extra Speed"],
  haunted: ["Haunted Hollow-la Nadu Raathiri Skating", "Haunted Hollow Spooky Run", "Haunted Hollow-la Bayama Irukka"],
  pirate: ["Pirate Cove Beach Road-la Skating", "Pirate Cove-la Double Coins", "Pirate Cove Kadal Oram Run"],
  moon: ["Nilavula Skateboarding Moon Base Run", "Moon Base Low Gravity Jumps", "Moon Base-la Biggest Jumps"],
};
/** How a title ends: the longest that fits is taken. */
const TAILS = ["Skate Rush Tamil Gameplay - Free 3D Skateboard Game #shorts", "Skate Rush Tamil Gameplay - Free 3D Game #shorts", "Skate Rush Tamil Gameplay - Free Game #shorts", "Skate Rush Tamil Gameplay #shorts", "Skate Rush Tamil #shorts", "Skate Rush #shorts"];
/** YouTube allows 100 characters. */
const LIMIT = 99;
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const videos = Array.from({ length: STAGES.length * SKATERS.length }, (_, n) => {
  const stage = STAGES[n % STAGES.length];
  const skater = SKATERS[n % SKATERS.length];
  const skin = SKINS[n % SKINS.length];
  const board = BOARDS[n % BOARDS.length];
  const hooks = HOOKS[stage.id] ?? [`${stage.name} Run`];
  const hook = hooks[Math.floor(n / STAGES.length) % hooks.length];
  // The longest title that fits: with the skin and the board if there is room for them.
  const riders = [...(skin.id === "classic" ? [] : [`${skin.name} ${skater.name}`]), skater.name].flatMap((who) => [`${who} + ${board.name}${/board$/i.test(board.name) ? "" : " Board"}`, who]);
  const title = riders
    .flatMap((rider) => TAILS.map((tail) => `${hook} - ${rider} - ${tail}`))
    .filter((t) => t.length <= LIMIT)
    .reduce((best, t) => (t.length > best.length ? t : best), "");
  const no = String(n + 1).padStart(3, "0");
  return {
    no,
    stage,
    skater,
    skin,
    board,
    /** Its number first, to keep the folder in order (the title alone, for an upload, is the name without it). */
    file: `${no} - ${title}.mp4`,
    /** What it was called before: the title alone, and before the titles. */
    old: [`${title}.mp4`, `${no}-${slug(stage.name)}-${slug(skater.name)}.mp4`],
    /** What record-skate-gameplay.mjs calls it. */
    raw: `${stage.id}-${skater.id}-${skin.id}-${board.id}.mp4`,
    title,
  };
});

/** Videos that are uploaded are moved into "posted": they are done all the same. */
const posted = (v) => [v.file, ...v.old].some((name) => fs.existsSync(path.join(OUT, "posted", name)));
const done = (v) => posted(v) || fs.existsSync(path.join(OUT, v.file));

function writeList() {
  const made = videos.filter(done).length;
  const next = videos.find((v) => !done(v));
  const lines = [
    "# Skate Rush gameplay Shorts",
    "",
    `**${made} of ${videos.length} done** — updated ${new Date().toLocaleString("en-IN")}.${next ? ` Next: ${next.no}.` : ""}`,
    "",
    "Made by `node scripts/record-skate-gameplay-batch.mjs <how many>` in games.codelove.in (with `npm run dev` running). It skips the videos that are already here.",
    "",
    "A file's name is its number and its title: without the number, it is the title YouTube fills in at an upload.",
    "",
    "| # | Done | Stage | Skater | Skin | Board | Title (the file's name, without the number and .mp4) | Length |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...videos.map((v) => `| ${v.no} | ${posted(v) ? "posted" : done(v) ? "yes" : ""} | ${v.stage.name} | ${v.skater.name} | ${v.skin.name} | ${v.board.name} | ${v.title} | ${v.title.length} |`),
    "",
  ];
  fs.writeFileSync(LIST, lines.join("\n"));
}

fs.mkdirSync(OUT, { recursive: true });
// A video recorded on its own (not by this batch) still has the recorder's name.
for (const v of videos) for (const was of [v.raw, ...v.old]) if (!done(v) && fs.existsSync(path.join(OUT, was))) fs.renameSync(path.join(OUT, was), path.join(OUT, v.file));
for (const v of videos) if (!v.title || /[\\/:*?"<>|]/.test(v.title)) console.warn(`  ${v.no}: no title that fits a file's name (${v.title})`);
if (new Set(videos.map((v) => v.title)).size < videos.length) console.warn("  two videos have the same title");
writeList();

const count = process.argv[2] === undefined ? videos.length : Number(process.argv[2]);

const todo = videos.filter((v) => !done(v)).slice(0, count);
let failed = 0;
for (const [i, v] of todo.entries()) {
  console.log(`\n[${i + 1}/${todo.length}] ${v.no}: ${v.stage.name}, ${v.skater.name}, ${v.skin.name} skin, ${v.board.name} board`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "record-skate-gameplay.mjs"), v.stage.id, v.skater.id, v.skin.id, v.board.id], { stdio: "inherit", env: { ...process.env, OUT, VOICE: process.env.VOICE ?? "ta" } });
  if (r.status === 0 && fs.existsSync(path.join(OUT, v.raw))) {
    fs.renameSync(path.join(OUT, v.raw), path.join(OUT, v.file));
    failed = 0;
  } else if (++failed === 2) {
    console.error("record-skate-gameplay-batch: two videos in a row failed — stopping (is `npm run dev` running?)");
    break;
  }
  writeList();
}
console.log(`\n${videos.filter(done).length} of ${videos.length} done — ${path.relative(ROOT, LIST)}`);
process.exit(failed ? 1 : 0);
