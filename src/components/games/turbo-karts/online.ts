import type { Database, DatabaseReference, Unsubscribe } from "firebase/database";
import { FIREBASE_CONFIG } from "@/lib/firebase";

/**
 * Online races (the same design as Cannon Cove's battles): rooms live in Firebase's Realtime Database,
 * but the race itself travels player-to-player over WebRTC data channels (Firebase only carries the
 * room list, who's in each room and the two connection messages per pair of players). Only when a
 * direct link can't be made (some strict mobile networks) do that pair's kart positions go through
 * the database instead, at a low rate. Old rooms are cleaned up by the players themselves.
 *
 * Two kinds of room: public ones that Quick Race fills up to six players, and private ones that only
 * open with their code (or the invite link that carries it).
 */

export const MAX_PLAYERS = 6;
/** How long a public room may sit idle before quick match ignores (and tidies) it. */
const STALE = 20 * 60_000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
/** No direct link after this long: fall back to the database for that player. */
const DIRECT_GRACE = 9000;

export const PLAYER_COLORS = ["#f87171", "#60a5fa", "#4ade80", "#facc15", "#c084fc", "#fb923c"];

export interface Member {
  id: string;
  name: string;
  driver: number;
  skin: number;
  color: number;
  joined: number;
}

/** A finisher: place (1-based) and race time in seconds (0 = didn't finish in time). */
export interface Result {
  id: string;
  name: string;
  place: number;
  time: number;
}

/** What a player brings into a room. */
export interface Me {
  name: string;
  driver: number;
  skin: number;
}

export interface RoomView {
  code: string;
  host: string;
  pub: boolean;
  state: "lobby" | "play";
  round: number;
  start: number;
  seed: number;
  track: number;
  cls: number;
  members: Member[];
  results: Result[] | null;
}

export type Link = "connecting" | "direct" | "relay";

/** Messages between players (each also carries a unique id `i`). */
export type KartNetEvent =
  /** A banana dropped at (x, z). */
  | { k: "b"; id: string; x: number; z: number }
  /** A banana somebody slipped on. */
  | { k: "bx"; id: string }
  /** Crossed the line: race time and best lap, in seconds. */
  | { k: "fin"; t: number; bl: number };

interface RawMember {
  n: string;
  k: number;
  sk?: number;
  c: number;
  j: number;
}

interface RawResult {
  id: string;
  n: string;
  p: number;
  t: number;
}

interface RawRoom {
  h: string;
  p: number;
  s: "lobby" | "play";
  r?: number;
  t?: number;
  u?: number;
  st?: number;
  sd?: number;
  tr?: number;
  cl?: number;
  m?: Record<string, RawMember>;
  res?: RawResult[] | Record<string, RawResult>;
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  s: RTCDataChannel | null;
  e: RTCDataChannel | null;
  started: number;
  link: Link;
}

type Fb = typeof import("firebase/database");

const relayOnly = () => process.env.NODE_ENV !== "production" && !!(globalThis as { __kartsRelayOnly?: boolean }).__kartsRelayOnly;

/** Open connections: the database goes offline only when the last one closes. */
let users = 0;

const randomId = () => {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
};

const randomCode = () => {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  return [...a].map((v) => CODE_CHARS[v % CODE_CHARS.length]).join("");
};

/** Waits until the browser has found its network routes (or gives up after a moment). */
const gathered = (pc: RTCPeerConnection) =>
  new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      if (pc.iceGatheringState !== "complete") return;
      pc.removeEventListener("icegatheringstatechange", done);
      resolve();
    };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, 2500);
  });

export class KartNet {
  readonly me = randomId();
  code: string | null = null;
  room: RoomView | null = null;
  readonly links = new Map<string, Link>();
  handlers: {
    room?: (room: RoomView | null, why?: string) => void;
    state?: (id: string, s: number[]) => void;
    event?: (id: string, e: KartNetEvent & { i: string }) => void;
    link?: () => void;
  } = {};

  private offset = 0;
  private readonly peers = new Map<string, Peer>();
  private listeners: Unsubscribe[] = [];
  private readonly relayListeners = new Map<string, Unsubscribe>();
  private revListener: Unsubscribe | null = null;
  private seq = 0;
  private readonly seen = new Set<string>();
  private lastRelay = 0;
  private timer = 0;
  private closed = false;

  private constructor(
    private readonly fb: Fb,
    private readonly db: Database,
  ) {}

  /** Connects to the database (loaded on demand, so it stays out of the game's main download). */
  static async open() {
    const [{ getApp, getApps, initializeApp }, fb] = await Promise.all([import("firebase/app"), import("firebase/database")]);
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    const db = fb.getDatabase(app, FIREBASE_CONFIG.databaseURL);
    users++;
    fb.goOnline(db);
    const net = new KartNet(fb, db);
    await new Promise<void>((resolve) => {
      const off = fb.onValue(fb.ref(db, ".info/serverTimeOffset"), (snap) => {
        net.offset = Number(snap.val()) || 0;
        off();
        resolve();
      });
      setTimeout(resolve, 4000);
    });
    return net;
  }

  /** Milliseconds on the database's clock (the same for every player). */
  now() {
    return Date.now() + this.offset;
  }

  private ref(path: string): DatabaseReference {
    return this.fb.ref(this.db, `karts/${path}`);
  }

  get isHost() {
    return !!this.room && this.room.host === this.me;
  }

  // --- Rooms ------------------------------------------------------------------------------------

  private rawMe(me: Me, color: number): RawMember {
    return { n: me.name.slice(0, 16), k: me.driver, sk: me.skin, c: color, j: this.now() };
  }

  async create(pub: boolean, me: Me, track = 0, cls = 1) {
    const { fb } = this;
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      const now = this.now();
      const res = await fb.runTransaction(this.ref(`rooms/${code}`), (cur: RawRoom | null) =>
        cur ? undefined : { h: this.me, p: pub ? 1 : 0, s: "lobby", r: 0, t: now, u: now, tr: track, cl: cls, m: { [this.me]: this.rawMe(me, 0) } },
      );
      if (res.committed) {
        await this.enter(code);
        return code;
      }
    }
    throw new Error("Couldn't make a room — try again.");
  }

  /** Null when joined, otherwise why not. */
  async join(code: string, me: Me) {
    const { fb } = this;
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 5) return "Room codes have 5 letters";
    const snap = await fb.get(this.ref(`rooms/${clean}`));
    const v = snap.val() as RawRoom | null;
    const members = v?.m ? Object.values(v.m) : [];
    if (!v || !members.length) return "No room with that code";
    if (members.length >= MAX_PLAYERS) return "That room is full";
    const used = new Set(members.map((m) => m.c));
    const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? 0;
    await fb.set(this.ref(`rooms/${clean}/m/${this.me}`), this.rawMe(me, color));
    await this.enter(clean);
    return null;
  }

  /**
   * Quick Race: joins the fullest public room that still has a seat (so players online at the same
   * time end up six to a room), or opens a new one. Rooms waiting in the lobby come before ones
   * mid-race. Tidies away abandoned rooms on the way.
   */
  async quick(me: Me) {
    const { fb } = this;
    const q = fb.query(this.ref("rooms"), fb.orderByChild("p"), fb.equalTo(1), fb.limitToLast(25));
    const snap = await fb.get(q);
    const now = this.now();
    const open: { code: string; n: number; lobby: boolean }[] = [];
    snap.forEach((c) => {
      const v = c.val() as RawRoom;
      const n = v.m ? Object.keys(v.m).length : 0;
      const idle = now - (v.u ?? 0) > STALE;
      if (!n || idle) {
        if (now - (v.u ?? 0) > STALE) void this.dropRoom(c.key!);
      } else if (n < MAX_PLAYERS && c.key) open.push({ code: c.key, n, lobby: v.s !== "play" });
    });
    open.sort((a, b) => Number(b.lobby) - Number(a.lobby) || b.n - a.n);
    for (const r of open) if (!(await this.join(r.code, me))) return r.code;
    return this.create(true, me, Math.floor(Math.random() * 9));
  }

  private async dropRoom(code: string) {
    const { fb } = this;
    await Promise.all([fb.remove(this.ref(`rooms/${code}`)), fb.remove(this.ref(`sig/${code}`)), fb.remove(this.ref(`relay/${code}`)), fb.remove(this.ref(`rev/${code}`))]).catch(() => {});
  }

  private async enter(code: string) {
    const { fb } = this;
    this.code = code;
    await fb.onDisconnect(this.ref(`rooms/${code}/m/${this.me}`)).remove();
    await fb.onDisconnect(this.ref(`sig/${code}/${this.me}`)).remove();
    await fb.onDisconnect(this.ref(`relay/${code}/${this.me}`)).remove();
    this.listeners.push(
      fb.onValue(this.ref(`rooms/${code}`), (snap) => this.onRoom(snap.val() as RawRoom | null)),
      fb.onChildAdded(this.ref(`sig/${code}/${this.me}`), (snap) => {
        const v = snap.val() as { f: string; y: string; d: string } | null;
        void fb.remove(snap.ref);
        if (v) void this.onSignal(v).catch((err) => console.warn("[karts] signal", err));
      }),
    );
    // Keep the room fresh for quick match, check links, and use the relay where a direct link failed.
    this.timer = window.setInterval(() => {
      for (const p of this.peers.values()) this.updateLink(p);
      if (this.isHost && this.code) void fb.update(this.ref(`rooms/${this.code}`), { u: this.now() }).catch(() => {});
    }, 3000);
  }

  async leave() {
    const { fb } = this;
    const code = this.code;
    if (!code) return;
    const others = (this.room?.members ?? []).filter((m) => m.id !== this.me);
    const host = this.room?.host === this.me;
    this.shut();
    try {
      await fb.onDisconnect(this.ref(`rooms/${code}/m/${this.me}`)).cancel();
      if (!others.length) await this.dropRoom(code);
      else {
        if (host) await fb.update(this.ref(`rooms/${code}`), { h: others[0].id });
        await fb.remove(this.ref(`rooms/${code}/m/${this.me}`));
        await fb.remove(this.ref(`sig/${code}/${this.me}`));
        await fb.remove(this.ref(`relay/${code}/${this.me}`));
      }
    } catch (err) {
      console.warn("[karts] leave", err);
    }
  }

  /** Leaves (if in a room) and closes the connection to the database. */
  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.leave();
    users = Math.max(0, users - 1);
    if (!users) this.fb.goOffline(this.db);
  }

  private shut() {
    for (const off of this.listeners) off();
    this.listeners = [];
    for (const off of this.relayListeners.values()) off();
    this.relayListeners.clear();
    this.revListener?.();
    this.revListener = null;
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    this.links.clear();
    window.clearInterval(this.timer);
    this.code = null;
    this.room = null;
  }

  async setMe(patch: Partial<Me>) {
    if (!this.code) return;
    const v: Record<string, unknown> = {};
    if (patch.name !== undefined) v.n = patch.name.slice(0, 16);
    if (patch.driver !== undefined) v.k = patch.driver;
    if (patch.skin !== undefined) v.sk = patch.skin;
    await this.fb.update(this.ref(`rooms/${this.code}/m/${this.me}`), v);
  }

  /** Host: starts a race a few seconds from now (`st` is the moment of GO). */
  async start(track: number, cls: number) {
    const { fb } = this;
    if (!this.code || !this.room) return;
    await fb.remove(this.ref(`rev/${this.code}`));
    await fb.update(this.ref(`rooms/${this.code}`), {
      s: "play",
      r: this.room.round + 1,
      st: this.now() + 6000,
      sd: Math.floor(Math.random() * 1e9),
      tr: track,
      cl: cls,
      u: this.now(),
      res: null,
    });
  }

  /** Host: ends the race with everyone's place, and lines up the next circuit. */
  async finish(results: Result[], nextTrack: number) {
    const { fb } = this;
    if (!this.code) return;
    await fb.update(this.ref(`rooms/${this.code}`), {
      s: "lobby",
      u: this.now(),
      tr: nextTrack,
      res: results.slice(0, MAX_PLAYERS).map((r) => ({ id: r.id, n: r.name.slice(0, 16), p: r.place, t: Math.max(0, Math.round(r.time * 100) / 100) })),
    });
    await fb.remove(this.ref(`rev/${this.code}`));
  }

  /** Host: the circuit and speed class of the next race. */
  async settings(track: number, cls: number) {
    if (!this.code) return;
    await this.fb.update(this.ref(`rooms/${this.code}`), { tr: track, cl: cls });
  }

  private onRoom(v: RawRoom | null) {
    const code = this.code;
    if (!code) return;
    if (!v || !v.m || !v.m[this.me]) {
      this.shut();
      this.handlers.room?.(null, v ? "You left the room" : "The room has closed");
      return;
    }
    const members = Object.entries(v.m)
      .map(([id, m]) => ({ id, name: String(m.n ?? "Racer"), driver: Number(m.k) || 0, skin: Number(m.sk) || 0, color: Number(m.c) || 0, joined: Number(m.j) || 0 }))
      .sort((a, b) => a.joined - b.joined || a.id.localeCompare(b.id));
    let host = v.h;
    if (!v.m[host]) {
      // The host left: the longest-standing racer takes over.
      host = members[0].id;
      if (host === this.me) void this.fb.update(this.ref(`rooms/${code}`), { h: this.me }).catch(() => {});
    }
    const raw = v.res ? (Array.isArray(v.res) ? v.res : Object.values(v.res)) : null;
    this.room = {
      code,
      host,
      pub: v.p === 1,
      state: v.s === "play" ? "play" : "lobby",
      round: v.r ?? 0,
      start: v.st ?? 0,
      seed: v.sd ?? 0,
      track: v.tr ?? 0,
      cls: v.cl ?? 1,
      members,
      results: raw ? raw.filter(Boolean).map((r) => ({ id: r.id, name: r.n, place: r.p, time: r.t })) : null,
    };
    for (const m of members) if (m.id !== this.me && !this.peers.has(m.id)) this.addPeer(m.id);
    for (const id of [...this.peers.keys()]) if (!v.m[id]) this.dropPeer(id);
    this.handlers.room?.(this.room);
  }

  // --- Player-to-player links -------------------------------------------------------------------

  private addPeer(id: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer: Peer = { id, pc, s: null, e: null, started: Date.now(), link: "connecting" };
    this.peers.set(id, peer);
    this.links.set(id, "connecting");
    pc.ondatachannel = (ev) => this.wire(peer, ev.channel);
    pc.onconnectionstatechange = () => this.updateLink(peer);
    // The player with the smaller id makes the offer, so two never cross. (Dev: `__kartsRelayOnly` tests the fallback.)
    if (this.me < id && !relayOnly()) {
      this.wire(peer, pc.createDataChannel("s", { ordered: false, maxRetransmits: 0 }));
      this.wire(peer, pc.createDataChannel("e", { ordered: true }));
      void (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        this.signal(id, "o", pc.localDescription);
      })().catch((err) => console.warn("[karts] offer", err));
    }
    window.setTimeout(() => this.updateLink(peer), DIRECT_GRACE + 100);
    this.handlers.link?.();
  }

  private dropPeer(id: string) {
    const p = this.peers.get(id);
    p?.pc.close();
    this.peers.delete(id);
    this.links.delete(id);
    this.relayListeners.get(id)?.();
    this.relayListeners.delete(id);
    this.handlers.link?.();
  }

  private wire(peer: Peer, ch: RTCDataChannel) {
    if (ch.label === "s") peer.s = ch;
    else peer.e = ch;
    ch.onopen = () => this.updateLink(peer);
    ch.onclose = () => this.updateLink(peer);
    ch.onmessage = (m) => this.receive(peer.id, ch.label, String(m.data));
  }

  private direct(p: Peer) {
    return p.s?.readyState === "open" && p.e?.readyState === "open";
  }

  private updateLink(peer: Peer) {
    if (!this.peers.has(peer.id)) return;
    const failed = peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed";
    const link: Link = this.direct(peer) ? "direct" : failed || Date.now() - peer.started > DIRECT_GRACE ? "relay" : "connecting";
    if (link !== peer.link) {
      peer.link = link;
      this.links.set(peer.id, link);
      this.handlers.link?.();
    }
    this.syncRelay();
  }

  /** Listens to the database relay for exactly the players we have no direct link with. */
  private syncRelay() {
    const { fb } = this;
    const code = this.code;
    if (!code) return;
    let any = false;
    for (const p of this.peers.values()) {
      const need = p.link === "relay";
      any ||= need;
      const on = this.relayListeners.get(p.id);
      if (need && !on) {
        this.relayListeners.set(
          p.id,
          fb.onValue(this.ref(`relay/${code}/${p.id}`), (snap) => {
            const v = snap.val();
            if (typeof v === "string") this.receive(p.id, "s", v);
          }),
        );
      } else if (!need && on) {
        on();
        this.relayListeners.delete(p.id);
      }
    }
    if (any && !this.revListener) {
      // Only events from now on (push keys are time-ordered).
      const start = fb.push(this.ref(`rev/${code}`)).key!;
      this.revListener = fb.onChildAdded(fb.query(this.ref(`rev/${code}`), fb.orderByKey(), fb.startAt(start)), (snap) => {
        const v = snap.val() as { f: string; d: string } | null;
        if (v && v.f !== this.me) this.receive(v.f, "e", v.d);
      });
    } else if (!any && this.revListener) {
      this.revListener();
      this.revListener = null;
    }
  }

  private signal(to: string, y: "o" | "a", desc: RTCSessionDescription | null) {
    if (!this.code || !desc) return;
    void this.fb.push(this.ref(`sig/${this.code}/${to}`), { f: this.me, y, d: JSON.stringify(desc) }).catch(() => {});
  }

  private async onSignal(v: { f: string; y: string; d: string }) {
    if (!this.room?.members.some((m) => m.id === v.f) || relayOnly()) return;
    if (!this.peers.has(v.f)) this.addPeer(v.f);
    const pc = this.peers.get(v.f)!.pc;
    const desc = JSON.parse(v.d) as RTCSessionDescriptionInit;
    if (v.y === "o") {
      await pc.setRemoteDescription(desc);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      this.signal(v.f, "a", pc.localDescription);
    } else if (v.y === "a" && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(desc);
  }

  private receive(from: string, label: string, data: string) {
    try {
      if (label === "s") this.handlers.state?.(from, JSON.parse(data) as number[]);
      else {
        const e = JSON.parse(data) as KartNetEvent & { i: string };
        if (this.seen.has(e.i)) return;
        this.seen.add(e.i);
        if (this.seen.size > 4000) this.seen.clear();
        this.handlers.event?.(from, e);
      }
    } catch {
      // A garbled message: ignore it.
    }
  }

  /** Your kart's state to every player (direct, or through the relay at a few per second). */
  sendState(s: number[]) {
    const msg = JSON.stringify(s);
    let relay = false;
    for (const p of this.peers.values()) {
      if (this.direct(p)) {
        try {
          p.s!.send(msg);
        } catch {
          relay = true;
        }
      } else if (p.link === "relay") relay = true;
    }
    const now = Date.now();
    if (relay && this.code && now - this.lastRelay > 250) {
      this.lastRelay = now;
      void this.fb.set(this.ref(`relay/${this.code}/${this.me}`), msg).catch(() => {});
    }
  }

  sendEvent(e: KartNetEvent) {
    const msg = JSON.stringify({ ...e, i: `${this.me}.${++this.seq}` });
    let relay = false;
    for (const p of this.peers.values()) {
      if (this.direct(p)) {
        try {
          p.e!.send(msg);
        } catch {
          relay = true;
        }
      } else if (p.link === "relay") relay = true;
    }
    if (relay && this.code) void this.fb.push(this.ref(`rev/${this.code}`), { f: this.me, d: msg }).catch(() => {});
  }
}
