import * as THREE from "three";
import type { Ctx, Enemies } from "./enemies";
import { M } from "./manifest";
import { newFrame, rng } from "./rail";
import { BOX, TRENCH, type Drop, type StageEvent } from "./stages";

/**
 * Things on the rail that aren't enemies: shield rings, item drops, trench girders, laser gates
 * and the derelict towers turrets stand on. Most are checked when the player crosses their rail
 * distance, in rail-local coordinates.
 */

interface Ring {
  s: number;
  x: number;
  y: number;
  obj: THREE.Object3D | null;
  taken: boolean;
  t: number;
}

interface Pickup {
  kind: Drop;
  s: number;
  x: number;
  y: number;
  obj: THREE.Object3D | null;
  key: string;
  t: number;
  alive: boolean;
}

interface Rect {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

interface Prop {
  key: string;
  obj: THREE.Object3D;
  s: number;
}

interface Barrier {
  s: number;
  rects: Rect[];
  crossed: boolean;
}

interface GateBeam {
  vertical: boolean;
  /** Centre (x for vertical beams, y for horizontal). */
  at: number;
  /** Moving beams: amplitude and speed. */
  amp: number;
  speed: number;
  phase: number;
  /** Blinking beams: on/off period (0 = always on). */
  period: number;
  offset: number;
}

interface Gate {
  s: number;
  beams: GateBeam[];
  crossed: boolean;
}

const GOLD = new THREE.Color("#ffd166");
const CYAN = new THREE.Color("#22d3ee");
const RED = new THREE.Color("#ff2d55");
const MAGENTA = new THREE.Color("#ff4fd8");
const DIM_RED = new THREE.Color("#ff2d55").multiplyScalar(0.35);
const f = newFrame();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const BEAM_HALF = 0.55;

export class Hazards {
  private rings: Ring[] = [];
  private pickups: Pickup[] = [];
  private props: Prop[] = [];
  private barriers: Barrier[] = [];
  private gates: Gate[] = [];

  onRing: () => void = () => {};
  onPickup: (kind: Drop) => void = () => {};

  constructor(
    private readonly ctx: Ctx,
    private readonly enemies: Enemies,
  ) {}

  spawnEvent(ev: StageEvent) {
    switch (ev.kind) {
      case "ring":
        this.ring(ev.at, ev.x, ev.y);
        break;
      case "girder":
        this.girder(ev.at, ev.x, ev.y, ev.vertical);
        break;
      case "gate":
        this.gate(ev.at, ev.mode, ev.seed);
        break;
      case "tower":
        this.tower(ev.at, ev.x, ev.y, ev.turrets);
        break;
      default:
        break;
    }
  }

  ring(s: number, x: number, y: number) {
    const obj = this.ctx.protos.has(M.stardust) ? this.ctx.pool.get(M.stardust, this.ctx.root) : null;
    this.rings.push({ s, x: THREE.MathUtils.clamp(x, -BOX.x + 1, BOX.x - 1), y: THREE.MathUtils.clamp(y, -BOX.y + 1, BOX.y - 1), obj, taken: false, t: 0 });
  }

  drop(kind: Drop, s: number, x: number, y: number) {
    if (kind === "ring") {
      this.ring(s + 30, x, y);
      return;
    }
    const key = kind === "bomb" ? M.rocketTop : M.rifle;
    const obj = this.ctx.protos.has(key) ? this.ctx.pool.get(key, this.ctx.root) : null;
    this.pickups.push({ kind, s: s + 10, x: THREE.MathUtils.clamp(x, -BOX.x + 1.5, BOX.x - 1.5), y: THREE.MathUtils.clamp(y, -BOX.y + 1.5, BOX.y - 1.5), obj, key, t: 0, alive: true });
  }

  private prop(key: string, s: number, x: number, y: number, rot?: THREE.Quaternion, scale?: THREE.Vector3) {
    if (!this.ctx.protos.has(key)) return null;
    const obj = this.ctx.pool.get(key, this.ctx.root);
    this.ctx.rail.frame(s, f);
    obj.position.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
    obj.quaternion.copy(f.quat);
    if (rot) obj.quaternion.multiply(rot);
    if (scale) obj.scale.copy(scale);
    this.props.push({ key, obj, s });
    return obj;
  }

  private girder(s: number, x: number, y: number, vertical: boolean) {
    const W = TRENCH.halfWidth * 2 + 1;
    const H = TRENCH.wallTop - TRENCH.floor + 1;
    if (vertical) {
      // A pillar from the floor to the top of the walls (the proto is a unit cube).
      this.prop(M.structureClosed, s, x, TRENCH.floor - 0.5, undefined, tmpA.set(2.4, H, 2.4).clone());
      this.barriers.push({ s, rects: [{ x, y: 0, hw: 1.2 + 0.9, hh: 20 }], crossed: false });
    } else {
      this.prop(M.structureClosed, s, 0, y - 1.1, undefined, tmpA.set(W, 2.2, 2.4).clone());
      this.barriers.push({ s, rects: [{ x: 0, y, hw: 30, hh: 1.1 + 0.55 }], crossed: false });
    }
  }

  private gate(s: number, mode: "rows" | "cols" | "cross" | "blink", seed: number) {
    const r = rng(seed * 97);
    const beams: GateBeam[] = [];
    const H = TRENCH.wallTop - TRENCH.floor;
    // Two frames against the walls.
    for (const side of [-1, 1]) {
      this.prop(M.laserGate, s, side * (TRENCH.halfWidth - 1.6), TRENCH.floor, tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2).clone(), tmpA.set(H / 4.62, H / 4.62, H / 4.62).clone());
    }
    const rows = [-3.2, 0, 3.2];
    const cols = [-6, -2, 2, 6];
    if (mode === "rows") {
      for (const y of rows) beams.push({ vertical: false, at: y, amp: 1.6, speed: 1.2, phase: r.range(0, 6), period: 0, offset: 0 });
    } else if (mode === "cols") {
      for (const x of cols) beams.push({ vertical: true, at: x, amp: 1.8, speed: 1.1, phase: r.range(0, 6), period: 0, offset: 0 });
    } else if (mode === "cross") {
      beams.push({ vertical: false, at: -2.2, amp: 0, speed: 0, phase: 0, period: 0, offset: 0 });
      beams.push({ vertical: false, at: 2.2, amp: 0, speed: 0, phase: 0, period: 0, offset: 0 });
      beams.push({ vertical: true, at: -3.2, amp: 0, speed: 0, phase: 0, period: 0, offset: 0 });
      beams.push({ vertical: true, at: 3.2, amp: 0, speed: 0, phase: 0, period: 0, offset: 0 });
      // The middle cell and the four corners are safe; the side cells get blinking beams.
      beams.push({ vertical: true, at: -6.5, amp: 0, speed: 0, phase: 0, period: 2.6, offset: 0 });
      beams.push({ vertical: true, at: 6.5, amp: 0, speed: 0, phase: 0, period: 2.6, offset: 1.3 });
    } else {
      for (const y of [-3.5, -1.2, 1.2, 3.5]) beams.push({ vertical: false, at: y, amp: 0, speed: 0, phase: 0, period: 2.8, offset: 0 });
      for (const x of [-6, -2, 2, 6]) beams.push({ vertical: true, at: x, amp: 0, speed: 0, phase: 0, period: 2.8, offset: 0 });
    }
    this.gates.push({ s, beams, crossed: false });
  }

  private tower(s: number, x: number, y: number, turrets: number) {
    // A derelict column standing out from the edge of the flight box, turrets on its tip.
    const up = y < 0 ? -1 : 1; // the column extends away from the box
    const len = 3;
    const size = 5;
    const pieces = [M.structure, M.structureDiagonal, M.structureClosed, M.supports];
    for (let i = 0; i < len; i++) {
      const key = pieces[(i + Math.floor(Math.abs(x))) % pieces.length];
      const base = up < 0 ? y - 1 - (i + 1) * size : y + 1 + i * size;
      this.prop(key, s, x, base, undefined, tmpA.setScalar(size).clone());
    }
    // A platform cap the turrets stand on (upside down for hanging towers).
    if (up < 0) this.prop(M.platformHigh, s, x, y - 1, undefined, tmpA.set(size + 1, 1, size + 1).clone());
    else this.prop(M.platformHigh, s, x, y + 1, tmpQ.setFromAxisAngle(Z_AXIS, Math.PI).clone(), tmpA.set(size + 1, 1, size + 1).clone());
    const extent = len * size + 1;
    this.barriers.push({ s, rects: [{ x, y: y + (up * extent) / 2, hw: size / 2 + 0.6, hh: extent / 2 }], crossed: false });
    for (let i = 0; i < turrets; i++) {
      const ts = s + (i - (turrets - 1) / 2) * 3.2;
      const e = this.enemies.turret(ts, x + (i % 2 ? 1 : -1) * 1.2, y + (up < 0 ? 0 : 0), M.turretSingle);
      if (up > 0) e.bank = Math.PI;
    }
  }

  /** Gate beams for the HUD-free visuals + collisions. */
  private beamOn(b: GateBeam, time: number) {
    if (!b.period) return { on: true, warn: false };
    const ph = (time + b.offset) % b.period;
    const onPart = b.period * 0.45;
    return { on: ph < onPart, warn: ph > b.period - 0.55 };
  }

  private beamPos(b: GateBeam, time: number) {
    return b.at + (b.amp ? Math.sin(time * b.speed + b.phase) * b.amp : 0);
  }

  update(dt: number, prevS: number) {
    const { ctx } = this;
    const s = ctx.s;
    // Rings: spin, glow, pass-through check.
    for (const r of this.rings) {
      if (r.taken) continue;
      r.t += dt;
      ctx.rail.frame(r.s, f);
      tmpA.copy(f.pos).addScaledVector(f.right, r.x).addScaledVector(f.up, r.y);
      if (r.obj) {
        r.obj.position.copy(tmpA);
        r.obj.quaternion.copy(f.quat).multiply(tmpQ.setFromAxisAngle(X_AXIS, Math.PI / 2)).multiply(tmpQ2.setFromAxisAngle(Y_AXIS, r.t * 1.5));
      }
      ctx.glows.add(tmpA, GOLD, 5.5, 0.35 + Math.sin(r.t * 5) * 0.1);
      if (prevS < r.s && s >= r.s) {
        if (Math.hypot(ctx.px - r.x, ctx.py - r.y) < 3.6) {
          r.taken = true;
          this.release(r.obj, M.stardust);
          r.obj = null;
          ctx.flashes.spawn(tmpA, 5, GOLD, 0.45, true, f.quat);
          ctx.particles.burst(tmpA, 30, 16, GOLD, 0.8, 0.6, ctx.railVel, 1.5);
          this.onRing();
        }
      }
      if (r.s < s - 1) {
        r.taken = true;
        this.release(r.obj, M.stardust);
        r.obj = null;
      }
    }
    this.rings = this.rings.filter((r) => !r.taken);

    // Pickups: float and spin, collect when close.
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.t += dt;
      const ahead = p.s - s;
      if (ahead < 16 && ahead > -4) {
        // Magnet.
        const k = 1 - Math.exp(-5 * dt);
        p.x += (ctx.px - p.x) * k;
        p.y += (ctx.py - p.y) * k;
      }
      ctx.rail.frame(p.s, f);
      tmpA.copy(f.pos).addScaledVector(f.right, p.x).addScaledVector(f.up, p.y + Math.sin(p.t * 3) * 0.3);
      if (p.obj) {
        p.obj.position.copy(tmpA);
        p.obj.quaternion.copy(f.quat).multiply(tmpQ.setFromAxisAngle(Y_AXIS, p.t * 2.5));
      }
      const col = p.kind === "bomb" ? MAGENTA : CYAN;
      ctx.glows.add(tmpA, col, 4.5, 0.6 + Math.sin(p.t * 8) * 0.25);
      if (Math.abs(ahead) < 2.5 && Math.hypot(ctx.px - p.x, ctx.py - p.y) < 3.2) {
        p.alive = false;
        this.release(p.obj, p.key);
        ctx.particles.burst(tmpA, 24, 12, col, 0.7, 0.5, ctx.railVel, 1.5);
        this.onPickup(p.kind);
      } else if (ahead < -10) {
        p.alive = false;
        this.release(p.obj, p.key);
      }
    }
    this.pickups = this.pickups.filter((p) => p.alive);

    // Solid barriers (girders, towers).
    for (const b of this.barriers) {
      if (b.crossed) continue;
      if (prevS < b.s && s >= b.s) {
        b.crossed = true;
        for (const r of b.rects) {
          if (Math.abs(ctx.px - r.x) < r.hw + 0.7 && Math.abs(ctx.py - r.y) < r.hh + 0.35) {
            ctx.rail.frame(b.s, f);
            ctx.hurt(22, tmpA.copy(ctx.player));
            ctx.shake(0.8);
            ctx.particles.burst(ctx.player, 30, 20, new THREE.Color("#ffcc88"), 0.8, 0.5, ctx.railVel);
            break;
          }
        }
      } else if (b.s < s - 5) b.crossed = true;
    }
    this.barriers = this.barriers.filter((b) => !b.crossed || b.s > s - 5);

    // Laser gates: draw beams, warn, and check the crossing.
    const time = ctx.time;
    for (const g of this.gates) {
      if (g.s < s - 30) continue;
      ctx.rail.frame(g.s, f);
      const W = TRENCH.halfWidth - 1.6;
      for (const b of g.beams) {
        const st = this.beamOn(b, time);
        const p = this.beamPos(b, time);
        if (b.vertical) {
          tmpA.copy(f.pos).addScaledVector(f.right, p).addScaledVector(f.up, TRENCH.floor);
          tmpB.copy(f.pos).addScaledVector(f.right, p).addScaledVector(f.up, TRENCH.wallTop);
        } else {
          tmpA.copy(f.pos).addScaledVector(f.right, -W).addScaledVector(f.up, p);
          tmpB.copy(f.pos).addScaledVector(f.right, W).addScaledVector(f.up, p);
        }
        if (st.on) ctx.beams.add(tmpA, tmpB, BEAM_HALF * 2.6, RED, 1.6 + Math.sin(time * 40) * 0.2);
        else if (st.warn) ctx.beams.add(tmpA, tmpB, 0.35, RED, Math.sin(time * 50) > 0 ? 1.2 : 0.2);
        else ctx.beams.add(tmpA, tmpB, 0.12, DIM_RED, 0.5);
      }
      if (!g.crossed && prevS < g.s && s >= g.s) {
        g.crossed = true;
        for (const b of g.beams) {
          if (!this.beamOn(b, time).on) continue;
          const p = this.beamPos(b, time);
          const d = b.vertical ? Math.abs(ctx.px - p) : Math.abs(ctx.py - p);
          if (d < BEAM_HALF + (b.vertical ? 0.8 : 0.4)) {
            ctx.hurt(24, ctx.player);
            ctx.shake(0.6);
            break;
          }
        }
      }
    }
    this.gates = this.gates.filter((g) => g.s > s - 30);

    // Props behind the player go back to the pool.
    for (const p of this.props) {
      if (p.s < s - 40) {
        this.release(p.obj, p.key);
        p.s = -Infinity;
      }
    }
    this.props = this.props.filter((p) => p.s !== -Infinity);
  }

  /** Is a laser gate close ahead? (for the warning blip) */
  gateAhead(range: number) {
    return this.gates.some((g) => !g.crossed && g.s - this.ctx.s > 0 && g.s - this.ctx.s < range);
  }

  private release(obj: THREE.Object3D | null, key: string) {
    if (!obj) return;
    obj.scale.set(1, 1, 1);
    this.ctx.pool.release(key, obj);
  }

  clear() {
    for (const r of this.rings) this.release(r.obj, M.stardust);
    for (const p of this.pickups) this.release(p.obj, p.key);
    for (const p of this.props) this.release(p.obj, p.key);
    this.rings = [];
    this.pickups = [];
    this.props = [];
    this.barriers = [];
    this.gates = [];
  }
}
