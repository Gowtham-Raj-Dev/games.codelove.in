import { degreeToMidi, parseBar, type Instrument, type Layer, type Song } from "../shared/music";
import { sectionAt, trackBars, type Focus, type Track } from "./songs";

/**
 * Turns a track's song data into a note chart, so every note sits exactly on a sound you hear:
 * the section's focus instrument (lead melody, bass line, chord stabs or drums) gives the main
 * notes, kicks and claps fill the holes, long melody notes become hold notes. Pitch decides the
 * lane (higher = further right) inside each four-bar phrase. Difficulty filters the grid (quarter /
 * eighth / sixteenth notes), the spacing, the hold length and adds two-note chords.
 */

export const DIFFICULTIES = ["Easy", "Normal", "Hard", "Expert"] as const;
export type Difficulty = 0 | 1 | 2 | 3;

export interface Note {
  id: number;
  lane: number;
  /** Seconds from the song's bar 0, step 0. */
  time: number;
  /** End of the hold (= time for a tap). */
  end: number;
  hold: boolean;
  /** Absolute step (bar * steps + step). */
  step: number;
}

export interface Chart {
  notes: Note[];
  /** Seconds per beat / bar. */
  beat: number;
  bar: number;
  /** Time of the last note's end. */
  last: number;
  /** End of the track (after the outro). */
  length: number;
}

interface Tuning {
  grid: number;
  minGap: number;
  holdMin: number;
  /** A fill (kick / clap) needs this many free steps on each side. */
  fillGap: number;
  /** Hats in drum sections. */
  hats: boolean;
  /** 0 none, 1 downbeats of loud sections, 2 also snares and mid-bar accents. */
  doubles: number;
  /** Notes during a hold are removed (else only the hold's own lane is kept free). */
  holdsBlock: boolean;
}

const TUNING: Tuning[] = [
  { grid: 4, minGap: 4, holdMin: 8, fillGap: 8, hats: false, doubles: 0, holdsBlock: true },
  { grid: 2, minGap: 2, holdMin: 6, fillGap: 4, hats: false, doubles: 0, holdsBlock: true },
  { grid: 1, minGap: 2, holdMin: 5, fillGap: 3, hats: true, doubles: 1, holdsBlock: false },
  { grid: 1, minGap: 1, holdMin: 4, fillGap: 2, hats: true, doubles: 2, holdsBlock: false },
];

/** First bar with notes — bar 0 is the count-in. */
const FIRST_BAR = 1;

// --- Song parsing: the music engine's own parser, so charts can never drift from the audio ------------

export function stepDuration(song: Song) {
  return ((60 / song.bpm) * (song.beats ?? 4)) / (song.steps ?? 16);
}

/** Seconds from bar 0 of an absolute step, swing included — the music engine's own formula. */
export function stepTime(song: Song, absStep: number) {
  const steps = song.steps ?? 16;
  const dur = stepDuration(song);
  const inBar = ((absStep % steps) + steps) % steps;
  return absStep * dur + (inBar % 2 === 1 ? (song.swing ?? 0) * dur : 0);
}

/** Layers the chart may use: playing at both intensity 1 and 2 (verse, chorus and fever). */
const charted = (l: Layer) => (l.from ?? 0) <= 1 && (l.to ?? 9) >= 2;

type Kind = "kick" | "snare" | "hat" | "mel" | "chord";

interface Cand {
  step: number;
  len: number;
  pitch: number;
  kind: Kind;
  primary: boolean;
  bar: number;
  loud: boolean;
}

const KIND: Partial<Record<Instrument, Kind>> = { kick: "kick", snare: "snare", clap: "snare", openhat: "hat", hat: "hat", tom: "kick", shaker: "hat" };

function layerHits(song: Song, layer: Layer, bar: number, kind: Kind, primary: boolean, loud: boolean): Cand[] {
  const steps = song.steps ?? 16;
  const pattern = layer.bars[bar % layer.bars.length];
  const chordRoot = song.chords[bar % song.chords.length];
  const octave = 12 * (layer.octave ?? (layer.inst === "bass" || layer.inst === "sub" ? -2 : 0));
  return parseBar(pattern, steps).map((h) => {
    let pitch = 0;
    if (layer.mode === "chord") pitch = degreeToMidi(song, chordRoot) + octave;
    else if (h.degree !== null) pitch = degreeToMidi(song, layer.mode === "rel" ? chordRoot + h.degree : h.degree) + h.semis + octave;
    return { step: bar * steps + h.step, len: h.len, pitch, kind, primary, bar, loud };
  });
}

// --- Chart --------------------------------------------------------------------------------------------

export function buildChart(track: Track, difficulty: Difficulty): Chart {
  const { song } = track;
  const tune = TUNING[difficulty];
  const steps = song.steps ?? 16;
  const beats = song.beats ?? 4;
  const bars = trackBars(track);
  const layers = song.layers.filter(charted);
  const firstOf = (insts: Instrument[]) => insts.map((i) => layers.find((l) => l.inst === i)).find(Boolean);
  const drums = layers.filter((l) => KIND[l.inst] && l.inst !== "tom");

  const primary: Cand[] = [];
  const fill: Cand[] = [];
  for (let bar = FIRST_BAR; bar < bars; bar++) {
    const section = sectionAt(track, bar);
    const focus: Focus = section.focus;
    if (focus === "none") continue;
    const loud = section.intensity >= 2;
    if (focus === "drums") {
      for (const l of drums) {
        const kind = KIND[l.inst]!;
        if (kind === "hat" && !tune.hats) continue;
        primary.push(...layerHits(song, l, bar, kind, true, loud));
      }
      continue;
    }
    const insts: Instrument[] = focus === "lead" ? ["lead"] : focus === "bass" ? ["bass", "sub"] : [track.keys as Instrument];
    const source = firstOf(insts);
    if (source) primary.push(...layerHits(song, source, bar, source.mode === "chord" ? "chord" : "mel", true, loud));
    for (const l of drums) {
      const kind = KIND[l.inst]!;
      if (kind !== "hat") fill.push(...layerHits(song, l, bar, kind, false, loud));
    }
  }

  // Snares win over kicks on the same step, then earlier first.
  const rank: Record<Kind, number> = { mel: 0, chord: 0, snare: 1, kick: 2, hat: 3 };
  const sortCands = (list: Cand[]) => list.sort((a, b) => a.step - b.step || rank[a.kind] - rank[b.kind]);

  // 1. Main notes on the difficulty's grid, at least minGap apart; long melody notes become holds.
  const picked: Cand[] = [];
  const holdSteps = new Map<Cand, number>();
  const holds: [number, number][] = [];
  const minHoldSteps = Math.ceil(0.3 / stepDuration(song));
  for (const c of sortCands(primary)) {
    if (c.step % tune.grid !== 0) continue;
    const prev = picked[picked.length - 1];
    if (prev && c.step - prev.step < tune.minGap) continue;
    picked.push(c);
    const len = Math.min(c.len - 1, 24);
    if (c.kind === "mel" && c.len >= tune.holdMin && len >= Math.max(2, minHoldSteps)) {
      holdSteps.set(c, len);
      holds.push([c.step, c.step + len]);
    }
  }

  // 2. Fills where the main part leaves a hole (never inside a blocking hold).
  const fillGap = (c: Cand) => (sectionAt(track, c.bar).focus === "keys" ? Math.min(tune.fillGap, 2) : tune.fillGap);
  const occupied = picked.map((c) => c.step);
  for (const c of sortCands(fill)) {
    if (c.step % Math.max(tune.grid, 2) !== 0) continue;
    if (occupied.some((s) => Math.abs(s - c.step) < fillGap(c))) continue;
    if (tune.holdsBlock && holds.some(([a, b]) => c.step >= a && c.step <= b + 1)) continue;
    picked.push(c);
    occupied.push(c.step);
  }
  sortCands(picked);

  // 3. Lanes.
  const lanes = assignLanes(picked, steps);

  // 4. Notes and chords. A held lane stays free until its hold ends.
  const notes: Note[] = [];
  const holdUntil = [-1, -1, -1, -1];
  let blockUntil = -1;
  let lastStep = -Infinity;
  picked.forEach((c, i) => {
    let lane = lanes[i];
    if (c.step < blockUntil) return;
    if (holdUntil[lane] >= c.step) {
      const free = [0, 1, 2, 3].filter((l) => holdUntil[l] < c.step).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane));
      if (!free.length) return;
      lane = free[0];
    }
    const holdLen = holdSteps.get(c) ?? 0;
    const endStep = c.step + holdLen;
    notes.push(note(song, lane, c.step, endStep));
    if (holdLen) {
      holdUntil[lane] = endStep;
      if (tune.holdsBlock) blockUntil = endStep + 1;
    }
    // Chords on accents: downbeats of loud sections, plus (Expert) snares, chord stabs and mid-bar hits.
    const inBar = c.step % steps;
    const accent = (inBar === 0 && (c.loud || tune.doubles >= 2)) || (tune.doubles >= 2 && (c.kind === "snare" || c.kind === "chord" || (c.loud && inBar === steps / 2)));
    if (tune.doubles > 0 && accent && c.step - lastStep >= 2) {
      const other = [(lane + 2) % 4, lane < 2 ? 3 : 0].find((l) => l !== lane && holdUntil[l] < c.step);
      if (other !== undefined) notes.push(note(song, other, c.step, c.step));
    }
    lastStep = c.step;
  });

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  notes.forEach((n, i) => (n.id = i));
  const barDur = stepDuration(song) * steps;
  return {
    notes,
    beat: barDur / beats,
    bar: barDur,
    last: notes.reduce((m, n) => Math.max(m, n.end), 0),
    length: bars * barDur,
  };
}

function note(song: Song, lane: number, step: number, endStep: number): Note {
  const time = stepTime(song, step);
  return { id: 0, lane, time, end: endStep > step ? stepTime(song, endStep) : time, hold: endStep > step, step };
}

/**
 * Melodic notes: rank the pitches of each four-bar phrase and spread them over the four lanes, so the
 * melody's shape is what you play. Drums: kicks on the left pair, snares on the right, hats in the
 * middle, alternating so the same key isn't hammered.
 */
function assignLanes(cands: Cand[], steps: number): number[] {
  const lanes = new Array<number>(cands.length).fill(0);
  const windows = new Map<number, number[]>();
  cands.forEach((c, i) => {
    if (c.kind !== "mel" && c.kind !== "chord") return;
    const w = Math.floor(c.bar / 4);
    if (!windows.has(w)) windows.set(w, []);
    windows.get(w)!.push(i);
  });
  for (const idx of windows.values()) {
    const pitches = [...new Set(idx.map((i) => cands[i].pitch))].sort((a, b) => a - b);
    const n = pitches.length;
    const span = pitches[n - 1] - pitches[0];
    for (const i of idx) {
      const r = pitches.indexOf(cands[i].pitch);
      if (n === 1) lanes[i] = 1 + (cands[i].bar % 2);
      else if (n === 2) lanes[i] = span >= 7 ? r * 3 : 1 + r;
      else if (n <= 4) lanes[i] = Math.round((r * 3) / (n - 1));
      else lanes[i] = Math.min(3, Math.floor((r * 4) / n));
    }
  }

  const counters = { kick: 0, snare: 0, hat: 0 };
  let prevLane = -1;
  let prevStep = -Infinity;
  let prevPitch = NaN;
  cands.forEach((c, i) => {
    if (c.kind === "kick" || c.kind === "snare" || c.kind === "hat") {
      const pair = c.kind === "kick" ? [0, 1] : c.kind === "snare" ? [3, 2] : [1, 2];
      let lane = pair[counters[c.kind]++ % 2];
      if (lane === prevLane && c.step - prevStep <= 2) lane = pair[counters[c.kind]++ % 2];
      lanes[i] = lane;
    } else if (lanes[i] === prevLane && c.pitch !== prevPitch && c.step - prevStep <= steps / 4) {
      // A new pitch right after another one: step towards the melody's direction.
      const dir = c.pitch > prevPitch ? 1 : -1;
      const next = lanes[i] + dir;
      lanes[i] = next >= 0 && next <= 3 ? next : lanes[i] - dir;
    }
    prevLane = lanes[i];
    prevStep = c.step;
    prevPitch = c.pitch;
  });
  return lanes;
}
