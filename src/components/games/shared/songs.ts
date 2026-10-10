import { SCALES, type Song } from "./music";

/**
 * The soundtracks. Intensity 0 = menu / calm, 1 = playing, 2 = intense (fast speed, boss wave,
 * rush hour). Melodies are written as scale degrees so every note sits in the key.
 */

const FOUR = "x . . . x . . . x . . . x . . .";
const BACKBEAT = ". . . . x . . . . . . . x . . .";
const OFF8 = ". . x . . . x . . . x . . . x .";
const HATS16 = "x x x x x x x x x x x x x x x x";
const WHOLE = "x . . . . . . . . . . . . . . .";

/** Skate Rush — bright electro-pop in A major, I–V–vi–IV. */
export const CITY_RUSH: Song = {
  name: "City Rush",
  bpm: 124,
  root: 57,
  scale: SCALES.major,
  chords: [0, 4, 5, 3],
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], gain: 0.9 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2"], gain: 0.8 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "shaker", bars: [OFF8], to: 0, gain: 0.8 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "clap", bars: [BACKBEAT], from: 1, gain: 0.8 },
    { inst: "hat", bars: [OFF8], from: 1, to: 1 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.8 },
    { inst: "openhat", bars: [". . . . . . . . . . . . . . x ."], from: 2 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 7 0 . 0 7 0 . 0 7 0 . 4 .", "0 . 0 7 0 . 0 7 0 . 0 7 4 . 2 ."], from: 1 },
    {
      inst: "lead",
      mode: "abs",
      from: 1,
      bars: [
        "4 . . 2 4 . 7 . 6 . 4 . 2 . . .",
        "1 . . . 4 . 6 . 8 . 6 . 4 . . .",
        "5 . 7 . 9 . 7 . 5 . 4 . 2 . . .",
        "3 . 5 . 7 . . . 6 . 5 . 4 . . .",
        "7 . . . 9 . 7 . 4 . . . 2 . 4 .",
        "6 . . . 4 . 6 . 8 . . . 11 . . .",
        "9 . . 7 9 . 10 . 9 . 7 . 5 . . .",
        "7 . 5 . 3 . 5 . 4 . . . - . . .",
      ],
    },
    { inst: "brass", mode: "chord", bars: [". . . . . . x . . . x . . . . ."], from: 2, gain: 0.7 },
  ],
};

/** Saucer Siege — a sci-fi march in D minor: strings, bells, a theremin-like flute. */
export const SAUCER_MARCH: Song = {
  name: "Saucer March",
  bpm: 112,
  root: 50,
  scale: SCALES.minor,
  chords: [0, 5, 2, 6],
  echoSteps: 3,
  layers: [
    { inst: "strings", mode: "chord", bars: ["x . . . . . . . x . . . . . . ."], gain: 0.9 },
    {
      inst: "bell",
      mode: "abs",
      octave: 1,
      to: 0,
      bars: ["4 . . . 2 . 4 . 7 . . . 6 . 4 .", "5 . . . 4 . 2 . 0 . . . 2 . . .", "2 . 4 . 7 . 9 . 8 . 7 . 4 . . .", "6 . 4 . 6 . 8 . 7 . . . . . . ."],
    },
    { inst: "kick", bars: ["x . . . . . . . x . x . . . . ."], from: 1 },
    { inst: "snare", bars: [". . . . x . . x . . . . x . x x"], from: 1, gain: 0.75 },
    { inst: "hat", bars: ["x . x . x . x . x . x . x . x ."], from: 1, to: 1, gain: 0.8 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.75 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 . . . 0 . 4 . 4 . . . 2 .", "0 . 0 . . . 0 . 4 . 4 . 7 . 4 ."], from: 1 },
    {
      inst: "flute",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: [
        "0 . . . 2 . . . 4 . . . 3 . 2 .",
        "-2 . . . 0 . . . 2 . . . 0 . . .",
        "2 . . . 4 . . . 6 . . . 4 . . .",
        "6 . . . 4 . 3 . 1 . . . . . . .",
        "4 . . . 2 . 4 . 7 . . . 6 . 4 .",
        "5 . . . 4 . 2 . 0 . . . 2 . . .",
        "2 . 4 . 7 . 9 . 8 . 7 . 4 . . .",
        "6 . 4 . 6 . 8 . 7 . . . . . . .",
      ],
    },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 . 4 . 7 . 4 . 0 . 4 . 7 . 9 ."], from: 1, gain: 0.6 },
    { inst: "brass", mode: "chord", bars: ["x . . x . . x . . . . . x . . ."], from: 2, gain: 0.8 },
    { inst: "tom", bars: [". . . . . . . . . . . . x . x x"], from: 2, gain: 0.8 },
  ],
};

/** Pirate game — a 6/8 sea shanty in D dorian: accordion oom-pah, flute tune, cannon toms when fighting. */
export const SEA_SHANTY: Song = {
  name: "Salt & Cannon",
  bpm: 84,
  beats: 2,
  steps: 12,
  root: 50,
  scale: SCALES.dorian,
  chords: [0, 6, 0, 4, 0, 6, 3, 4],
  layers: [
    { inst: "accordion", mode: "chord", bars: ["x . . . . . . . . . . ."], to: 0 },
    { inst: "accordion", mode: "chord", bars: [". . x . x . . . x . x ."], from: 1, gain: 0.85 },
    { inst: "bass", mode: "rel", bars: ["0 . . . . . 4 . . . . ."], from: 1 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . . . . ."], to: 0 },
    { inst: "kick", bars: ["x . . . . . x . . . . ."], from: 1, gain: 0.85 },
    { inst: "shaker", bars: [". . x . x . . . x . x ."], from: 1 },
    {
      inst: "flute",
      mode: "abs",
      octave: 1,
      bars: [
        "4 . . . . . 2 . 1 . 0 .",
        "1 . 3 . 6 . 4 . . . 3 .",
        "2 . . . 4 . 7 . . . 4 .",
        "4 . 3 . 2 . 1 . . . . .",
        "4 . . . . . 7 . 6 . 4 .",
        "6 . 4 . 3 . 1 . . . 3 .",
        "3 . 5 . 7 . 5 . 4 . 3 .",
        "4 . . . 1 . 0 . . . . .",
      ],
    },
    { inst: "strings", mode: "chord", bars: ["x . . . . . x . . . . ."], from: 2, gain: 0.9 },
    { inst: "tom", bars: [". . . . . . x . x . x x"], from: 2 },
    { inst: "snare", bars: [". . . . . . x . . . . ."], from: 2, gain: 0.7 },
  ],
};

/** Dungeon game — galloping epic in E harmonic minor: Em – C – Am – B. */
export const CRYPT_EPIC: Song = {
  name: "Crypt of Bones",
  bpm: 132,
  root: 52,
  scale: SCALES.harmonicMinor,
  chords: [0, 5, 3, 4],
  layers: [
    { inst: "strings", mode: "chord", bars: [WHOLE] },
    { inst: "bell", mode: "rel", octave: 1, bars: ["0 . . . . . . . 4 . . . . . . .", "2 . . . . . . . 4 . . . 7 . . ."], to: 0, gain: 0.8 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "kick", bars: ["x . . x . . x . x . . x . . x ."], from: 1 },
    { inst: "snare", bars: [BACKBEAT], from: 1 },
    { inst: "hat", bars: ["x . x . x . x . x . x . x . x ."], from: 1, to: 1, gain: 0.8 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.8 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 0 0 . 0 0 0 . 0 0 0 . 0 0"], from: 1, gain: 0.85 },
    {
      inst: "brass",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: [
        "0 . . . . . 2 . 4 . . . 7 . . .",
        "5 . . . 4 . 2 . 4 . . . . . . .",
        "3 . . . 5 . 7 . 9 . . . 7 . 5 .",
        "6 . . . 4 . . . 1 . . . 6 . . .",
      ],
    },
    { inst: "tom", bars: [". . . . . . . . . . . . x x x x"], from: 2, gain: 0.7 },
    { inst: "lead", mode: "rel", octave: 1, bars: ["0 . 2 . 4 . 2 . 0 . 2 . 4 . 7 ."], from: 2, gain: 0.6 },
  ],
};

/** Restaurant game — a swung bossa in F: Gm7 – C7 – Fmaj7 – Dm7, electric piano and marimba. */
export const KITCHEN_BOSSA: Song = {
  name: "Order Up!",
  bpm: 112,
  swing: 0.16,
  root: 53,
  scale: SCALES.major,
  chords: [1, 4, 0, 5],
  sevenths: true,
  layers: [
    { inst: "piano", mode: "chord", bars: [". . x . . . x . . x . . . . x ."], gain: 0.9 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . 4 . . . . . . ."], to: 0 },
    { inst: "kick", bars: ["x . . . . . . . x . . x . . . ."], from: 1, gain: 0.85 },
    { inst: "shaker", bars: ["x . x x x . x x x . x x x . x x"], from: 1, gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 . . . 2 . . . 4 . . . 5 . . ."], from: 1, gain: 0.85 },
    {
      inst: "marimba",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: [
        "1 . 3 . 5 . . 4 . . 3 . 1 . . .",
        "4 . 6 . 8 . . . 6 . 4 . 3 . . .",
        "2 . . . 0 . 2 . 4 . . . 6 . . .",
        "5 . . . 4 . 2 . 0 . . . . . . .",
      ],
    },
    { inst: "hat", bars: ["x . x . x . x . x . x . x . x ."], from: 2, gain: 0.7 },
    { inst: "brass", mode: "chord", bars: [". . . . x . . . . . . . x . . ."], from: 2, gain: 0.6 },
    { inst: "clap", bars: [BACKBEAT], from: 2, gain: 0.6 },
  ],
};

/** Hex puzzle — calm ambient in G major pentatonic: pads, marimba, sparse bells. */
export const HEX_AMBIENT: Song = {
  name: "Hex Haven",
  bpm: 76,
  root: 55,
  scale: SCALES.pentatonic,
  chords: [0, 4, 1, 3],
  echoSteps: 6,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE] },
    { inst: "marimba", mode: "rel", octave: 1, bars: ["0 . 2 . 4 . 2 . 5 . 4 . 2 . . .", "0 . 2 . 4 . 5 . 7 . 5 . 4 . 2 ."], gain: 0.7 },
    {
      inst: "bell",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: ["4 . . . . . . . 2 . . . 3 . . .", "5 . . . . . . . 4 . . . . . . .", "3 . . . 2 . . . 1 . . . . . . .", "2 . . . . . . . . . . . - . . ."],
    },
    { inst: "sub", mode: "rel", bars: [WHOLE], from: 1, gain: 0.8 },
    { inst: "shaker", bars: [OFF8], from: 1, gain: 0.5 },
    { inst: "kick", bars: ["x . . . . . . . . . x . . . . ."], from: 2, gain: 0.6 },
    { inst: "flute", mode: "abs", octave: 1, bars: ["7 . . . . . 6 . 5 . . . . . . .", "4 . . . . . . . 5 . . . . . . ."], from: 2, gain: 0.7 },
  ],
};

/** Platformer — bouncy chiptune in C major: I–vi–IV–V. */
export const SKY_HOP: Song = {
  name: "Sky Hop",
  bpm: 140,
  root: 60,
  scale: SCALES.major,
  chords: [0, 5, 3, 4],
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], to: 0 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2"], gain: 0.7 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "snare", bars: [BACKBEAT], from: 1, gain: 0.7 },
    { inst: "hat", bars: ["x . x . x . x . x . x . x . x ."], from: 1, to: 1, gain: 0.7 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 . 7 . 0 . 7 . 0 . 7 . 4 . 7 ."], from: 1, gain: 0.85 },
    {
      inst: "lead",
      mode: "abs",
      from: 1,
      bars: [
        "4 . 4 . 7 . 4 . 2 . 4 . 7 . . .",
        "5 . 5 . 9 . 7 . 5 . 4 . 2 . . .",
        "3 . 5 . 7 . 5 . 3 . 2 . 0 . . .",
        "1 . 4 . 6 . 8 . 6 . . . 4 . . .",
        "7 . . 9 7 . 4 . 2 . 4 . 7 . . .",
        "9 . . . 7 . 5 . 4 . . . 2 . . .",
        "3 . 2 . 3 . 5 . 7 . 5 . 3 . . .",
        "4 . . . 6 . . . 8 . . . . . - .",
      ],
    },
    { inst: "marimba", mode: "rel", octave: 1, bars: [". . 4 . . . 2 . . . 4 . . . 7 ."], from: 2, gain: 0.8 },
  ],
};

/** Racing — driving synthwave in E minor: Em – C – G – D. */
export const TURBO_LAP: Song = {
  name: "Turbo Lap",
  bpm: 150,
  root: 52,
  scale: SCALES.minor,
  chords: [0, 5, 2, 6],
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE] },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 2 4 7 0 2 4 7 0 2 4 7 4 2 0 2"], gain: 0.6 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "clap", bars: [BACKBEAT], from: 1, gain: 0.8 },
    { inst: "hat", bars: [OFF8], from: 1, to: 1 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.8 },
    { inst: "openhat", bars: [". . x . . . x . . . x . . . x ."], from: 2, gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 0 7 0 0 7 0 0 0 0 7 0 0 7 0 7"], from: 1, gain: 0.8 },
    {
      inst: "lead",
      mode: "abs",
      from: 1,
      bars: ["4 . . . 7 . . . 6 . 4 . 2 . 4 .", "5 . . . 4 . . . 2 . . . 0 . . .", "2 . 4 . 6 . 4 . 9 . . . 8 . 6 .", "6 . . . 5 . 3 . 1 . . . . . . ."],
    },
    { inst: "brass", mode: "chord", bars: ["x . . x . . x . . . x . . . . ."], from: 2, gain: 0.7 },
  ],
};

/** Castle siege — a medieval folk march in G mixolydian: G – F – C – G, lute plucks and flute. */
export const SIEGE_FOLK: Song = {
  name: "Siege Folk",
  bpm: 104,
  root: 55,
  scale: SCALES.mixolydian,
  chords: [0, 6, 3, 0],
  echoSteps: 2,
  layers: [
    { inst: "strings", mode: "chord", bars: [WHOLE], gain: 0.7 },
    { inst: "pluck", mode: "rel", bars: ["0 . 4 . 7 . 4 . 0 . 4 . 7 . 4 ."], gain: 0.75 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . 4 . . . . . . ."], gain: 0.8 },
    { inst: "tom", bars: ["x . . . . . x . x . . . . . x ."], from: 1, gain: 0.7 },
    { inst: "shaker", bars: [OFF8], from: 1, gain: 0.7 },
    {
      inst: "flute",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: ["4 . 2 . 4 . 7 . 6 . 4 . 2 . . .", "6 . 5 . 6 . 3 . 5 . . . 3 . . .", "3 . 5 . 7 . 5 . 3 . 2 . 3 . . .", "4 . . . 2 . 1 . 0 . . . . . . ."],
    },
    { inst: "kick", bars: ["x . . . . . . . x . . . . . . ."], from: 2, gain: 0.8 },
    { inst: "snare", bars: [". . . . x . . x . . . . x . x x"], from: 2, gain: 0.6 },
    { inst: "brass", mode: "chord", bars: ["x . . . . . . . x . . . x . . ."], from: 2, gain: 0.6 },
  ],
};

/** Mini golf — lazy lo-fi jazz in D: Dmaj7 – Bm7 – Em7 – A7, swung. */
export const FAIRWAY_LOFI: Song = {
  name: "Fairway Breeze",
  bpm: 84,
  swing: 0.2,
  root: 50,
  scale: SCALES.major,
  chords: [0, 5, 1, 4],
  sevenths: true,
  echoSteps: 4,
  layers: [
    { inst: "piano", mode: "chord", bars: ["x . . . . . x . . . . . . . . .", ". . . x . . . . x . . . . . . ."], gain: 0.85 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . 4 . . . . . . ."], gain: 0.8 },
    { inst: "kick", bars: ["x . . . . . . x . . x . . . . ."], from: 1, gain: 0.7 },
    { inst: "snare", bars: [BACKBEAT], from: 1, gain: 0.45 },
    { inst: "hat", bars: ["x . x . x . x . x . x . x . x ."], from: 1, gain: 0.55 },
    {
      inst: "marimba",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: ["2 . . 4 . . 6 . 4 . . . 2 . . .", "5 . . 4 . . 2 . 0 . . . . . . .", "1 . . 3 . . 5 . 7 . . . 5 . . .", "4 . . . 6 . . . 8 . 7 . 6 . . ."],
    },
    { inst: "flute", mode: "abs", octave: 1, bars: ["9 . . . . . . . 7 . . . . . . .", "- . . . . . . . . . . . . . . ."], from: 2, gain: 0.7 },
  ],
};

/** Rhythm game — disco funk in A dorian: Am7 – D7, octave bass, four on the floor. */
export const DISCO_FEVER: Song = {
  name: "Disco Fever",
  bpm: 118,
  root: 57,
  scale: SCALES.dorian,
  chords: [0, 0, 3, 3],
  sevenths: true,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], to: 0 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "clap", bars: [BACKBEAT], from: 1 },
    { inst: "openhat", bars: [OFF8], from: 1, gain: 0.8 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.6 },
    { inst: "bass", mode: "rel", bars: ["0 . 7 . 0 . 7 . 0 . 7 . 0 . 7 .", "0 . 7 . 0 . 7 . 4 . 2 . 0 . 7 ."], from: 1 },
    { inst: "piano", mode: "chord", bars: [". . x . . x . . . . x . . x . ."], from: 1, gain: 0.8 },
    { inst: "strings", mode: "chord", bars: ["x . . . . . . . . . . . . . . ."], from: 2, gain: 0.8 },
    {
      inst: "lead",
      mode: "abs",
      from: 1,
      bars: ["7 . . 9 . . 7 . 4 . . . 6 . 7 .", "4 . . 2 . . 0 . 2 . . . . . . .", "10 . . 9 . . 7 . 6 . . . 7 . 9 .", "7 . . . . . . . - . . . . . . ."],
    },
  ],
};

/**
 * Kingdom builder — a 16-bar heroic march in B♭ major. A section: I–V–vi–IV–I–IV–ii–V; B section
 * climbs IV–V–iii–vi–ii–V–I–V. Brass carries the tune (a flute doubles it an octave up in B) over
 * strings, pizzicato, timpani and a light march snare. Everything plays in the village (intensity 0).
 */
const MARCH_TUNE = [
  "0 . . 2 4 . . . 4 . 2 . 4 . 7 .",
  "6 . . . 4 . . . 1 . . . 4 . . .",
  "5 . . 4 5 . 7 . 9 . . . 7 . . .",
  "7 . . . 5 . 3 . 5 . . . - . . .",
  "0 . . 2 4 . . . 4 . 2 . 4 . 7 .",
  "7 . . 9 10 . . . 9 . 7 . 5 . . .",
  "8 . . 7 5 . . . 3 . 5 . 8 . . .",
  "8 . . . 6 . . . 4 . . . - . . .",
  "3 . . 5 7 . . . 7 . 9 . 10 . 9 .",
  "8 . . . 8 . 6 . 4 . . . 6 . 8 .",
  "9 . . 8 9 . 11 . 9 . . . 6 . . .",
  "7 . . 5 7 . 9 . 12 . . . 11 . 9 .",
  "10 . . 9 8 . . . 7 . 8 . 10 . . .",
  "11 . . 10 9 . . . 8 . 6 . 4 . . .",
  "7 . . 4 7 . 9 . 11 . . . 9 . 7 .",
  "6 . . . 4 . . . 1 . . . - . . .",
];
const REST = "- . . . . . . . . . . . . . . .";

export const CLASH_MARCH: Song = {
  name: "Banners Up",
  bpm: 100,
  root: 58,
  scale: SCALES.major,
  chords: [0, 4, 5, 3, 0, 3, 1, 4, 3, 4, 2, 5, 1, 4, 0, 4],
  layers: [
    { inst: "strings", mode: "chord", bars: [WHOLE], gain: 0.5 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . 4 . . . . . . ."], gain: 0.65 },
    { inst: "pluck", mode: "rel", bars: ["0 . 4 . 7 . 4 . 2 . 4 . 7 . 4 ."], gain: 0.34 },
    { inst: "tom", bars: ["X . . . . . . . x . . . . . . .", "X . . . . . . . x . . . x . x ."], gain: 0.5 },
    { inst: "snare", bars: [". . . . x . . . . . . . x . x x", ". . . . x . . . . . . . x . . ."], gain: 0.26 },
    { inst: "hat", bars: [OFF8], gain: 0.22 },
    { inst: "brass", mode: "abs", bars: MARCH_TUNE, gain: 0.42 },
    { inst: "flute", mode: "abs", octave: 1, bars: [...Array(8).fill(REST), ...MARCH_TUNE.slice(8)], gain: 0.26 },
    { inst: "bell", mode: "rel", octave: 1, bars: [...Array(8).fill(REST), ...Array(8).fill("0 . . . . . . . . . . . . . . .")], gain: 0.28 },
    { inst: "brass", mode: "chord", octave: -1, bars: [...Array(7).fill(REST), ". . . . . . . . x . . x x . . .", ...Array(7).fill(REST), ". . . . . . . . x . . x x . . ."], gain: 0.45 },
    { inst: "kick", bars: [FOUR], from: 1, gain: 0.6 },
  ],
};

/** Island survival — a breezy tropical groove in F: marimba, shaker, plucked bass; drums build at night. */
export const ISLAND_DRIFT: Song = {
  name: "Island Drift",
  bpm: 96,
  swing: 0.12,
  root: 53,
  scale: SCALES.major,
  chords: [0, 3, 4, 0],
  echoSteps: 3,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], gain: 0.7 },
    { inst: "pluck", mode: "rel", bars: ["0 . . 4 . . 7 . 4 . . 2 . . 4 ."], gain: 0.6 },
    { inst: "shaker", bars: ["x . x x x . x x x . x x x . x x"], from: 1, gain: 0.6 },
    { inst: "kick", bars: ["x . . . . . . . x . . . . . . ."], from: 1, gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 . . . . . 4 . 0 . . . 7 . 4 ."], from: 1, gain: 0.7 },
    {
      inst: "marimba",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: ["4 . 2 . 4 . 7 . 4 . . . 2 . 0 .", "3 . 5 . 7 . 5 . 3 . . . 2 . . .", "4 . 6 . 8 . 6 . 4 . . . 1 . . .", "2 . 0 . -1 . 0 . . . . . - . . ."],
    },
    { inst: "tom", bars: [". . . . . . x . . . x . x . x x"], from: 2, gain: 0.7 },
    { inst: "strings", mode: "chord", octave: -1, bars: [WHOLE], from: 2, gain: 0.6 },
  ],
};

/** Space shooter — a fast synth-chiptune in D minor: Dm – B♭ – C – Am. */
export const NOVA_RUSH: Song = {
  name: "Nova Rush",
  bpm: 164,
  root: 50,
  scale: SCALES.minor,
  chords: [0, 5, 6, 4],
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], to: 0 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 2 4 7 4 2 0 2 4 7 9 7 4 2 0 2"], gain: 0.6 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "snare", bars: [BACKBEAT], from: 1, gain: 0.7 },
    { inst: "hat", bars: [OFF8], from: 1, to: 1 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 0 7 0 0 7 0 0 0 0 7 0 0 7 0 7"], from: 1, gain: 0.8 },
    {
      inst: "lead",
      mode: "abs",
      from: 1,
      bars: ["7 . 7 . 4 . 7 . 9 . 7 . 4 . 2 .", "5 . 5 . 2 . 5 . 7 . 5 . 2 . 0 .", "6 . 6 . 3 . 6 . 8 . 6 . 3 . 1 .", "4 . 4 . 1 . 4 . 6 . 4 . 1 . 4 ."],
    },
    { inst: "brass", mode: "chord", bars: ["x . . x . . x . . . . . x . . ."], from: 2, gain: 0.6 },
    { inst: "openhat", bars: [". . x . . . x . . . x . . . x ."], from: 2, gain: 0.6 },
  ],
};

/** Stealth heist — spy jazz in A harmonic minor: Am(maj7) – Dm7 – E7, walking bass, swung. */
export const NOIR_HEIST: Song = {
  name: "After Hours",
  bpm: 104,
  swing: 0.2,
  root: 57,
  scale: SCALES.harmonicMinor,
  chords: [0, 0, 3, 4],
  sevenths: true,
  echoSteps: 3,
  layers: [
    { inst: "piano", mode: "chord", bars: ["x . . . . . . . . . . . . . . .", ". . . . . . x . . . . . . . . ."], gain: 0.7 },
    { inst: "bass", mode: "rel", bars: ["0 . . . 2 . . . 4 . . . 6 . . ."], gain: 0.75 },
    { inst: "shaker", bars: ["x . x . x . x . x . x . x . x ."], gain: 0.45 },
    { inst: "snare", bars: [BACKBEAT], from: 1, gain: 0.35 },
    {
      inst: "pluck",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: ["4 . . 5 4 . . . 2 . . . 0 . . .", "4 . . 5 4 . . . 6 . . . 7 . . .", "5 . . 7 5 . . . 3 . . . 0 . . .", "6 . . 4 6 . . . 8 . . . 6 . . ."],
    },
    { inst: "kick", bars: [FOUR], from: 2, gain: 0.8 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.6 },
    { inst: "brass", mode: "chord", bars: [". . . . x . . . . . . . x . x ."], from: 2, gain: 0.6 },
  ],
};

/** Airship delivery — a soaring 3/4 waltz in D: strings, oom-pah-pah piano, flute tune. */
export const AIR_WALTZ: Song = {
  name: "Air Waltz",
  bpm: 108,
  beats: 3,
  steps: 12,
  root: 50,
  scale: SCALES.major,
  chords: [0, 4, 5, 3],
  layers: [
    { inst: "strings", mode: "chord", bars: ["x . . . . . . . . . . ."], gain: 0.8 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . . . . ."], gain: 0.8 },
    { inst: "piano", mode: "chord", bars: [". . . . x . . . x . . ."], from: 1, gain: 0.6 },
    {
      inst: "flute",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: [
        "4 . . . 7 . . . 9 . . .",
        "8 . . . 6 . . . 4 . . .",
        "5 . . . 7 . . . 9 . 8 .",
        "7 . . . 6 . . . 3 . . .",
        "4 . 5 . 7 . . . 9 . . .",
        "11 . . . 9 . . . 8 . . .",
        "9 . . . 8 . . . 7 . . .",
        "6 . . . 4 . . . - . . .",
      ],
    },
    { inst: "bell", mode: "rel", octave: 1, bars: [". . . . . . . . 7 . . ."], to: 1, gain: 0.5 },
    { inst: "tom", bars: ["x . . . . . . . x . x x"], from: 2, gain: 0.7 },
    { inst: "brass", mode: "chord", bars: ["x . . . . . x . . . . ."], from: 2, gain: 0.6 },
  ],
};

/**
 * Kingdom battles — a 16-bar battle theme in G harmonic minor. A: i–VI–iv–V twice with the brass
 * rising an octave; B: iv–i–VI–V–iv–i–V–V in broad notes, then a run back up. A driving string
 * ostinato and timpani all the way; drums fill in from intensity 1 (raid), hats and stabs at 2.
 */
const CHARGE_TUNE = [
  "4 . . 4 4 . 2 . 4 . 7 . . . . .",
  "5 . . 5 5 . 4 . 2 . 0 . . . . .",
  "3 . . 5 7 . . . 9 . 7 . 5 . 3 .",
  "4 . . 6 8 . . . 11 . . . - . . .",
  "7 . . 7 7 . 9 . 11 . 9 . 7 . . .",
  "12 . . 11 9 . . . 7 . 9 . 12 . . .",
  "10 . . 9 7 . . . 5 . 7 . 10 . . .",
  "11 . . . 8 . . . 6 . 8 . 11 . . .",
  "3 . . . 5 . . . 7 . . . 10 . . .",
  "9 . . . 7 . . . 4 . . . 2 . . .",
  "5 . . . 7 . . . 9 . . . 12 . . .",
  "11 . . . . . . . 8 . . . 6 . . .",
  "10 . . 10 10 . 9 . 7 . 5 . 3 . . .",
  "4 . . 4 4 . 7 . 9 . 11 . . . . .",
  "11 . . 10 8 . . . 6 . 8 . 11 . 13 .",
  "14 . . . 11 . . . 8 . . . - . . .",
];

export const CLASH_BATTLE: Song = {
  name: "Charge!",
  bpm: 144,
  root: 55,
  scale: SCALES.harmonicMinor,
  chords: [0, 5, 3, 4, 0, 5, 3, 4, 3, 0, 5, 4, 3, 0, 4, 4],
  layers: [
    { inst: "strings", mode: "rel", bars: ["0 0 2 0 4 0 2 0 0 0 2 0 4 0 7 4"], gain: 0.62 },
    { inst: "strings", mode: "chord", octave: -1, bars: [WHOLE], gain: 0.5 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 . 0 . 0 . 0 . 0 . 4 . 4 ."], gain: 0.8 },
    { inst: "tom", bars: ["X . . . . . x . X . . . x . x x", "X . . . . . x . X . . . X . . ."], gain: 0.8 },
    { inst: "brass", mode: "abs", bars: CHARGE_TUNE, from: 1, gain: 0.6 },
    { inst: "kick", bars: [FOUR], from: 1, gain: 0.7 },
    { inst: "snare", bars: [". . . . x . . x . . . . x . x x", ". . . . x . . . . . . . x x x x"], from: 1, gain: 0.5 },
    { inst: "openhat", bars: ["x . . . . . . . . . . . . . . ."], from: 1, gain: 0.55 },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.55 },
    { inst: "brass", mode: "chord", bars: ["x . . x . . x . . . . . x . . ."], from: 2, gain: 0.6 },
    { inst: "flute", mode: "abs", octave: 1, bars: CHARGE_TUNE, from: 2, gain: 0.28 },
  ],
};
