import { SCALES, type Song } from "../shared/music";
import { DISCO_FEVER } from "../shared/songs";

/**
 * Beat Street's tracks. Each one is a song for the shared music engine plus an arrangement: the
 * sections the chart is built from (which instrument the notes follow) and the intensity the music
 * plays at. Layers the chart reads are active at intensity 1 and 2, so a fever (which pushes the
 * music to 2) never changes what you hear under the notes — it only adds layers on top.
 *
 * Melodies are scale degrees written on the bar's chord tones (see the comments per bar).
 */

const FOUR = "x . . . x . . . x . . . x . . .";
const BACKBEAT = ". . . . x . . . . . . . x . . .";
const OFF8 = ". . x . . . x . . . x . . . x .";
const EIGHTHS = "x . x . x . x . x . x . x . x .";
const HATS16 = "x x x x x x x x x x x x x x x x";
const WHOLE = "x . . . . . . . . . . . . . . .";

/** House in F minor, 124 bpm: Fm7 – Dbmaj7 – Abmaj7 – Eb7, offbeat bass and piano stabs. */
export const NEON_NIGHTS: Song = {
  name: "Neon Nights",
  bpm: 124,
  root: 53,
  scale: SCALES.minor,
  chords: [0, 5, 2, 6],
  sevenths: true,
  echoSteps: 3,
  layers: [
    // Menu: pads and a soft arpeggio.
    { inst: "pad", mode: "chord", bars: [WHOLE], to: 0 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 . 2 . 4 . 2 . 6 . 4 . 2 . 4 ."], to: 0, gain: 0.6 },
    // Groove (charted).
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "clap", bars: [BACKBEAT], from: 1, gain: 0.85 },
    { inst: "openhat", bars: [OFF8], from: 1, gain: 0.75 },
    { inst: "bass", mode: "rel", bars: [". . 0 . . . 0 . . . 0 . . . 0 .", ". . 0 . . . 0 . . . 0 . 4 . 7 ."], from: 1, gain: 0.95 },
    { inst: "piano", mode: "chord", bars: ["x . . x . . x . . . x . . . . .", "x . . x . . x . . . x . . x . ."], from: 1, gain: 0.75 },
    {
      inst: "lead",
      mode: "abs",
      octave: 1,
      from: 1,
      gain: 0.9,
      bars: [
        // Chorus (bars 0-7 of the 16-bar cycle — the arrangement lines the sections up with it).
        "7 . . 9 . . 11 . . . 9 . 7 . . .", // Fm: F Ab C Ab F
        "12 . . 11 . . 9 . . . 7 . 9 . . .", // Db: Db C Ab F Ab
        "11 . . 9 . . 6 . . . 8 . 9 . 11 .", // Ab: C Ab Eb G Ab C
        "10 . . . . . . . 8 . . . 6 . . .", // Eb: Bb G Eb
        "7 . . 9 . . 11 . . . 9 . 7 . . .", // Fm
        "12 . . 11 . . 9 . . . 7 . 5 . . .", // Db: Db C Ab F Db
        "6 . . 8 . . 9 . . . 11 . 13 . . .", // Ab: Eb G Ab C Eb
        "8 . . . 10 . . . 13 . . . . . - .", // Eb: G Bb Eb
        // Verse (bars 8-15).
        "4 . . . 2 . 4 . 7 . . . 6 . 4 .", // Fm: C Ab C F Eb C
        "5 . . . . . 7 . 9 . 7 . 5 . . .", // Db: Db F Ab F Db
        "6 . . . 4 . 2 . 4 . . . 6 . 8 .", // Ab: Eb C Ab C Eb G
        "8 . . . . . . . 6 . . . 3 . . .", // Eb: G Eb Bb
        "4 . . . 2 . 4 . 7 . . . 9 . 7 .", // Fm: C Ab C F Ab F
        "9 . . . 7 . 5 . 7 . . . 5 . 2 .", // Db: Ab F Db F Db Ab
        "4 . 6 . 8 . 6 . 4 . . . 2 . . .", // Ab: C Eb G Eb C Ab
        "1 . . . 3 . 6 . 8 . . . . . - .", // Eb: G Bb Eb G
      ],
    },
    // Chorus / fever extras.
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.5 },
    { inst: "strings", mode: "chord", bars: [WHOLE], from: 2, gain: 0.75 },
  ],
};

/** Synth-pop in D major, 136 bpm: Bm – G – D – A, pumping eighth-note bass. */
export const PIXEL_HEART: Song = {
  name: "Pixel Heart",
  bpm: 136,
  root: 50,
  scale: SCALES.major,
  chords: [5, 3, 0, 4],
  echoSteps: 3,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE], to: 0 },
    { inst: "bell", mode: "rel", octave: 1, bars: ["0 . . . 2 . . . 4 . . . 2 . . ."], to: 0, gain: 0.7 },
    { inst: "sub", mode: "rel", bars: [WHOLE], to: 0 },
    { inst: "kick", bars: [FOUR], from: 1 },
    { inst: "snare", bars: [BACKBEAT], from: 1, gain: 0.85 },
    { inst: "hat", bars: [OFF8], from: 1, gain: 0.8 },
    { inst: "bass", mode: "rel", bars: ["0 . 0 . 7 . 0 . 0 . 0 . 7 . 0 .", "0 . 0 . 7 . 0 . 0 . 4 . 7 . 4 ."], from: 1, gain: 0.85 },
    { inst: "brass", mode: "chord", bars: [". . . . . . x . . . x . . . . .", "x . . . . . x . . . x . . . x ."], from: 1, gain: 0.55 },
    {
      inst: "lead",
      mode: "abs",
      octave: 1,
      from: 1,
      bars: [
        "5 . . 7 . . 9 . . . 7 . 5 . . .", // Bm: B D F# D B
        "3 . . 5 . . 7 . . . 10 . 7 . . .", // G: G B D G D
        "4 . . 7 . . 9 . . . 11 . 9 . 7 .", // D: A D F# A F# D
        "8 . . . . . 6 . . . 4 . . . . .", // A: E C# A
        "5 . . 7 . . 9 . . . 12 . 11 . 9 .", // Bm: B D F# B A F#
        "10 . . 9 . . 7 . . . 5 . 3 . . .", // G: G F# D B G
        "7 . 9 . 11 . 14 . . . 11 . 9 . . .", // D: D F# A D A F#
        "13 . . . . . . . 11 . . . - . . .", // A: C# A
      ],
    },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.55 },
    { inst: "openhat", bars: [". . . . . . . . . . . . . . x ."], from: 2, gain: 0.7 },
    { inst: "pluck", mode: "rel", octave: 1, bars: ["0 2 4 7 4 2 0 2 4 7 4 2 0 2 4 2"], from: 2, gain: 0.5 },
  ],
};

/** Liquid drum & bass in F# minor, 172 bpm: F#m – F#m – D – E, two-step drums, long melody notes. */
export const BASS_ROCKET: Song = {
  name: "Bass Rocket",
  bpm: 172,
  root: 54,
  scale: SCALES.minor,
  chords: [0, 0, 5, 6],
  echoSteps: 6,
  layers: [
    { inst: "pad", mode: "chord", bars: [WHOLE] },
    { inst: "bell", mode: "rel", octave: 1, bars: ["0 . . . . . 4 . . . . . 7 . . .", "4 . . . . . 2 . . . . . 0 . . ."], to: 0, gain: 0.6 },
    { inst: "kick", bars: ["x . . . . . . . . . x . . . . ."], from: 1 },
    { inst: "snare", bars: [BACKBEAT], from: 1 },
    { inst: "hat", bars: [EIGHTHS], from: 1, gain: 0.7 },
    { inst: "sub", mode: "rel", bars: ["0 . . . . . . . . . 0 . . . . ."], from: 1, gain: 0.9 },
    { inst: "bass", mode: "rel", bars: ["0 . . . . . . 0 . . 4 . . . 7 .", "0 . . . . . . 0 . . 7 . . . 4 ."], from: 1, gain: 0.7 },
    {
      inst: "lead",
      mode: "abs",
      octave: 1,
      from: 1,
      gain: 0.85,
      bars: [
        "7 . . . . . . . 4 . . . 2 . 4 .", // F#m: F# C# A C#
        "7 . . . . . 9 . 11 . . . . . . .", // F#m: F# A C#
        "9 . . . 7 . . . 5 . . . . . . .", // D: A F# D
        "6 . . . . . . . 8 . . . 10 . . .", // E: E G# B
        "11 . . . . . . . 9 . . . 7 . 9 .", // F#m: C# A F# A
        "11 . . . . . 9 . 7 . . . . . . .", // F#m: C# A F#
        "12 . . . 9 . . . 7 . . . 5 . . .", // D: D A F# D
        "10 . . . . . . . 8 . . . 6 . . .", // E: B G# E
      ],
    },
    { inst: "hat", bars: [HATS16], from: 2, gain: 0.45 },
    { inst: "snare", bars: [". . . . . . . x . x . . . . . x"], from: 2, gain: 0.35 },
    { inst: "strings", mode: "chord", bars: [WHOLE], from: 2, gain: 0.7 },
  ],
};

// --- Tracks -----------------------------------------------------------------------------------------

/** Which part of the music the notes follow in a section. */
export type Focus = "none" | "drums" | "bass" | "lead" | "keys";

export interface Section {
  label: string;
  bars: number;
  /** Music intensity (1 verse, 2 chorus, 0 outro). */
  intensity: number;
  focus: Focus;
}

export interface Track {
  id: string;
  title: string;
  style: string;
  song: Song;
  /** Instrument the "keys" focus follows (chord stabs). */
  keys: string;
  sections: Section[];
}

const S = (label: string, bars: number, intensity: number, focus: Focus): Section => ({ label, bars, intensity, focus });

export const TRACKS: Track[] = [
  {
    id: "disco-fever",
    title: "Disco Fever",
    style: "Disco funk",
    song: DISCO_FEVER,
    keys: "piano",
    sections: [
      S("Intro", 2, 1, "drums"),
      S("Verse", 6, 1, "bass"),
      S("Chorus", 8, 2, "lead"),
      S("Break", 4, 1, "keys"),
      S("Verse", 8, 1, "lead"),
      S("Chorus", 8, 2, "lead"),
      S("Bridge", 4, 2, "drums"),
      S("Finale", 4, 2, "bass"),
      S("Outro", 2, 0, "none"),
    ],
  },
  {
    id: "neon-nights",
    title: "Neon Nights",
    style: "House",
    song: NEON_NIGHTS,
    keys: "piano",
    sections: [
      S("Intro", 2, 1, "drums"),
      S("Groove", 6, 1, "bass"),
      S("Verse", 8, 1, "lead"),
      S("Chorus", 8, 2, "lead"),
      S("Break", 8, 1, "keys"),
      S("Chorus", 8, 2, "lead"),
      S("Finale", 8, 2, "bass"),
      S("Outro", 2, 0, "none"),
    ],
  },
  {
    id: "pixel-heart",
    title: "Pixel Heart",
    style: "Synth-pop",
    song: PIXEL_HEART,
    keys: "brass",
    sections: [
      S("Intro", 2, 1, "drums"),
      S("Verse", 6, 1, "bass"),
      S("Hook", 8, 2, "lead"),
      S("Verse", 8, 1, "keys"),
      S("Hook", 8, 2, "lead"),
      S("Drop", 8, 2, "bass"),
      S("Hook", 8, 2, "lead"),
      S("Outro", 2, 0, "none"),
    ],
  },
  {
    id: "bass-rocket",
    title: "Bass Rocket",
    style: "Drum & bass",
    song: BASS_ROCKET,
    keys: "bass",
    sections: [
      S("Intro", 4, 1, "drums"),
      S("Roll", 4, 1, "bass"),
      S("Theme", 16, 2, "lead"),
      S("Break", 8, 1, "drums"),
      S("Roll", 8, 1, "bass"),
      S("Theme", 16, 2, "lead"),
      S("Bridge", 8, 2, "drums"),
      S("Outro", 2, 0, "none"),
    ],
  },
];

export const trackBars = (t: Track) => t.sections.reduce((n, s) => n + s.bars, 0);

/** Track length in seconds (to the end of the last section). */
export function trackSeconds(t: Track) {
  const steps = t.song.steps ?? 16;
  const stepDur = ((60 / t.song.bpm) * (t.song.beats ?? 4)) / steps;
  return trackBars(t) * steps * stepDur;
}

/** The section a bar belongs to (the last one past the end). */
export function sectionAt(t: Track, bar: number): Section {
  let at = 0;
  for (const s of t.sections) {
    if (bar < at + s.bars) return s;
    at += s.bars;
  }
  return t.sections[t.sections.length - 1];
}
