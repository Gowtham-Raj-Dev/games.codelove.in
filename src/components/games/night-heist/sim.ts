import { BASE_MODS, districtOf, type Mods } from "./content";
import { angleDiff, damp, rng, turnTowards, type Vec2 } from "./grid";
import { laserAxis, laserCells, laserOffset, laserState, LOOT_VALUE, parseLevel, type LaserDef, type LevelDef, type LootKind, type Parsed } from "./levels";
import { Drone, Guard, SecurityCamera, type Thief, type Voice, type WatchCtx } from "./watchers";

/**
 * One heist as pure logic: the thief, the guards, the security gear, the loot and the rules — no
 * three.js and no sound, so the game (engine.ts), the solver (bot.ts) and the check script all run
 * exactly the same heist. It is deterministic: the same inputs at the same time steps always play
 * out the same way. What happens is reported through `SimFx` for whoever wants to show or hear it.
 */

// --- Tuning ----------------------------------------------------------------------------------------------

export const THIEF_R = 0.27;
export const SPEED = { sneak: 1.55, walk: 2.7, run: 4.4 };
const STEP_LEN = { sneak: 0.55, walk: 0.72, run: 1.05 };
export const NOISE = { walk: 1.7, run: 4.6, coin: 5.2, thud: 2.2, bark: 6.5, creak: { sneak: 2.5, walk: 3.6, run: 5.4 } };
export const THROW_RANGE = 8;
export const ALARM_TIME = 16;
const REACH = { pedestal: 1.55, plinth: 1.45, door: 1.35, console: 1.5, ko: 1.1 };
export const CRACK_TIME = 2.8;
export const SMOKE = { radius: 2.6, time: 6 };
export const JAM = { radius: 7.5, time: 8 };

export type Stance = "still" | "sneak" | "walk" | "run";

export type SoundName =
  | "stepSneak"
  | "stepWalk"
  | "stepRun"
  | "creak"
  | "zap"
  | "plate"
  | "alarm"
  | "allClear"
  | "coinThrow"
  | "coinClink"
  | "pickup"
  | "gem"
  | "key"
  | "unlock"
  | "denied"
  | "console"
  | "knockout"
  | "escape"
  | "caught"
  | "denyExit"
  | "crack"
  | "safeOpen"
  | "smoke"
  | "jam"
  | "timer"
  | "timerOut";

export type ThiefClip = "pickup" | "throw" | "knock" | "use" | "crack" | "die";

/** What the game shows and plays; the solver passes nothing. */
export interface SimFx {
  sound(name: SoundName): void;
  voice(kind: Voice, pitch: number, x: number, z: number): void;
  /** A noise ring on the floor. */
  ring(x: number, z: number, r: number, color: string, alpha: number, life: number): void;
  burst(x: number, y: number, z: number, color: string, n: number, speed?: number): void;
  toast(text: string, tone?: "info" | "good" | "bad"): void;
  thiefClip(clip: ThiefClip): void;
  /** The guard who grabbed the thief. */
  guardCatch(index: number): void;
}

const noop = () => {};
export const NO_FX: SimFx = { sound: noop, voice: noop, ring: noop, burst: noop, toast: noop, thiefClip: noop, guardCatch: noop };

export interface SimInput {
  /** Movement in world space (the camera looks north), length 0..1. */
  x: number;
  z: number;
  sneak: boolean;
  run: boolean;
  /** Pressed this step. */
  use?: boolean;
  gadget?: boolean;
  throwAt?: [number, number] | null;
}

export interface Result {
  level: number;
  escaped: boolean;
  reason: string;
  time: number;
  loot: number;
  lootTotal: number;
  /** Cash value of everything carried out (0 when caught). */
  value: number;
  alarm: boolean;
  knockouts: number;
  stars: number;
  par: number;
}

export interface LootState extends Vec2 {
  kind: LootKind;
  plinth: boolean;
  taken: boolean;
  value: number;
}

export interface DoorState extends Vec2 {
  axis: "x" | "z";
  opening: boolean;
  /** 0 shut … 1 open. */
  open: number;
}

export interface LaserSim {
  def: LaserDef;
  axis: "x" | "z";
  cells: Vec2[];
  active: boolean;
  warn: boolean;
  /** How far the gate has slid (sweeping gates), in cells. */
  off: Vec2;
  jamT: number;
}

export interface CoinState {
  from: Vec2;
  to: Vec2;
  t: number;
  dur: number;
  landed: boolean;
  life: number;
  /** A number of its own, so the view can tell coins apart. */
  id: number;
}

export interface Cloud extends Vec2 {
  t: number;
}

type Busy = { kind: "pickup" | "throw" | "knock" | "crack"; t: number; total: number; loot?: LootState } | null;

export class HeistSim {
  readonly level: Parsed;
  readonly guards: Guard[];
  readonly cams: SecurityCamera[];
  readonly drones: Drone[];
  readonly loot: LootState[];
  readonly keys: (Vec2 & { taken: boolean })[];
  readonly doors: DoorState[];
  readonly plates: (Vec2 & { hit: boolean })[];
  readonly lasers: LaserSim[];
  readonly coins: CoinState[] = [];
  readonly clouds: Cloud[] = [];
  readonly targetValue: number;
  readonly targetName: string;
  readonly lootNames: Record<LootKind, string>;

  readonly thief: Thief & { yaw: number; vx: number; vz: number };
  stance: Stance = "still";
  busy: Busy = null;
  stage: "play" | "caught" | "escape" | "done" = "play";
  stageT = 0;
  time = 0;
  hasGem = false;
  lootTaken = 0;
  value = 0;
  coinsLeft: number;
  keysHeld: number;
  charges: number;
  knockouts = 0;
  alarm = false;
  alarmEver = false;
  alarmQuiet = 0;
  alarmReason = "";
  camerasOff = false;
  /** Seconds left on the vault timer (-1: not running). */
  timerLeft = -1;
  /** 0..1 how loud the nearest live laser hums. */
  hum = 0;
  /** Set once the heist is over. */
  result: Result | null = null;
  readonly lastKnown: Vec2 = { x: 0, z: 0 };

  private readonly random: () => number;
  private readonly ctx: WatchCtx;
  private stepAcc = 0;
  private throwCd = 0;
  private exitDenyT = 0;
  private coinId = 0;
  private timerBeep = 0;

  constructor(
    readonly def: LevelDef,
    readonly index: number,
    readonly mods: Mods = BASE_MODS,
    private readonly fx: SimFx = NO_FX,
  ) {
    const level = (this.level = parseLevel(def, index));
    const district = districtOf(index);
    this.targetValue = district.targetValue;
    this.targetName = def.target.name;
    this.lootNames = district.loot;
    this.random = rng(1234 + index * 77);
    this.thief = { x: level.start.x, z: level.start.z, yaw: Math.PI, vx: 0, vz: 0, sneaking: false, running: false, moving: false };
    this.guards = def.guards.map((g, i) => new Guard(g, i, level.grid));
    this.cams = (def.cameras ?? []).map((c) => new SecurityCamera(c));
    this.drones = (def.drones ?? []).map((d) => new Drone(d));
    this.loot = level.loot.map((l) => ({ ...l, taken: false, value: Math.round((LOOT_VALUE[l.kind] * district.lootMult) / 10) * 10 }));
    this.keys = level.keys.map((k) => ({ ...k, taken: false }));
    this.doors = level.doors.map((d) => ({ ...d, opening: false, open: 0 }));
    this.plates = level.plates.map((p) => ({ ...p, hit: false }));
    this.lasers = (def.lasers ?? []).map((l) => ({ def: l, axis: laserAxis(l), cells: laserCells(l), active: false, warn: false, off: { x: 0, z: 0 }, jamT: 0 }));
    this.coinsLeft = def.coins + mods.coins;
    this.keysHeld = mods.keys;
    this.charges = mods.gadget && mods.gadget !== "lockpick" ? mods.charges : 0;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const sim = this;
    this.ctx = {
      grid: level.grid,
      player: this.thief,
      get alarm() {
        return sim.alarm;
      },
      lastKnown: this.lastKnown,
      guards: this.guards,
      get time() {
        return sim.time;
      },
      get cloaked() {
        return sim.cloaked;
      },
      notice: mods.notice,
      rand: () => this.random(),
      raiseAlarm: (x, z, by) => this.raiseAlarm(x, z, by),
      spotted: (x, z) => {
        this.lastKnown.x = x;
        this.lastKnown.z = z;
        this.alarmQuiet = 0;
      },
      caught: (by) => this.caught(by),
      voice: (kind, pitch, x, z) => {
        if (this.stage === "play") this.fx.voice(kind, pitch, x, z);
      },
      bark: (dog) => {
        this.fx.voice("bark", dog.pitch, dog.x, dog.z);
        this.makeNoise(dog.x, dog.z, NOISE.bark, "bark", dog);
      },
      pickCoin: (x, z) => {
        const c = this.coins.find((k) => k.landed && Math.hypot(k.to.x - x, k.to.z - z) < 1.5);
        if (c) c.life = 0;
      },
    };
    this.updateLasers(0);
  }

  get grid() {
    return this.level.grid;
  }

  get lootTotal() {
    return this.level.lootTotal;
  }

  /** Standing in smoke. */
  get cloaked() {
    const t = this.thief;
    for (const c of this.clouds) if (Math.hypot(c.x - t.x, c.z - t.z) < SMOKE.radius) return true;
    return false;
  }

  /** Highest awareness among everything that watches, 0..1. */
  get suspicion() {
    let s = 0;
    for (const g of this.guards) if (g.alive) s = Math.max(s, g.awareness);
    for (const c of this.cams) if (!c.off) s = Math.max(s, c.awareness);
    for (const d of this.drones) if (!d.off) s = Math.max(s, d.awareness);
    return s;
  }

  /** 0..1 progress of the safe being cracked (0 when none). */
  get crack() {
    const b = this.busy;
    return b && b.kind === "crack" ? 1 - b.t / b.total : 0;
  }

  // --- One step --------------------------------------------------------------------------------------------

  step(dt: number, input: SimInput) {
    if (this.stage === "done") return;
    const level = this.level;
    this.time += dt;
    if (this.stage !== "play") {
      this.stageT += dt;
      if (this.stage === "caught") {
        for (const g of this.guards) if (g.alive && g.state === "hunt") g.yaw = turnTowards(g.yaw, Math.atan2(this.thief.x - g.x, this.thief.z - g.z), 6, dt);
        if (this.stageT > 1.6) this.finish(false);
      } else if (this.stage === "escape") {
        const ex = level.exit;
        this.thief.x += Math.sin(ex.yaw + Math.PI) * 1.4 * dt;
        this.thief.z += Math.cos(ex.yaw + Math.PI) * 1.4 * dt;
        if (this.stageT > 1.3) this.finish(true);
      }
      return;
    }

    if (input.throwAt) this.throwCoin(input.throwAt[0], input.throwAt[1]);
    if (input.gadget) this.useGadget();
    this.updateThief(dt, input);
    if (this.stage !== "play") return;
    this.updateLasers(dt);
    this.updateSecurity();
    for (const c of this.cams) c.update(dt, this.ctx);
    for (const d of this.drones) d.update(dt, this.ctx);
    for (const g of this.guards) g.update(dt, this.ctx);
    if (this.stage !== "play") return;
    this.updateCoins(dt);
    this.updateDoors(dt);
    this.updateClouds(dt);
    this.updateTimer(dt);
    this.updateAlarm(dt);
    if (input.use && !this.busy) this.useTarget()?.run();
  }

  private updateThief(dt: number, input: SimInput) {
    const t = this.thief;
    const level = this.level;
    const grid = level.grid;
    this.throwCd -= dt;
    const len = Math.hypot(input.x, input.z);
    if (this.busy) {
      const b = this.busy;
      // Walking away from a safe gives it up.
      if (b.kind === "crack" && len > 0.3) {
        this.busy = null;
        this.fx.toast("You left the safe shut", "info");
      } else {
        b.t -= dt;
        if (b.kind === "crack" && Math.floor((b.t + dt) / 0.45) !== Math.floor(b.t / 0.45)) this.fx.sound("crack");
        if (b.t <= 0) {
          this.busy = null;
          if (b.kind === "crack" && b.loot && !b.loot.taken) {
            this.fx.sound("safeOpen");
            this.takeLoot(b.loot);
          }
        }
      }
    }
    let stance: Stance = "still";
    if (len > 0.05 && !this.busy) stance = input.run ? "run" : input.sneak ? "sneak" : "walk";
    // A light push on the stick walks; it never runs by itself.
    const top = stance === "still" ? 0 : SPEED[stance] * (stance === "sneak" ? this.mods.sneak : stance === "run" ? this.mods.run : 1);
    const speed = top * (stance === "run" ? 1 : Math.min(1, 0.35 + len));
    const tx = len > 0.05 ? (input.x / len) * speed : 0;
    const tz = len > 0.05 ? (input.z / len) * speed : 0;
    const accel = stance === "still" ? 16 : 12;
    t.vx = damp(t.vx, this.busy ? 0 : tx, accel, dt);
    t.vz = damp(t.vz, this.busy ? 0 : tz, accel, dt);
    const ox = t.x;
    const oz = t.z;
    t.x += t.vx * dt;
    t.z += t.vz * dt;
    grid.collide(t, THIEF_R);
    const moved = Math.hypot(t.x - ox, t.z - oz);
    t.moving = moved > 0.002;
    t.sneaking = stance === "sneak" || (input.sneak && !input.run);
    t.running = stance === "run" && moved / dt > 3;
    this.stance = t.moving ? stance : "still";
    if (len > 0.05 && !this.busy) t.yaw = turnTowards(t.yaw, Math.atan2(input.x, input.z), 12, dt);

    // Footsteps: silent when sneaking, a ring of noise when walking, loud when running — and a
    // creaky board or a patch of gravel gives even a careful foot away.
    if (t.moving) {
      this.stepAcc += moved;
      const kind = this.stance === "run" ? "run" : this.stance === "sneak" ? "sneak" : "walk";
      if (this.stepAcc >= STEP_LEN[kind]) {
        this.stepAcc = 0;
        const cx = Math.round(t.x);
        const cz = Math.round(t.z);
        if (grid.inside(cx, cz) && grid.noisy[grid.idx(cx, cz)]) {
          this.fx.sound("creak");
          this.makeNoise(t.x, t.z, NOISE.creak[kind], "step");
        } else {
          this.fx.sound(kind === "run" ? "stepRun" : kind === "walk" ? "stepWalk" : "stepSneak");
          if (kind === "walk") this.makeNoise(t.x, t.z, NOISE.walk * this.mods.walkNoise, "step");
          else if (kind === "run") this.makeNoise(t.x, t.z, NOISE.run, "step");
        }
      }
    }

    // Exit.
    const ex = level.exit;
    const dExit = Math.hypot(t.x - ex.x, t.z - ex.z);
    this.exitDenyT -= dt;
    if (dExit < 0.98) {
      if (this.hasGem) {
        this.stage = "escape";
        this.stageT = 0;
        this.busy = null;
        this.fx.sound("escape");
        return;
      } else if (this.exitDenyT <= 0) {
        this.exitDenyT = 3;
        this.fx.sound("denyExit");
        this.fx.toast(`Not without the ${this.targetName}!`, "info");
      }
    }

    // Pick-ups you just walk over: coin stacks and key cards.
    for (const l of this.loot) {
      if (l.taken || l.plinth) continue;
      if (Math.hypot(t.x - l.x, t.z - l.z) < 0.55) this.takeLoot(l);
    }
    for (const k of this.keys) {
      if (k.taken || Math.hypot(t.x - k.x, t.z - k.z) > 0.6) continue;
      k.taken = true;
      this.keysHeld++;
      this.fx.sound("key");
      this.fx.burst(k.x, 0.4, k.z, "#ffd76a", 18);
      this.fx.toast("Key card — opens one locked door", "good");
    }
  }

  private takeLoot(l: LootState) {
    l.taken = true;
    this.lootTaken++;
    this.value += l.value;
    if (l.kind === "coins") this.coinsLeft += 2;
    this.fx.sound("pickup");
    this.fx.burst(l.x, l.plinth ? 0.6 : 0.3, l.z, "#ffd27a", 22);
    this.fx.toast(`${this.lootNames[l.kind]} +$${l.value}${l.kind === "coins" ? " · +2 coins to throw" : ""}`, "good");
  }

  private updateLasers(dt: number) {
    for (const laser of this.lasers) {
      if (laser.jamT > 0) laser.jamT = Math.max(0, laser.jamT - dt);
      const st = laserState(laser.def, this.time);
      laser.active = st.active && laser.jamT <= 0;
      laser.warn = st.warn && laser.jamT <= 0;
      laser.off = laserOffset(laser.def, this.time);
    }
  }

  /** Lasers and pressure plates. */
  private updateSecurity() {
    const t = this.thief;
    let hum = 0;
    for (const laser of this.lasers) {
      if (!laser.active) continue;
      for (const c of laser.cells) {
        const cx = c.x + laser.off.x;
        const cz = c.z + laser.off.z;
        const d = Math.hypot(t.x - cx, t.z - cz);
        hum = Math.max(hum, 1 - d / 5);
        const across = laser.axis === "x" ? Math.abs(t.z - cz) : Math.abs(t.x - cx);
        const along = laser.axis === "x" ? Math.abs(t.x - cx) : Math.abs(t.z - cz);
        if (across < THIEF_R * 0.8 && along < 0.5) {
          this.hum = 0;
          this.fx.sound("zap");
          this.raiseAlarm(t.x, t.z, "laser");
          return;
        }
      }
    }
    this.hum = Math.max(0, hum);
    for (const p of this.plates) {
      if (p.hit) continue;
      if (Math.abs(t.x - p.x) < 0.42 && Math.abs(t.z - p.z) < 0.42) {
        p.hit = true;
        this.fx.sound("plate");
        this.raiseAlarm(t.x, t.z, "plate");
      }
    }
  }

  private makeNoise(x: number, z: number, r: number, kind: "step" | "coin" | "thud" | "bark", except?: Guard) {
    if (r <= 0.05) return;
    const grid = this.level.grid;
    const color = kind === "coin" ? "#ffcf6a" : kind === "thud" ? "#ff8a6a" : kind === "bark" ? "#ff9d5c" : r > 3 ? "#ffb08a" : "#cfd8ff";
    this.fx.ring(x, z, r, color, kind === "step" && r < 3 ? 0.35 : 0.75, kind === "step" ? 0.5 : 0.8);
    for (const g of this.guards) {
      if (!g.alive || g === except) continue;
      let d = Math.hypot(g.x - x, g.z - z);
      if (!grid.los(g.x, g.z, x, z)) d *= 1.6;
      if (d > r) continue;
      if (kind === "step" && this.alarm) this.ctx.spotted(x, z);
      g.notice(x, z, this.ctx, { coin: kind === "coin" });
    }
  }

  private throwCoin(x: number, z: number) {
    if (this.stage !== "play" || this.throwCd > 0 || this.busy) return;
    if (this.coinsLeft <= 0) {
      this.fx.toast("No coins left to throw", "info");
      this.throwCd = 0.7;
      return;
    }
    const t = this.thief;
    let dx = x - t.x;
    let dz = z - t.z;
    const d = Math.hypot(dx, dz);
    if (!(d >= 0.6)) return;
    if (d > THROW_RANGE) {
      dx *= THROW_RANGE / d;
      dz *= THROW_RANGE / d;
    }
    const target = this.level.grid.nearestWalkable(t.x + dx, t.z + dz);
    if (!target) return;
    // Land where the cursor pointed when that spot is open floor.
    const exact = Math.abs(t.x + dx - target.x) < 0.5 && Math.abs(t.z + dz - target.z) < 0.5;
    const tx = exact ? t.x + dx : target.x;
    const tz = exact ? t.z + dz : target.z;
    this.coinsLeft--;
    this.throwCd = 0.7;
    this.busy = { kind: "throw", t: 0.28, total: 0.28 };
    t.yaw = Math.atan2(dx, dz);
    this.fx.thiefClip("throw");
    const dist = Math.hypot(tx - t.x, tz - t.z);
    this.coins.push({ from: { x: t.x, z: t.z }, to: { x: tx, z: tz }, t: 0, dur: 0.35 + dist * 0.05, landed: false, life: 14, id: ++this.coinId });
    this.fx.sound("coinThrow");
  }

  private updateCoins(dt: number) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.landed) {
        c.t += dt;
        if (c.t >= c.dur) {
          c.landed = true;
          this.fx.sound("coinClink");
          this.fx.burst(c.to.x, 0.1, c.to.z, "#ffd27a", 8, 1.2);
          this.makeNoise(c.to.x, c.to.z, NOISE.coin, "coin");
        }
      } else {
        c.life -= dt;
        if (c.life <= 0) this.coins.splice(i, 1);
      }
    }
  }

  /** Opened doors sink into the floor, then stop blocking. */
  private updateDoors(dt: number) {
    const grid = this.level.grid;
    for (const d of this.doors) {
      if (!d.opening || d.open >= 1) continue;
      d.open = Math.min(1, d.open + dt * 1.3);
      if (d.open >= 1) {
        const i = grid.idx(d.x, d.z);
        grid.solid[i] = 0;
        grid.opaque[i] = 0;
      }
    }
  }

  private updateClouds(dt: number) {
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      this.clouds[i].t -= dt;
      if (this.clouds[i].t <= 0) this.clouds.splice(i, 1);
    }
  }

  /** The vault's silent alarm: once the target is lifted, the clock runs. */
  private updateTimer(dt: number) {
    if (this.timerLeft < 0 || this.alarmEver) return;
    this.timerLeft = Math.max(0, this.timerLeft - dt);
    this.timerBeep -= dt;
    if (this.timerLeft <= 10 && this.timerBeep <= 0 && this.timerLeft > 0) {
      this.timerBeep = this.timerLeft < 4 ? 0.5 : 1;
      this.fx.sound("timer");
    }
    if (this.timerLeft <= 0) {
      this.fx.sound("timerOut");
      this.raiseAlarm(this.thief.x, this.thief.z, "timer");
    }
  }

  private useGadget() {
    if (this.stage !== "play" || this.busy || !this.mods.gadget || this.mods.gadget === "lockpick") return;
    if (this.charges <= 0) {
      this.fx.toast("No gadget uses left", "info");
      return;
    }
    const t = this.thief;
    this.charges--;
    if (this.mods.gadget === "smoke") {
      this.clouds.push({ x: t.x, z: t.z, t: SMOKE.time });
      this.fx.sound("smoke");
      this.fx.ring(t.x, t.z, SMOKE.radius, "#cbd5e1", 0.8, 0.7);
      this.fx.toast("Smoke! They can't see you in the cloud", "good");
    } else {
      let hit = 0;
      const near = (x: number, z: number) => Math.hypot(x - t.x, z - t.z) < JAM.radius;
      for (const c of this.cams) {
        if (c.disabled || !near(c.x, c.z)) continue;
        c.jamT = JAM.time;
        hit++;
      }
      for (const d of this.drones) {
        if (!near(d.x, d.z)) continue;
        d.jamT = JAM.time;
        hit++;
      }
      for (const l of this.lasers) {
        if (!l.cells.some((c) => near(c.x + l.off.x, c.z + l.off.z))) continue;
        l.jamT = JAM.time;
        hit++;
      }
      this.updateLasers(0);
      this.fx.sound("jam");
      this.fx.ring(t.x, t.z, JAM.radius, "#7dd3fc", 0.8, 0.9);
      this.fx.toast(hit ? `Jammed ${hit} device${hit === 1 ? "" : "s"} for ${JAM.time} seconds` : "Nothing in range to jam", hit ? "good" : "info");
    }
  }

  private raiseAlarm(x: number, z: number, by: string) {
    this.lastKnown.x = x;
    this.lastKnown.z = z;
    this.alarmQuiet = 0;
    if (this.alarm) return;
    this.alarm = true;
    this.alarmEver = true;
    this.alarmReason = by;
    for (const g of this.guards) g.hunt(this.ctx);
    this.fx.sound("alarm");
    const why =
      by === "laser"
        ? "You tripped a laser!"
        : by === "plate"
          ? "A pressure plate clicked!"
          : by === "camera"
            ? "A camera spotted you!"
            : by === "drone"
              ? "A drone spotted you!"
              : by === "dog"
                ? "A guard dog found you!"
                : by === "timer"
                  ? "The vault's silent alarm tripped!"
                  : "A guard spotted you!";
    this.fx.toast(`ALARM — ${why} Break line of sight and hide.`, "bad");
  }

  private updateAlarm(dt: number) {
    if (!this.alarm) return;
    this.alarmQuiet += dt;
    if (this.alarmQuiet >= ALARM_TIME) {
      this.alarm = false;
      for (const g of this.guards) g.standDown(this.ctx);
      for (const c of this.cams) c.awareness = 0;
      for (const d of this.drones) d.awareness = 0;
      this.fx.sound("allClear");
      this.fx.toast("The alarm stopped. They lost you… for now.", "info");
    }
  }

  private caught(by: Guard) {
    if (this.stage !== "play") return;
    this.stage = "caught";
    this.stageT = 0;
    this.busy = null;
    if (!this.alarmReason) this.alarmReason = by.kind === "dog" ? "dog" : "guard";
    this.fx.sound("caught");
    by.yaw = Math.atan2(this.thief.x - by.x, this.thief.z - by.z);
    this.fx.guardCatch(by.index);
    this.fx.thiefClip("die");
    this.thief.vx = this.thief.vz = 0;
    this.hum = 0;
  }

  private finish(escaped: boolean) {
    let stars = 0;
    if (escaped) {
      stars = 1;
      if (!this.alarmEver) stars++;
      if (this.lootTaken >= this.level.lootTotal) stars++;
    }
    this.stage = "done";
    this.hum = 0;
    this.result = {
      level: this.index,
      escaped,
      reason: escaped ? "" : this.alarmReason,
      time: this.time,
      loot: this.lootTaken,
      lootTotal: this.level.lootTotal,
      value: escaped ? this.value + this.targetValue : 0,
      alarm: this.alarmEver,
      knockouts: this.knockouts,
      stars,
      par: this.def.par,
    };
  }

  /** What "use" would do right now (also drives the prompt). */
  useTarget(): { label: string; run: () => void } | null {
    if (this.stage !== "play") return null;
    const t = this.thief;
    const level = this.level;
    const hands = this.mods.hands;
    // Knock out an unaware guard from behind.
    for (const g of this.guards) {
      if (!g.alive || !g.spec.ko || g.state === "hunt" || g.awareness > 0.75) continue;
      const d = Math.hypot(g.x - t.x, g.z - t.z);
      if (d > REACH.ko + this.mods.koReach) continue;
      const behind = Math.abs(angleDiff(g.yaw, Math.atan2(t.x - g.x, t.z - g.z))) > 1.75;
      if (!behind) continue;
      return {
        label: "Knock out",
        run: () => {
          g.knockOut(28 * this.mods.koTime);
          this.knockouts++;
          t.yaw = Math.atan2(g.x - t.x, g.z - t.z);
          this.busy = { kind: "knock", t: 0.45, total: 0.45 };
          this.fx.thiefClip("knock");
          this.fx.sound("knockout");
          this.makeNoise(g.x, g.z, NOISE.thud, "thud");
        },
      };
    }
    if (!this.hasGem && Math.hypot(level.target.x - t.x, level.target.z - t.z) < REACH.pedestal) {
      return {
        label: `Steal the ${this.targetName}`,
        run: () => {
          this.hasGem = true;
          this.busy = { kind: "pickup", t: 0.5 * hands, total: 0.5 * hands };
          t.yaw = Math.atan2(level.target.x - t.x, level.target.z - t.z);
          this.fx.thiefClip("pickup");
          this.fx.sound("gem");
          this.fx.burst(level.target.x, 0.82, level.target.z, "gem", 36, 2.6);
          if (this.def.timer && !this.alarmEver) {
            this.timerLeft = this.def.timer;
            this.fx.toast(`You have the ${this.targetName} — the silent alarm trips in ${this.def.timer} seconds. Get out!`, "bad");
          } else this.fx.toast(`You have the ${this.targetName}. Now get out!`, "good");
        },
      };
    }
    for (const l of this.loot) {
      if (l.taken || !l.plinth) continue;
      if (Math.hypot(l.x - t.x, l.z - t.z) > REACH.plinth) continue;
      const name = this.lootNames[l.kind].toLowerCase();
      if (l.kind === "safe") {
        return {
          label: `Crack the ${name} ($${l.value})`,
          run: () => {
            const time = CRACK_TIME * hands;
            this.busy = { kind: "crack", t: time, total: time, loot: l };
            t.yaw = Math.atan2(l.x - t.x, l.z - t.z);
            this.fx.thiefClip("crack");
            this.fx.sound("crack");
          },
        };
      }
      return {
        label: `Take the ${name} ($${l.value})`,
        run: () => {
          this.busy = { kind: "pickup", t: 0.45 * hands, total: 0.45 * hands };
          t.yaw = Math.atan2(l.x - t.x, l.z - t.z);
          this.fx.thiefClip("pickup");
          this.takeLoot(l);
        },
      };
    }
    for (const d of this.doors) {
      if (d.opening || Math.hypot(d.x - t.x, d.z - t.z) > REACH.door) continue;
      if (this.alarm) return { label: "Locked down during the alarm", run: () => this.fx.sound("denied") };
      if (this.keysHeld <= 0) return { label: "Locked — find a key card", run: () => this.fx.sound("denied") };
      return {
        label: "Open the door",
        run: () => {
          this.keysHeld--;
          d.opening = true;
          this.fx.sound("unlock");
          this.busy = { kind: "pickup", t: 0.35, total: 0.35 };
          this.fx.thiefClip("use");
        },
      };
    }
    if (!this.camerasOff && this.cams.length) {
      for (const c of level.consoles) {
        if (Math.hypot(c.x - t.x, c.z - t.z) > REACH.console) continue;
        return {
          label: "Switch off the cameras",
          run: () => {
            this.camerasOff = true;
            for (const cam of this.cams) cam.disabled = true;
            this.fx.sound("console");
            this.busy = { kind: "pickup", t: 0.6, total: 0.6 };
            this.fx.thiefClip("use");
            this.fx.toast("Cameras offline", "good");
          },
        };
      }
    }
    return null;
  }
}
