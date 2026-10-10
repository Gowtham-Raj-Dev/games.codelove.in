import { asset } from "@/lib/asset";
import { audio } from "../shared/audio";

/**
 * Kingdom Clash's soundtrack: recorded orchestral / folk music (Kevin MacLeod, incompetech.com,
 * CC BY 4.0 — credited in the manifest) instead of the shared synth songs. The MP3s live in
 * public/games/kingdom-clash/music/ (packed into the Android app too).
 *
 * Each track is fetched once into a blob and streamed by an <audio> element routed through the
 * shared audio hub's music bus, so the music switch and the limiter apply. Streaming keeps memory
 * low (a decoded AudioBuffer of a 3-minute song would be ~70 MB). The village and battle playlists
 * cross-fade into each other; each playlist goes on with its next song the next time it plays.
 */

export interface Track {
  title: string;
  file: string;
  /** Level on the music bus (the files are all normalised to -16 LUFS). */
  gain?: number;
}

export const PLAYLISTS = {
  village: [
    { title: "Thatched Villagers", file: "thatched-villagers.mp3" },
    { title: "Master of the Feast", file: "master-of-the-feast.mp3" },
  ],
  battle: [
    { title: "Clash Defiant", file: "clash-defiant.mp3" },
    { title: "Five Armies", file: "five-armies.mp3" },
  ],
} satisfies Record<string, Track[]>;

export type Playlist = keyof typeof PLAYLISTS;

const DIR = "/games/kingdom-clash/music/";
const FADE_IN = 0.35;
const DUCK = 0.3;

interface Voice {
  track: Track;
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode;
  gain: GainNode;
}

class Soundtrack {
  private playlist: Playlist | null = null;
  private readonly next = new Map<Playlist, number>();
  private voice: Voice | null = null;
  /** Bumped by every play / stop: a song still loading for an older request is dropped. */
  private token = 0;
  private ducked = false;
  private held = false;
  private hidden = false;
  private readonly blobs = new Map<string, Promise<string>>();
  private listening = false;

  /** Starts a playlist (cross-fading from the current one); the same playlist keeps playing. */
  play(playlist: Playlist) {
    this.listen();
    if (this.playlist === playlist) return;
    this.playlist = playlist;
    const token = ++this.token;
    this.fadeOut(0.9);
    audio.onUnlock(() => {
      if (token === this.token) void this.start(token);
    });
  }

  /** Fades the music out (battle results: the victory or defeat fanfare plays alone). */
  stop(fade = 0.8) {
    this.playlist = null;
    this.token++;
    this.fadeOut(fade);
  }

  /** Softens the music (pause screen) without stopping it. */
  duck(on: boolean) {
    this.ducked = on;
    const v = this.voice;
    const { ctx } = audio;
    if (v && ctx) v.gain.gain.setTargetAtTime(this.level(v.track), ctx.currentTime, 0.15);
  }

  /** The Android app in the background: pause the song (the AudioContext is suspended too). */
  hold(on: boolean) {
    this.held = on;
    this.sync();
  }

  /** Downloads a playlist's next song ahead of time (opening the campaign → the battle music is ready). */
  preload(playlist: Playlist) {
    const list = PLAYLISTS[playlist];
    void this.load(list[(this.next.get(playlist) ?? 0) % list.length]).catch(() => {});
  }

  private level(track: Track) {
    return (track.gain ?? 1) * (this.ducked ? DUCK : 1);
  }

  /** Plays only while music is on, the page is visible and the app is in front. */
  private wanted() {
    return audio.getSettings().music && !this.held && !this.hidden;
  }

  private listen() {
    if (this.listening || typeof document === "undefined") return;
    this.listening = true;
    audio.subscribe(() => this.sync());
    this.hidden = document.hidden;
    document.addEventListener("visibilitychange", () => {
      this.hidden = document.hidden;
      this.sync();
    });
  }

  private sync() {
    const el = this.voice?.el;
    if (!el) return;
    if (this.wanted()) {
      if (el.paused) this.resume(el);
    } else if (!el.paused) el.pause();
  }

  private resume(el: HTMLAudioElement) {
    el.play().catch(() => {
      // Autoplay blocked (iOS Safari outside a tap): start on the next tap or key press.
      const retry = () => {
        window.removeEventListener("pointerdown", retry);
        window.removeEventListener("keydown", retry);
        if (this.voice?.el === el && this.wanted()) void el.play().catch(() => {});
      };
      window.addEventListener("pointerdown", retry);
      window.addEventListener("keydown", retry);
    });
  }

  private load(track: Track) {
    let url = this.blobs.get(track.file);
    if (!url) {
      url = fetch(asset(DIR + track.file))
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${track.file}`);
          return res.blob();
        })
        .then((blob) => URL.createObjectURL(blob));
      this.blobs.set(track.file, url);
      url.catch(() => this.blobs.delete(track.file));
    }
    return url;
  }

  private async start(token: number, attempts = 0) {
    const playlist = this.playlist;
    const { ctx } = audio;
    if (!playlist || !ctx) return;
    const list: Track[] = PLAYLISTS[playlist];
    const i = (this.next.get(playlist) ?? 0) % list.length;
    this.next.set(playlist, i + 1);
    const track = list[i];
    let url: string;
    try {
      url = await this.load(track);
    } catch (err) {
      console.warn("[kingdom-clash] music failed to load", err);
      if (token === this.token && attempts < list.length - 1) void this.start(token, attempts + 1);
      return;
    }
    if (token !== this.token) return;

    const el = new Audio();
    el.preload = "auto";
    el.src = url;
    // One song in the playlist loops; otherwise the next one follows.
    el.loop = list.length === 1;
    el.addEventListener("ended", () => {
      if (this.voice?.el === el && token === this.token) {
        this.fadeOut(0);
        void this.start(token);
      }
    });
    const node = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain).connect(audio.musicBus);
    gain.gain.setTargetAtTime(this.level(track), ctx.currentTime, FADE_IN);
    this.voice = { track, el, node, gain };
    if (this.wanted()) this.resume(el);
    if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: "Kevin MacLeod", album: "Kingdom Clash" });
    }
  }

  private fadeOut(seconds: number) {
    const v = this.voice;
    this.voice = null;
    if (!v) return;
    const { ctx } = audio;
    const release = () => {
      v.el.pause();
      v.node.disconnect();
      v.gain.disconnect();
      v.el.removeAttribute("src");
      v.el.load();
    };
    if (!ctx || seconds <= 0 || v.el.paused) return release();
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(v.gain.gain.value, ctx.currentTime);
    v.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    setTimeout(release, seconds * 1000 + 100);
  }
}

/** The game's one soundtrack player. */
export const soundtrack = new Soundtrack();
