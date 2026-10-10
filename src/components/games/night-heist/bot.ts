/* DEBUG (temporary): a test bot that proves each heist can be done without an alarm.
 *
 * The game is deterministic, so the bot can look into the future: it replays its own inputs, hides
 * the thief, records where every guard and camera will look, then plans a route through space and
 * time (A* over cell × time) that never steps where someone could see it. After a coin throw or a
 * knockout it re-records. */
import { CAM_HALF, DARK_SHARE, GUARD_HALF, GUARD_RANGE } from "./actors";
import type { NightHeistGame } from "./engine";
import { angleDiff } from "./grid";
import { LEVELS } from "./levels";

const DT = 1 / 30;
const TAU = 0.25;
const PLAN_SPEED = 1.3;

interface Input {
  x: number;
  z: number;
  use?: boolean;
  throwAt?: [number, number];
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
}

export interface BotReport {
  ok: boolean;
  why: string;
  time: number;
  loot: string;
  steps: string[];
}

export function runBot(game: NightHeistGame, index: number, opts: { plan?: string[]; horizon?: number; margin?: number } = {}): BotReport {
  const horizon = opts.horizon ?? 150;
  const margin = opts.margin ?? 0.75;
  const log: Input[] = [];
  const notes: string[] = [];
  const dbg = () => game.debug;

  const step = (inp: Input) => {
    game.botInput = { x: inp.x, z: inp.z, sneak: true, run: false };
    if (inp.use) game.debugUse();
    if (inp.throwAt) game.debugThrow(inp.throwAt[0], inp.throwAt[1]);
    game.step(DT);
  };
  const replay = () => {
    game.start(index);
    for (const inp of log) step(inp);
  };
  const push = (inp: Input) => {
    log.push(inp);
    step(inp);
  };
  const now = () => game.debugState().time;
  const st = () => game.debugState();

  /** Future guard poses and camera yaws, sampled every TAU, with the thief out of the way. */
  const record = () => {
    replay();
    const t = dbg().thief;
    const saved = { x: t.x, z: t.z };
    t.x = -60;
    t.z = -60;
    const guards: Pose[][] = dbg().guards.map(() => []);
    const cams: number[][] = dbg().cams.map(() => []);
    const per = Math.round(TAU / DT);
    const n = Math.round(horizon / TAU);
    for (let k = 0; k <= n; k++) {
      dbg().guards.forEach((g, i) => guards[i].push({ x: g.x, z: g.z, yaw: g.yaw, alive: g.alive }));
      dbg().cams.forEach((c, i) => cams[i].push(c.disabled ? NaN : c.yaw));
      for (let s = 0; s < per; s++) {
        game.botInput = { x: 0, z: 0, sneak: true, run: false };
        game.step(DT);
        t.x = -60;
        t.z = -60;
      }
    }
    void saved;
    replay();
    return { guards, cams, t0: now() };
  };

  type Rec = ReturnType<typeof record>;

  const plan = (rec: Rec, gx: number, gz: number, hold: number, startK = 0): { x: number; z: number; k: number }[] | null => {
    const level = dbg().level!;
    const grid = level.grid;
    const view = dbg().view!;
    const W = grid.w;
    const n = rec.guards[0]?.length ?? Math.round(horizon / TAU);
    const memo = new Map<number, boolean>();
    const cell = (x: number, z: number) => z * W + x;
    const unsafe = (x: number, z: number, k: number): boolean => {
      if (k >= n) return true;
      const key = cell(x, z) * 4096 + k;
      const m = memo.get(key);
      if (m !== undefined) return m;
      let bad = false;
      const light = grid.lightAt(x, z);
      for (let kk = Math.max(0, k - 1); kk <= Math.min(n - 1, k + 1) && !bad; kk++) {
        for (const poses of rec.guards) {
          const g = poses[kk];
          if (!g || !g.alive) continue;
          const d = Math.hypot(g.x - x, g.z - z);
          if (d < 1.5) {
            bad = true;
            break;
          }
          const reach = GUARD_RANGE * (DARK_SHARE + (1 - DARK_SHARE) * light) + margin;
          if (d > reach) continue;
          if (Math.abs(angleDiff(g.yaw, Math.atan2(x - g.x, z - g.z))) > GUARD_HALF + 0.3) continue;
          if (grid.los(g.x, g.z, x, z)) {
            bad = true;
            break;
          }
        }
        dbg().cams.forEach((c, i) => {
          if (bad) return;
          const yaw = rec.cams[i][kk];
          if (Number.isNaN(yaw)) return;
          const d = Math.hypot(c.x - x, c.z - z);
          if (d > c.range * (0.62 + 0.38 * light) + margin) return;
          if (Math.abs(angleDiff(yaw, Math.atan2(x - c.x, z - c.z))) > CAM_HALF + 0.28) return;
          if (grid.los(c.x, c.z, x, z)) bad = true;
        });
      }
      if (!bad) {
        const time = rec.t0 + k * TAU;
        for (const laser of view.lasers) {
          if (!laser.cells.some((c) => Math.abs(c.x - x) < 0.6 && Math.abs(c.z - z) < 0.6)) continue;
          const { on, off, phase = 0 } = laser.def;
          const period = on + off;
          for (let s = -0.45; s <= TAU + 0.45; s += 0.05) {
            const kk = (((time + s + phase * period) % period) + period) % period;
            if (kk < on) {
              bad = true;
              break;
            }
          }
        }
      }
      memo.set(key, bad);
      return bad;
    };
    const t = dbg().thief;
    const sx = Math.round(t.x);
    const sz = Math.round(t.z);
    const hFn = (x: number, z: number) => {
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) / PLAN_SPEED / TAU;
    };
    // A* over (cell, k).
    const open: { x: number; z: number; k: number; f: number }[] = [];
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
    pushOpen(sx, sz, startK);
    seen.add(id(sx, sz, startK));
    let goal = -1;
    let iters = 0;
    while (open.length && iters++ < 400000) {
      const cur = popOpen();
      if (cur.x === gx && cur.z === gz) {
        let ok = true;
        for (let h = 0; h <= hold; h++) if (unsafe(cur.x, cur.z, cur.k + h)) ok = false;
        if (ok) {
          goal = id(cur.x, cur.z, cur.k);
          break;
        }
      }
      // Wait.
      const moves: [number, number, number][] = [[0, 0, 1]];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cur.x + dx;
          const nz = cur.z + dz;
          if (!grid.walkable(nx, nz, true)) continue;
          if (dx && dz && (!grid.walkable(cur.x + dx, cur.z, true) || !grid.walkable(cur.x, cur.z + dz, true))) continue;
          moves.push([dx, dz, Math.ceil((dx && dz ? Math.SQRT2 : 1) / PLAN_SPEED / TAU)]);
        }
      for (const [dx, dz, dur] of moves) {
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        const nk = cur.k + dur;
        if (nk >= n) continue;
        let ok = true;
        for (let s = 0; s <= dur && ok; s++) if (unsafe(cur.x, cur.z, cur.k + s) || unsafe(nx, nz, cur.k + s)) ok = false;
        if (!ok) continue;
        const nid = id(nx, nz, nk);
        if (seen.has(nid)) continue;
        seen.add(nid);
        from.set(nid, id(cur.x, cur.z, cur.k));
        pushOpen(nx, nz, nk);
      }
    }
    if (goal < 0) return null;
    const out: { x: number; z: number; k: number }[] = [];
    for (let i: number | undefined = goal; i !== undefined; i = from.get(i)) {
      const k = i % 4096;
      const c = (i - k) / 4096;
      out.push({ x: c % W, z: Math.floor(c / W), k });
    }
    return out.reverse();
  };

  /** Walk a planned route, leaving each cell at its planned time. */
  const follow = (rec: Rec, route: { x: number; z: number; k: number }[]) => {
    const t = dbg().thief;
    for (let i = 1; i < route.length; i++) {
      const prev = route[i - 1];
      const cur = route[i];
      if (cur.x === prev.x && cur.z === prev.z) continue;
      const leave = rec.t0 + prev.k * TAU;
      for (let guard = 0; guard < 4000 && now() < leave - 1e-6 && st().stage === "play"; guard++) push({ x: 0, z: 0 });
      for (let guard = 0; guard < 300 && st().stage === "play"; guard++) {
        const dx = cur.x - t.x;
        const dz = cur.z - t.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) break;
        push({ x: dx / d, z: dz / d });
      }
    }
    for (let i = 0; i < 6; i++) push({ x: 0, z: 0 });
  };

  const goTo = (x: number, z: number, hold = 2, label = "") => {
    const rec = record();
    const route = plan(rec, x, z, hold);
    if (!route) {
      notes.push(`no safe route to ${x},${z} ${label} at t=${now().toFixed(1)}`);
      return false;
    }
    follow(rec, route);
    return true;
  };

  const press = () => {
    push({ x: 0, z: 0, use: true });
    for (let i = 0; i < 24; i++) push({ x: 0, z: 0 });
  };

  /** Free cells next to a solid thing, nearest first. */
  const beside = (x: number, z: number) => {
    const grid = dbg().level!.grid;
    const t = dbg().thief;
    const out: { x: number; z: number; d: number }[] = [];
    for (const [dx, dz] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      if (grid.walkable(x + dx, z + dz, true)) out.push({ x: x + dx, z: z + dz, d: Math.hypot(x + dx - t.x, z + dz - t.z) + (dx && dz ? 0.3 : 0) });
    return out.sort((a, b) => a.d - b.d);
  };

  const grab = (x: number, z: number, label: string) => {
    for (const b of beside(x, z)) {
      if (goTo(b.x, b.z, 5, label)) {
        press();
        return true;
      }
    }
    return false;
  };

  const lootAll = () => {
    const view = dbg().view!;
    const tried = new Set<string>();
    for (;;) {
      const t = dbg().thief;
      const left = [
        ...view.keys.filter((k) => !k.taken).map((k) => ({ x: k.x, z: k.z, plinth: false })),
        ...view.loot.filter((l) => !l.taken).map((l) => ({ x: l.x, z: l.z, plinth: l.plinth })),
      ].filter((o) => !tried.has(`${o.x},${o.z}`));
      if (!left.length) return;
      left.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
      const o = left[0];
      tried.add(`${o.x},${o.z}`);
      if (o.plinth) grab(o.x, o.z, "loot");
      else goTo(o.x, o.z, 1, "pickup");
      if (st().alarmEver || st().stage !== "play") return;
    }
  };

  const script = opts.plan ?? LEVELS[index].solution ?? ["auto"];
  game.start(index);
  const level = dbg().level!;
  for (const cmd of script) {
    if (st().alarmEver || st().stage !== "play") break;
    const [op, a, b] = cmd.split(" ");
    const x = Number(a);
    const z = Number(b);
    const before = now();
    if (op === "auto" || op === "loot") lootAll();
    if (op === "auto" || op === "target") grab(level.target.x, level.target.z, "target");
    if (op === "auto") lootAll();
    if (op === "auto" || op === "exit") {
      goTo(level.exit.inside.x, level.exit.inside.z, 1, "exit");
      const ex = level.exit;
      for (let i = 0; i < 70 && st().phase === "playing"; i++) push({ x: Math.sin(ex.yaw + Math.PI), z: Math.cos(ex.yaw + Math.PI) });
    }
    if (op === "to") goTo(x, z, 1, cmd);
    if (op === "grab") grab(x, z, cmd);
    if (op === "use") press();
    if (op === "wait") for (let i = 0; i < x / DT; i++) push({ x: 0, z: 0 });
    if (op === "throw") {
      push({ x: 0, z: 0, throwAt: [x, z] });
      for (let i = 0; i < 10; i++) push({ x: 0, z: 0 });
    }
    notes.push(`${cmd}: ${before.toFixed(1)}→${now().toFixed(1)}s alarm=${st().alarmEver}`);
  }
  for (let i = 0; i < 90 && st().phase === "playing"; i++) push({ x: 0, z: 0 });
  game.botInput = null;
  const s = st();
  const escaped = s.phase === "result" && s.stage === "escape";
  return {
    ok: escaped && !s.alarmEver,
    why: s.alarmEver ? "alarm" : s.stage === "caught" ? "caught" : escaped ? "escaped" : "stuck",
    time: Math.round(s.time),
    loot: `${s.loot}/${s.lootTotal}`,
    steps: notes,
  };
}
