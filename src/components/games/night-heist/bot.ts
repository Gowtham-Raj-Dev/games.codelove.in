/**
 * The solver: proves a heist can be pulled off without an alarm and with every valuable taken.
 *
 * A heist is deterministic (sim.ts), so the solver can look into the future: it replays its own
 * inputs on a copy, takes the thief out of the picture, records where every guard, dog, camera and
 * drone will look, then plans a route through space and time (A* over cell × time) that never steps
 * where anything could notice it. After each leg it records again. It only ever sneaks, never throws
 * a coin or uses a gadget unless a heist's `solution` script says so — so a heist it solves can be
 * solved with the starting thief and no upgrades.
 *
 * The check script (scripts/check-night-heist.mjs) runs it for all forty heists and then plays the
 * inputs it found in the real game.
 */
import { angleDiff } from "./grid";
import { laserOffset, laserState, type LevelDef } from "./levels";
import { CRACK_TIME, HeistSim, NOISE, type LaserSim, type SimInput } from "./sim";
import { CAM_DARK, CAM_HALF } from "./watchers";

export const BOT_DT = 1 / 30;
/** The planner's time step: a whole number of game steps, so its clock and the game's never drift apart. */
const PER = 8;
const TAU = PER * BOT_DT;
const PLAN_SPEED = 1.3;
/** A hop straight through a laser gate: steps it takes, and the seconds (from setting off) the beams must be dark. */
const HOP = { steps: 7, from: 0.25, to: 1.35 };
/** Where a thief standing "in a cell" may really be: its centre and a little to each side. */
const SPOTS: [number, number][] = [
  [0, 0],
  [0.34, 0],
  [-0.34, 0],
  [0, 0.34],
  [0, -0.34],
  [0.3, 0.3],
  [-0.3, 0.3],
  [0.3, -0.3],
  [-0.3, -0.3],
];

/** One step of input, as the solver logs it (it always sneaks). */
export interface BotInput {
  x: number;
  z: number;
  use?: boolean;
  throwAt?: [number, number];
}

export const toSimInput = (inp: BotInput): SimInput => ({ x: inp.x, z: inp.z, sneak: true, run: false, use: inp.use, throwAt: inp.throwAt ?? null });

interface Pose {
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
}

export interface BotReport {
  /** Escaped with no alarm and all the loot (three stars). */
  ok: boolean;
  escaped: boolean;
  stars: number;
  why: string;
  time: number;
  loot: string;
  /** Seconds from lifting the target to walking out (what a vault timer has to allow for). */
  getaway: number;
  /** How much room the route kept from every cone (bigger = an easier heist). */
  margin: number;
  steps: string[];
  /** The inputs that did it, one per 1/30 s. */
  inputs: BotInput[];
}

export interface BotOptions {
  plan?: string[];
  horizon?: number;
  margin?: number;
  /** Add a picture of what blocked a route to the notes. */
  diag?: boolean;
  /** With `diag`: cells to show the watched-or-not timeline of. */
  cells?: { x: number; z: number }[];
}

function attempt(def: LevelDef, index: number, opts: BotOptions): BotReport {
  const horizon = opts.horizon ?? 150;
  const margin = opts.margin ?? 0.75;
  const log: BotInput[] = [];
  const notes: string[] = [];
  const sim = new HeistSim(def, index);
  const level = sim.level;
  const grid = level.grid;
  const W = grid.w;

  // Laser gates that stand still, by cell; the sweeping ones are checked by where they are.
  const gates = new Map<number, LaserSim[]>();
  const sweeping: LaserSim[] = [];
  for (const l of sim.lasers) {
    if (l.def.move) sweeping.push(l);
    else
      for (const c of l.cells) {
        const i = grid.idx(c.x, c.z);
        gates.set(i, [...(gates.get(i) ?? []), l]);
      }
  }

  let glimpses = 0;
  let diagLeft = 1;
  let liftedAt = -1;
  const push = (inp: BotInput) => {
    log.push(inp);
    sim.step(BOT_DT, toSimInput(inp));
    if (liftedAt < 0 && sim.hasGem) liftedAt = sim.time;
    // The plan should never let anyone catch even a glimpse: note the first few times it happens.
    if (glimpses < 4 && sim.stage === "play") {
      const t = sim.thief;
      const at = `t=${sim.time.toFixed(2)} thief ${t.x.toFixed(2)},${t.z.toFixed(2)}`;
      sim.guards.forEach((g, i) => {
        if (g.sees && glimpses++ < 4) notes.push(`glimpsed by guard ${i} (${g.kind}, ${g.state}) at ${g.x.toFixed(2)},${g.z.toFixed(2)} yaw ${g.yaw.toFixed(2)} · ${at} light ${grid.lightAt(t.x, t.z).toFixed(2)}`);
      });
      sim.cams.forEach((c, i) => {
        if (c.sees && glimpses++ < 4) notes.push(`glimpsed by camera ${i} yaw ${c.yaw.toFixed(2)} · ${at}`);
      });
      sim.drones.forEach((d, i) => {
        if (d.sees && glimpses++ < 4) notes.push(`glimpsed by drone ${i} at ${d.x.toFixed(2)},${d.z.toFixed(2)} · ${at}`);
      });
    }
  };
  const idle = (frames: number) => {
    for (let i = 0; i < frames && sim.stage === "play"; i++) push({ x: 0, z: 0 });
  };
  const live = () => sim.stage === "play" && !sim.alarmEver;

  /** Future guard poses, camera yaws and drone spots, sampled every TAU, with the thief out of the way. */
  const record = () => {
    const f = new HeistSim(def, index);
    for (const inp of log) f.step(BOT_DT, toSimInput(inp));
    const t0 = f.time;
    const guards: Pose[][] = f.guards.map(() => []);
    const cams: number[][] = f.cams.map(() => []);
    const drones: { x: number; z: number; off: boolean }[][] = f.drones.map(() => []);
    const per = PER;
    const n = Math.round(horizon / TAU);
    const away = { x: 0, z: 0, sneak: true, run: false };
    for (let k = 0; k <= n; k++) {
      f.guards.forEach((g, i) => guards[i].push({ x: g.x, z: g.z, yaw: g.yaw, alive: g.alive }));
      f.cams.forEach((c, i) => cams[i].push(c.off ? NaN : c.yaw));
      f.drones.forEach((d, i) => drones[i].push({ x: d.x, z: d.z, off: d.off }));
      for (let s = 0; s < per; s++) {
        f.thief.x = -60;
        f.thief.z = -60;
        f.thief.vx = f.thief.vz = 0;
        f.step(BOT_DT, away);
      }
    }
    // How fast each guard is turning at each sample: a cone that swings round between two samples covers everything in between.
    const spin = guards.map((poses) => poses.map((p, k) => Math.min(Math.PI, Math.max(k > 0 ? Math.abs(angleDiff(poses[k - 1].yaw, p.yaw)) : 0, k + 1 < poses.length ? Math.abs(angleDiff(p.yaw, poses[k + 1].yaw)) : 0))));
    return { guards, spin, cams, drones, t0, n: n + 1, specs: f.guards.map((g) => g.spec), camDefs: f.cams.map((c) => ({ x: c.x, z: c.z, range: c.range })), droneR: f.drones.map((d) => d.radius) };
  };

  type Rec = ReturnType<typeof record>;
  type Node = { x: number; z: number; k: number };

  /** Cells the thief could walk to if nobody was watching. */
  const reachable = () => {
    const seen = new Uint8Array(grid.w * grid.h);
    const sx = Math.round(sim.thief.x);
    const sz = Math.round(sim.thief.z);
    if (!grid.walkable(sx, sz, true)) return seen;
    const queue = [sx, sz];
    seen[grid.idx(sx, sz)] = 1;
    while (queue.length) {
      const z = queue.pop()!;
      const x = queue.pop()!;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (!grid.walkable(nx, nz, true) || seen[grid.idx(nx, nz)]) continue;
        seen[grid.idx(nx, nz)] = 1;
        queue.push(nx, nz);
      }
    }
    return seen;
  };

  /** `last`: the thief leaves the building from the goal, so it need not be a place he can get away from. */
  const plan = (rec: Rec, goals: { x: number; z: number }[], hold: number, label: string, last = false): Node[] | null => {
    const n = rec.n;
    // Per (cell, step): 0 not worked out yet, 1 clear, 2 watched.
    const memo = new Uint8Array(W * grid.h * n);
    const cell = (x: number, z: number) => z * W + x;
    const seenFrom = (ox: number, oz: number, x: number, z: number) => {
      for (const [sx, sz] of SPOTS) if (grid.los(ox, oz, x + sx, z + sz)) return true;
      return false;
    };
    /** Could a guard, dog, camera, drone or sweeping laser catch the thief in this cell around step k? */
    const watched = (x: number, z: number, k: number): boolean => {
      if (k >= n) return true;
      const key = cell(x, z) * n + k;
      if (memo[key]) return memo[key] === 2;
      let bad = false;
      const light = grid.lightAt(x, z);
      const noisy = grid.noisy[grid.idx(x, z)] === 1;
      for (let kk = Math.max(0, k - 1); kk <= Math.min(n - 1, k + 1) && !bad; kk++) {
        for (let gi = 0; gi < rec.guards.length && !bad; gi++) {
          const g = rec.guards[gi][kk];
          if (!g || !g.alive) continue;
          const spec = rec.specs[gi];
          const d = Math.hypot(g.x - x, g.z - z);
          if (d < 1.5) {
            bad = true;
            break;
          }
          // A creaky board: nobody may be in earshot.
          if (noisy && d * (grid.los(g.x, g.z, x, z) ? 1 : 1.6) <= NOISE.creak.sneak + 0.7) {
            bad = true;
            break;
          }
          const reach = spec.range * (spec.dark + (1 - spec.dark) * light) + margin;
          if (d > reach) continue;
          if (Math.abs(angleDiff(g.yaw, Math.atan2(x - g.x, z - g.z))) > spec.half + 0.3 + rec.spin[gi][kk] * 0.5) continue;
          if (seenFrom(g.x, g.z, x, z)) bad = true;
        }
        for (let ci = 0; ci < rec.cams.length && !bad; ci++) {
          const yaw = rec.cams[ci][kk];
          if (Number.isNaN(yaw)) continue;
          const c = rec.camDefs[ci];
          const d = Math.hypot(c.x - x, c.z - z);
          if (d > c.range * (CAM_DARK + (1 - CAM_DARK) * light) + margin) continue;
          if (Math.abs(angleDiff(yaw, Math.atan2(x - c.x, z - c.z))) > CAM_HALF + 0.28) continue;
          if (seenFrom(c.x, c.z, x, z)) bad = true;
        }
        for (let di = 0; di < rec.drones.length && !bad; di++) {
          const d = rec.drones[di][kk];
          if (d.off) continue;
          if (Math.hypot(d.x - x, d.z - z) < rec.droneR[di] + Math.max(0.6, margin)) bad = true;
        }
      }
      if (!bad && sweeping.length) {
        const time = rec.t0 + k * TAU;
        for (const laser of sweeping) {
          const ax = laser.axis === "x" ? 0.88 : 0.72;
          const az = laser.axis === "x" ? 0.72 : 0.88;
          for (let s = -0.4; s <= TAU + 0.4 && !bad; s += 0.05) {
            if (!laserState(laser.def, time + s).active) continue;
            const off = laserOffset(laser.def, time + s);
            for (const c of laser.cells) {
              if (Math.abs(c.x + off.x - x) < ax && Math.abs(c.z + off.z - z) < az) {
                bad = true;
                break;
              }
            }
          }
          if (bad) break;
        }
      }
      memo[key] = bad ? 2 : 1;
      return bad;
    };
    /** Is a laser gate in this cell live between `from` and `to` seconds after step k? */
    const beam = (x: number, z: number, k: number, from = -0.45, to = TAU + 0.45): boolean => {
      const list = gates.get(grid.idx(x, z));
      if (!list) return false;
      const time = rec.t0 + k * TAU;
      for (const laser of list) for (let s = from; s <= to; s += 0.05) if (laserState(laser.def, time + s).active) return true;
      return false;
    };
    const unsafe = (x: number, z: number, k: number) => watched(x, z, k) || beam(x, z, k);

    const t = sim.thief;
    const sx = Math.round(t.x);
    const sz = Math.round(t.z);
    const isGoal = (x: number, z: number) => goals.some((g) => g.x === x && g.z === z);
    const hFn = (x: number, z: number) => {
      let best = Infinity;
      for (const g of goals) {
        const dx = Math.abs(x - g.x);
        const dz = Math.abs(z - g.z);
        best = Math.min(best, dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz));
      }
      return best / PLAN_SPEED / TAU;
    };
    // A* over (cell, k).
    const open: (Node & { f: number })[] = [];
    const popOpen = () => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && open[l].f < open[m].f) m = l;
          if (r < open.length && open[r].f < open[m].f) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const from = new Map<number, number>();
    const seen = new Set<number>();
    const id = (x: number, z: number, k: number) => cell(x, z) * 4096 + k;
    const pushOpen = (x: number, z: number, k: number) => {
      const f = k + hFn(x, z) * 1.001;
      open.push({ x, z, k, f });
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p].f <= open[i].f) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    /** Every state one move away: wait, step to a neighbour, or hop through a dark laser gate. */
    const successors = (cx: number, cz: number, ck: number): Node[] => {
      const out: Node[] = [];
      if (ck + 1 < n && !unsafe(cx, cz, ck) && !unsafe(cx, cz, ck + 1)) out.push({ x: cx, z: cz, k: ck + 1 });
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!grid.walkable(nx, nz, true)) continue;
          if (dx && dz && (!grid.walkable(cx + dx, cz, true) || !grid.walkable(cx, cz + dz, true))) continue;
          const dur = Math.ceil((dx && dz ? Math.SQRT2 : 1) / PLAN_SPEED / TAU);
          if (ck + dur >= n) continue;
          let ok = true;
          for (let s = 0; s <= dur && ok; s++) if (unsafe(cx, cz, ck + s) || unsafe(nx, nz, ck + s)) ok = false;
          if (ok) out.push({ x: nx, z: nz, k: ck + dur });
        }
      // A hop straight through a laser gate while its beams are dark — only across the beams, never along them.
      if (gates.size)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const lx = cx + dx;
          const lz = cz + dz;
          const list = gates.get(grid.idx(lx, lz));
          if (!list || !grid.walkable(lx, lz, true)) continue;
          if (list.some((l) => (l.axis === "x") !== (dz !== 0))) continue;
          const bx = lx + dx;
          const bz = lz + dz;
          if (!grid.walkable(bx, bz, true) || ck + HOP.steps >= n) continue;
          if (beam(lx, lz, ck, HOP.from, HOP.to)) continue;
          let ok = true;
          for (let s = 0; s <= HOP.steps && ok; s++) {
            if (watched(cx, cz, ck + s) || watched(lx, lz, ck + s) || watched(bx, bz, ck + s)) ok = false;
            else if (s <= 2 && beam(cx, cz, ck + s)) ok = false;
            else if (s >= 4 && beam(bx, bz, ck + s)) ok = false;
          }
          if (ok) out.push({ x: bx, z: bz, k: ck + HOP.steps });
        }
      return out;
    };

    // A spot is only worth going to if the thief can get away from it again: a dead end that a cone
    // is about to sweep is a trap. "Fine" = from here some chain of moves stays unseen to the end of
    // what was recorded (or reaches a cell nobody ever looks at).
    const haven = new Int8Array(W * grid.h);
    const isHaven = (x: number, z: number) => {
      const c = cell(x, z);
      if (!haven[c]) {
        let ok = true;
        for (let k = 0; k < n && ok; k++) if (unsafe(x, z, k)) ok = false;
        haven[c] = ok ? 1 : -1;
      }
      return haven[c] === 1;
    };
    const fineMemo = new Uint8Array(W * grid.h * n);
    const fine = (x: number, z: number, k: number): boolean => {
      if (k >= n - 12) return true;
      const key = cell(x, z) * n + k;
      if (fineMemo[key]) return fineMemo[key] === 1;
      let ok = isHaven(x, z);
      if (!ok) {
        fineMemo[key] = 2;
        for (const s of successors(x, z, k)) {
          if (fine(s.x, s.z, s.k)) {
            ok = true;
            break;
          }
        }
      }
      fineMemo[key] = ok ? 1 : 2;
      return ok;
    };

    pushOpen(sx, sz, 0);
    seen.add(id(sx, sz, 0));
    let goal = -1;
    let iters = 0;
    while (open.length && iters++ < 300000) {
      const cur = popOpen();
      if (isGoal(cur.x, cur.z)) {
        // Clear for as long as the thief stands there (and a moment more, unless he walks out of the building).
        const stay = last ? hold : hold + 2;
        let ok = true;
        for (let h = 0; h <= stay; h++) if (unsafe(cur.x, cur.z, cur.k + h)) ok = false;
        // (Too near the end of what was recorded, "can he get away afterwards" cannot be answered: not a goal.)
        if (ok && (last || (cur.k + stay < n - 60 && fine(cur.x, cur.z, cur.k + stay)))) {
          goal = id(cur.x, cur.z, cur.k);
          break;
        }
      }
      for (const s of successors(cur.x, cur.z, cur.k)) {
        const nid = id(s.x, s.z, s.k);
        if (seen.has(nid)) continue;
        seen.add(nid);
        from.set(nid, id(cur.x, cur.z, cur.k));
        pushOpen(s.x, s.z, s.k);
      }
    }
    if (goal < 0) {
      notes.push(`no safe route to ${label} at t=${sim.time.toFixed(1)}`);
      if (opts.diag && diagLeft-- > 0) {
        // How often each cell is watched (0 never … 9 always), and which cells the search got to (*).
        const got = new Map<number, number>();
        for (const s of seen) {
          const c = Math.floor(s / 4096);
          got.set(c, Math.min(got.get(c) ?? Infinity, s % 4096));
        }
        for (let z = 0; z < grid.h; z++) {
          let row = "";
          let reach = "";
          for (let x = 0; x < grid.w; x++) {
            if (!grid.walkable(x, z, true)) {
              const c = def.map[z][x] ?? " ";
              row += c === "." ? "p" : c;
              reach += c === "." ? "p" : c;
              continue;
            }
            let u = 0;
            for (let k = 0; k < n; k += 4) if (unsafe(x, z, k)) u++;
            row += String(Math.min(9, Math.floor((u / Math.ceil(n / 4)) * 10)));
            // The right-hand map: when the search first got to each cell, in tenths of the time it can look ahead.
            reach += x === sx && z === sz ? "@" : isGoal(x, z) ? "!" : got.has(cell(x, z)) ? String(Math.min(9, Math.floor((got.get(cell(x, z))! / n) * 10))) : ".";
          }
          notes.push(`  ${row}   ${reach}`);
        }
        // Where each guard will be, every five seconds or so.
        rec.guards.forEach((poses, gi) => notes.push(`  guard ${gi}: ${poses.filter((_, k) => k % 20 === 0).slice(0, 16).map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(" ")}`));
        // When the cells the search got stuck at (and their neighbours) are watched: one character per quarter second.
        const stuck = [...got.keys()].map((c) => ({ x: c % W, z: Math.floor(c / W) }));
        const edge = new Map<number, { x: number; z: number }>();
        for (const c of stuck)
          for (const [dx, dz] of [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const x = c.x + dx;
            const z = c.z + dz;
            if (grid.walkable(x, z, true)) edge.set(cell(x, z), { x, z });
          }
        for (const c of [...goals, ...(opts.cells ?? []), ...[...edge.values()].slice(0, opts.cells ? 0 : 6)]) {
          let line = "";
          for (let k = 0; k < Math.min(n, 240); k++) line += watched(c.x, c.z, k) ? "#" : beam(c.x, c.z, k) ? "=" : fine(c.x, c.z, k) ? "." : "x";
          notes.push(`  ${String(c.x).padStart(2)},${String(c.z).padStart(2)}${got.has(cell(c.x, c.z)) ? "*" : " "} ${line}`);
          if (opts.cells) notes.push(`     walkable ${grid.walkable(c.x, c.z, true)} first reached at step ${got.get(cell(c.x, c.z)) ?? "never"}; states seen ${seen.size}, iterations ${iters}`);
        }
      }
      return null;
    }
    const out: Node[] = [];
    for (let i: number | undefined = goal; i !== undefined; i = from.get(i)) {
      const k = i % 4096;
      const c = (i - k) / 4096;
      out.push({ x: c % W, z: Math.floor(c / W), k });
    }
    out.reverse();
    const end = out[out.length - 1];
    notes.push(`route to ${label}: from ${sx},${sz} at t=${rec.t0.toFixed(2)}, there (${end.x},${end.z}) by t=${(rec.t0 + end.k * TAU).toFixed(2)}`);
    return out;
  };

  /** Walk a planned route, leaving each cell at its planned time. */
  const follow = (rec: Rec, route: Node[]) => {
    const t = sim.thief;
    for (let i = 1; i < route.length; i++) {
      const prev = route[i - 1];
      const cur = route[i];
      if (cur.x === prev.x && cur.z === prev.z) continue;
      const leave = rec.t0 + prev.k * TAU;
      for (let guard = 0; guard < 6000 && sim.time < leave - 1e-6 && sim.stage === "play"; guard++) push({ x: 0, z: 0 });
      for (let guard = 0; guard < 300 && sim.stage === "play"; guard++) {
        const dx = cur.x - t.x;
        const dz = cur.z - t.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) break;
        push({ x: dx / d, z: dz / d });
      }
    }
    idle(6);
  };

  /** Sneak to the nearest of some cells (in time, not distance). Returns the cell reached. */
  const goTo = (cells: { x: number; z: number }[], hold: number, label: string, last = false) => {
    if (!live()) return null;
    const ok = reachable();
    const goals = cells.filter((c) => grid.walkable(c.x, c.z, true) && ok[grid.idx(c.x, c.z)]);
    if (!goals.length) return null;
    // Plans start on the planner's own clock ticks: every recording then samples the same moments, so
    // a way out that one plan counted on is still there for the next.
    while (log.length % PER !== 0 && sim.stage === "play") push({ x: 0, z: 0 });
    if (!live()) return null;
    const rec = record();
    const route = plan(rec, goals, hold, label, last);
    if (!route) return null;
    follow(rec, route);
    return live() ? route[route.length - 1] : null;
  };

  /** Press "use" and wait until the thief is free again. */
  const press = () => {
    push({ x: 0, z: 0, use: true });
    for (let i = 0; i < 240 && sim.busy && sim.stage === "play"; i++) push({ x: 0, z: 0 });
    idle(8);
  };

  /** Free cells next to a solid thing (diagonals only where they are in reach). */
  const beside = (x: number, z: number, diagonal: boolean) => {
    const around: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    if (diagonal) around.push([1, 1], [-1, 1], [1, -1], [-1, -1]);
    return around.map(([dx, dz]) => ({ x: x + dx, z: z + dz }));
  };

  /** Go next to something and use it. `reach`: how close "use" needs the thief to be. */
  const grab = (x: number, z: number, label: string, reach: number, hold = 6) => {
    if (!goTo(beside(x, z, reach > 1.42), hold, `${label} ${x},${z}`)) return false;
    // From a diagonal cell, lean in until it is in reach.
    const t = sim.thief;
    for (let i = 0; i < 24 && Math.hypot(x - t.x, z - t.z) > reach - 0.12 && sim.stage === "play"; i++) {
      const d = Math.hypot(x - t.x, z - t.z);
      push({ x: (x - t.x) / d, z: (z - t.z) / d });
    }
    press();
    return live();
  };

  /** Everything that can be reached right now. Returns how many things were taken. */
  const lootAll = () => {
    const tried = new Set<string>();
    let taken = 0;
    for (;;) {
      if (!live()) return taken;
      const t = sim.thief;
      const left = [...sim.keys.filter((k) => !k.taken).map((k) => ({ x: k.x, z: k.z, plinth: false, safe: false })), ...sim.loot.filter((l) => !l.taken).map((l) => ({ x: l.x, z: l.z, plinth: l.plinth, safe: l.kind === "safe" }))].filter(
        (o) => !tried.has(`${o.x},${o.z}`),
      );
      if (!left.length) return taken;
      left.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
      const o = left[0];
      tried.add(`${o.x},${o.z}`);
      const before = sim.lootTaken + sim.keys.filter((k) => k.taken).length;
      if (o.plinth) grab(o.x, o.z, "loot", 1.45, o.safe ? Math.ceil((CRACK_TIME + 1) / TAU) : 6);
      else goTo([o], 1, `pickup ${o.x},${o.z}`);
      if (sim.lootTaken + sim.keys.filter((k) => k.taken).length > before) taken++;
    }
  };

  /** Open the nearest locked door there is a key card for. */
  const openDoor = () => {
    if (sim.keysHeld <= 0 || !live()) return false;
    const t = sim.thief;
    const shut = sim.doors.filter((d) => !d.opening).sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
    for (const d of shut) {
      if (!grab(d.x, d.z, "door", 1.35, 8)) continue;
      idle(40);
      return d.open >= 1;
    }
    return false;
  };

  /** Loot, then open doors with the key cards found, until nothing more can be done. */
  const sweep = () => {
    for (let pass = 0; pass < 12 && live(); pass++) {
      const took = lootAll();
      const opened = openDoor();
      if (!took && !opened) break;
    }
  };

  const target = () => !sim.hasGem && grab(level.target.x, level.target.z, "target", 1.55);

  const exit = () => {
    if (!sim.hasGem || !goTo([level.exit.inside], 0, "exit", true)) return;
    const ex = level.exit;
    for (let i = 0; i < 70 && sim.stage === "play"; i++) push({ x: Math.sin(ex.yaw + Math.PI), z: Math.cos(ex.yaw + Math.PI) });
  };

  const script = opts.plan ?? def.solution ?? ["auto"];
  for (const cmd of script) {
    if (!live()) break;
    const [op, a, b] = cmd.split(" ");
    const x = Number(a);
    const z = Number(b);
    const before = sim.time;
    if (op === "auto" || op === "loot") sweep();
    if (op === "auto" || op === "target") target();
    if (op === "auto") sweep();
    if (op === "auto" || op === "exit") exit();
    if (op === "to") goTo([{ x, z }], 1, cmd);
    if (op === "grab") grab(x, z, cmd, 1.45);
    if (op === "door") {
      grab(x, z, cmd, 1.35, 8);
      idle(40);
    }
    if (op === "console") for (const c of level.consoles) if (grab(c.x, c.z, cmd, 1.5)) break;
    if (op === "use") press();
    if (op === "wait") idle(Math.round(x / BOT_DT));
    if (op === "throw") {
      push({ x: 0, z: 0, throwAt: [x, z] });
      idle(10);
    }
    notes.push(`${cmd}: ${before.toFixed(1)}→${sim.time.toFixed(1)}s alarm=${sim.alarmEver}`);
  }
  if (sim.alarmEver) notes.push(`alarm (${sim.alarmReason}) at t=${sim.time.toFixed(1)} with the thief at ${sim.thief.x.toFixed(1)},${sim.thief.z.toFixed(1)}`);
  for (let i = 0; i < 90 && sim.stage !== "done"; i++) push({ x: 0, z: 0 });
  const r = sim.result;
  const escaped = !!r && r.escaped;
  return {
    ok: escaped && r!.stars === 3,
    escaped,
    stars: r?.stars ?? 0,
    why: sim.alarmEver ? `alarm (${sim.alarmReason})` : sim.stage === "caught" ? "caught" : escaped ? "escaped" : "stuck",
    time: Math.round(sim.time),
    loot: `${sim.lootTaken}/${sim.lootTotal}`,
    getaway: liftedAt < 0 ? 0 : Math.round(sim.time - liftedAt),
    margin,
    steps: notes,
    inputs: log,
  };
}

/** Solves a heist: the first try that earns three stars, else the best one found. */
export function solve(def: LevelDef, index: number, opts: BotOptions = {}): BotReport {
  const tries: BotOptions[] = opts.margin !== undefined ? [opts] : [{ ...opts, margin: 0.75 }, { ...opts, margin: 0.45 }];
  let best: BotReport | null = null;
  for (const t of tries) {
    const r = attempt(def, index, t);
    if (r.ok) return r;
    if (!best || r.stars > best.stars) best = r;
  }
  return best!;
}
