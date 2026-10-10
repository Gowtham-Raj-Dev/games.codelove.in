"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import backdrops from "@/data/game-backdrops.json";
import { asset } from "@/lib/asset";
import type { GameEntry } from "@/lib/games";
import type { LoadProgress } from "./assets";
import { loadingLook, type TitleLook } from "./loaders";

/**
 * Every game's loading screen: its backdrop drifting under a tinted sky with drifting particles, a
 * logo with an emblem medal and a ribbon, a tip card, the game's own progress bar (shared/loaders.tsx)
 * and status lines — real byte progress. Three layouts, picked by CSS so the right one is in the
 * first HTML (before any script runs): desktop, phones held sideways (and the Android app), and
 * phones held upright. Everything that moves animates transform or opacity only, so it stays smooth
 * while the models parse. Pass `ready` once the game is up: the screen fades away over it.
 */

// Particles rising from the bottom: left %, size px, seconds per rise, head start s, sideways drift px.
const SPARKS = [
  [4, 3, 10, 5, 12],
  [8, 4, 9, 1, 20],
  [14, 3, 11, 6, -14],
  [19, 3, 14, 11, 18],
  [23, 5, 8, 3, 10],
  [30, 3, 12, 9, -22],
  [37, 4, 10, 2, 16],
  [42, 3, 15, 12, -20],
  [47, 6, 9, 7, -8],
  [53, 3, 13, 4, 24],
  [59, 4, 8, 0, -18],
  [63, 3, 14, 10, 14],
  [68, 5, 11, 5, 12],
  [74, 3, 9, 8, -10],
  [80, 4, 12, 1, 22],
  [85, 4, 13, 12, -12],
  [90, 6, 10, 6, -16],
  [96, 3, 8, 3, 8],
] as const;

// Clouds drifting across the sky: top %, width vmax, seconds per crossing, head start s.
const CLOUDS = [
  [3, 38, 95, 20],
  [15, 28, 70, 52],
  [27, 34, 120, 95],
] as const;

/** Width (in logo ems) the longest word may take: fits a phone held upright with room to spare. */
const FIT = 19;

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

/**
 * Full-quality backdrop rendered by the game itself (scripts/capture-backdrops.mjs): a tall one for
 * screens held upright, a wide one for the rest. The cover stays as the fallback.
 */
function Backdrop({ game }: { game: GameEntry }) {
  const art = (file: string) => asset(`/games/${game.slug}/backdrop-${file}.webp`);
  return (
    <picture>
      {backdrops.includes(game.slug) && (
        <>
          <source media="(orientation: portrait)" srcSet={`${art("tall-1170")} 1170w`} sizes="100vw" />
          <source srcSet={`${art("wide-1920")} 1920w, ${art("wide-2560")} 2560w`} sizes="100vw" />
        </>
      )}
      <img src={asset(game.cover)} alt="" decoding="async" fetchPriority="high" className="lg-art" />
    </picture>
  );
}

/** One game's colours for the shared stylesheet below. */
function titleVars(shade: string, t: TitleLook): CSSProperties {
  const [sky, low] = t.sky;
  return {
    "--lg-shade-d": `linear-gradient(180deg,${shade}f2 0%,${sky}b3 18%,${low}40 34%,#0000 50%,#0000 58%,${shade}99 76%,${shade}f5 100%),radial-gradient(ellipse 110% 85% at 50% 45%,#0000 50%,${shade}a6 100%)`,
    "--lg-shade-l": `linear-gradient(180deg,${shade}e6 0%,${sky}99 22%,${low}26 42%,#0000 55%,${shade}8c 74%,${shade}f2 100%),radial-gradient(ellipse 110% 90% at 50% 45%,#0000 55%,${shade}99 100%)`,
    "--lg-shade-p": `linear-gradient(180deg,${shade}f2 0%,${sky}b3 14%,${low}4d 30%,#0000 44%,#0000 60%,${shade}a6 75%,${shade}f7 100%),radial-gradient(ellipse 130% 80% at 50% 45%,#0000 50%,${shade}99 100%)`,
    "--lg-text-shadow": `0 2px 0 ${shade}, 0 0 10px #000`,
    "--lg-halo": `radial-gradient(closest-side,${t.glow}73,${t.glow}26 55%,${t.glow}00)`,
    "--lg-rays": `repeating-conic-gradient(${t.glow}66 0 6deg,${t.glow}00 6deg 18deg)`,
    "--lg-rays-o": t.rays,
    "--lg-spark": `radial-gradient(circle,#fff 20%,${t.spark} 60%,${t.spark}00 72%)`,
    "--lg-spark-glow": `${t.spark}aa`,
    "--lg-top": `linear-gradient(180deg,${t.top})`,
    "--lg-main": `linear-gradient(180deg,${t.main})`,
    "--lg-outline": t.outline,
    "--lg-stroke": `${t.stroke}em`,
    "--lg-depth": t.depth ?? `drop-shadow(0 .3em 0 ${t.outline}) drop-shadow(0 .7em .8em #000b)`,
    "--lg-tilt": `${t.tilt ?? 0}deg`,
    "--lg-medal-bg": t.medal.bg,
    "--lg-medal-icon": t.medal.icon,
    "--lg-medal-ring": t.medal.ring,
    "--lg-medal-shadow": t.medal.glow
      ? `0 0 .5em ${t.medal.glow},inset 0 0 .45em ${t.medal.glow}88`
      : `inset 0 -.28em 0 #00000033,inset 0 .2em 0 #fff9,0 .25em 0 ${t.medal.ring},0 .6em 1em #0009`,
    "--lg-ribbon-bg": t.ribbon.bg,
    "--lg-ribbon-text": t.ribbon.text,
    "--lg-ribbon-edge": t.ribbon.edge,
    "--lg-ribbon-shadow": t.ribbon.shadow ?? `0 .12em 0 ${t.ribbon.edge}`,
    "--lg-ribbon-depth": t.ribbon.depth ?? `drop-shadow(0 .16em 0 ${t.outline}) drop-shadow(0 .4em .5em #0008)`,
  } as CSSProperties;
}

export function LoadingScreen({ game, progress, error, ready = false }: { game: GameEntry; progress: LoadProgress | null; error: string | null; ready?: boolean }) {
  const look = loadingLook(game.slug);
  const t = look.title;
  const tips = t.tips ?? [game.tagline];
  const vars = useMemo(() => titleVars(look.shade, t), [look.shade, t]);
  const [tip, setTip] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (tips.length < 2) return;
    const id = setInterval(() => setTip((n) => (n + 1) % tips.length), 5200);
    return () => clearInterval(id);
  }, [tips.length]);
  // The game is up: fade out over it, then leave the page.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setGone(true), 1200);
    return () => clearTimeout(id);
  }, [ready]);
  if (gone) return null;

  const pct = ready ? 100 : Math.min(100, Math.round((progress?.ratio ?? 0) * 100));
  const { lines, Bar, Fx } = look;
  const status = ready ? "Ready!" : lines[Math.min(lines.length - 1, Math.floor((pct / 100) * lines.length))];
  // A small first word over a big last word; long words shrink so they fit a phone held upright.
  const words = game.title.split(" ");
  const split = !t.oneLine && words.length > 1;
  const main = split ? words[words.length - 1] : game.title;
  const top = split ? words.slice(0, -1).join(" ") : "";
  const size = (text: string, base: number) => `${Math.min(base, FIT / (text.length * t.charW)).toFixed(2)}em`;
  const Emblem = t.emblem;
  return (
    <div data-bleed className={`g-loading lg ${ready ? "is-ready" : ""}`} style={look.ink ? { ...vars, color: look.ink } : vars} aria-busy={!ready}>
      <style>{CSS}</style>
      {!game.comingSoon && <Backdrop game={game} />}
      <div className="lg-shade" />
      {Fx && <Fx />}
      {t.clouds && (
        <div className="lg-sky" aria-hidden>
          {CLOUDS.map(([at, w, d, dl]) => (
            <i key={at} style={{ top: `${at}%`, width: `${w}vmax`, height: `${w * 0.3}vmax`, "--d": `${d}s`, "--dl": `-${dl}s` } as CSSProperties} />
          ))}
        </div>
      )}
      <div className="lg-sparks" aria-hidden>
        {SPARKS.map(([x, s, d, dl, dx]) => (
          <i key={x} style={{ left: `${x}%`, width: s, height: s, "--d": `${d}s`, "--dl": `-${dl}s`, "--dx": `${dx}px` } as CSSProperties} />
        ))}
      </div>

      <div className="lg-stage">
        {/* The page's h1 already names the game for screen readers. */}
        <div className="lg-logo" aria-hidden>
          {t.rays > 0 && <span className="lg-rays" />}
          <span className="lg-medal">
            <Emblem strokeWidth={2.4} />
          </span>
          <span className="lg-words">
            {top && (
              <span className="lg-word lg-top" data-text={top} style={{ fontSize: size(top, 3.3) }}>
                {top}
              </span>
            )}
            <span className="lg-word lg-main" data-text={main} style={{ fontSize: size(main, 6.8) }}>
              {main}
            </span>
          </span>
          <span className="lg-ribbon-wrap">
            <span className="lg-ribbon">{t.motto}</span>
          </span>
          <i className="lg-star" style={{ left: "6%", top: "44%" }} />
          <i className="lg-star" style={{ right: "4%", top: "60%", animationDelay: "-1.4s" }} />
          <i className="lg-star" style={{ left: "28%", top: "6%", animationDelay: "-2.8s" }} />
        </div>

        <div className="lg-foot">
          {error ? (
            <>
              <div className="g-panel lg-tip">
                <span className="lg-tag is-error">Oops</span>
                <span className="lg-tip-text">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="g-soft lg-retry flex items-center justify-center px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="g-unskew gap-2">
                  <RotateCcw className="size-4" />
                  Reload
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="g-panel lg-tip">
                <span className="lg-tag">Tip</span>
                <span key={tip} className="lg-tip-text">
                  {tips[tip % tips.length]}
                </span>
              </div>
              <div className="lg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Loading ${game.title}`}>
                <Bar pct={pct} />
              </div>
              <div className="g-display lg-status">
                <span key={status} className="lg-line">
                  {status}
                </span>
                <span className="lg-num">
                  {progress && !ready && (
                    <span className="lg-mb">
                      {mb(progress.loadedBytes)} / {mb(progress.totalBytes)} MB
                    </span>
                  )}
                  {!look.ownPct && <span>{pct}%</span>}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Desktop first; then phones held sideways (same query as PHONE_LANDSCAPE in ui.tsx), then upright. */
const CSS = `
.lg{position:absolute;inset:0;overflow:hidden;line-height:1.3;transition:opacity .75s ease .35s,visibility 0s 1.1s}
.lg.is-ready{z-index:50;opacity:0;visibility:hidden;pointer-events:none}
.lg-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.04)}
.lg-shade{position:absolute;inset:0;background:var(--lg-shade-d)}
.lg-sky,.lg-sparks{position:absolute;inset:0;display:none;pointer-events:none}
.lg-sky i{position:absolute;left:0;opacity:.2;background:radial-gradient(closest-side,#fff,#fff0) 0 70%/45% 75% no-repeat,radial-gradient(closest-side,#fff,#fff0) 45% 15%/52% 100% no-repeat,radial-gradient(closest-side,#fff,#fff0) 100% 75%/45% 70% no-repeat}
.lg-sparks i{position:absolute;bottom:-12px;border-radius:50%;opacity:0;background:var(--lg-spark);box-shadow:0 0 8px 1px var(--lg-spark-glow)}

.lg-stage{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;padding:max(8vh,env(safe-area-inset-top)) max(28px,env(safe-area-inset-right)) max(5.5vh,env(safe-area-inset-bottom)) max(28px,env(safe-area-inset-left));transition:transform 1.1s ease}
.lg.is-ready .lg-stage{transform:scale(1.035)}

.lg-logo{position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:center;font-family:var(--game-display),var(--game-body),ui-sans-serif,sans-serif;font-size:clamp(13px,min(1.55vw,2.5vh),26px);line-height:.9;text-transform:var(--g-case);font-style:var(--g-italic);letter-spacing:var(--g-tracking)}
.lg-logo::before{content:"";position:absolute;z-index:-1;left:50%;top:56%;width:26em;height:16em;margin:-8em 0 0 -13em;background:var(--lg-halo)}
.lg-rays{position:absolute;z-index:-2;left:50%;top:56%;width:34em;height:34em;margin:-17em 0 0 -17em;border-radius:50%;opacity:var(--lg-rays-o);background:var(--lg-rays);-webkit-mask:radial-gradient(closest-side,#000 18%,#0000);mask:radial-gradient(closest-side,#000 18%,#0000)}
.lg-medal{position:relative;z-index:1;display:grid;place-items:center;width:3.6em;height:3.6em;margin-bottom:-.7em;border-radius:50%;color:var(--lg-medal-icon);background:var(--lg-medal-bg);border:.2em solid var(--lg-medal-ring);box-shadow:var(--lg-medal-shadow)}
.lg-medal svg{width:58%;height:58%}
.lg-words{display:flex;flex-direction:column;align-items:center;transform:rotate(var(--lg-tilt));filter:var(--lg-depth)}
.lg-word{position:relative;display:block;white-space:nowrap;color:var(--lg-outline);-webkit-text-stroke:var(--lg-stroke) var(--lg-outline)}
.lg-word::after{content:attr(data-text);position:absolute;left:0;top:0;color:#0000;-webkit-text-stroke:0;-webkit-background-clip:text;background-clip:text}
.lg-top::after{background-image:var(--lg-top)}
.lg-main{margin-top:-.06em}
.lg-main::after{background-image:var(--lg-main)}
.lg-ribbon-wrap{display:block;margin-top:1.1em;filter:var(--lg-ribbon-depth)}
.lg-ribbon{display:block;padding:.5em 2.2em .55em;font-family:var(--g-ui-font,var(--game-display)),var(--game-body),ui-sans-serif,sans-serif;font-size:1.15em;font-style:normal;line-height:1;letter-spacing:.08em;white-space:nowrap;color:var(--lg-ribbon-text);text-shadow:var(--lg-ribbon-shadow);background:var(--lg-ribbon-bg);box-shadow:inset 0 .16em 0 #ffffff59,inset 0 -.2em 0 var(--lg-ribbon-edge);clip-path:polygon(0 0,100% 0,calc(100% - .9em) 50%,100% 100%,0 100%,.9em 50%)}
.lg-star{position:absolute;z-index:2;width:1.6em;height:1.6em;opacity:0;background:radial-gradient(circle,#fff 30%,#fde68a 62%);clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}

.lg-foot{width:min(100%,700px);display:flex;flex-direction:column;gap:16px}
.lg-tip{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 16px 10px 10px;text-align:left;font-size:15px;line-height:1.3}
.lg-tag{flex:none;padding:4px 10px 5px;font-family:var(--g-ui-font,var(--game-display)),var(--game-body),ui-sans-serif,sans-serif;font-size:15px;font-weight:700;line-height:1.1;letter-spacing:.04em;text-transform:var(--g-case);color:var(--g-btn-text);text-shadow:var(--g-btn-text-shadow);background:var(--g-btn);border:var(--g-btn-border);border-radius:calc(var(--g-btn-radius) * .65);box-shadow:var(--g-btn-shadow-pressed);transform:skewX(var(--g-skew))}
.lg-tag.is-error{color:#fff;text-shadow:0 2px 0 #7f1d1d;background:linear-gradient(180deg,#fca5a5,#dc2626);border:2px solid #7f1d1d;box-shadow:inset 0 -3px 0 #b91c1c}
.lg-tip-text{min-width:0}
.lg-retry{width:200px;align-self:center}
.lg-status{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:0 4px;font-size:16px;text-shadow:var(--lg-text-shadow)}
.lg-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lg-num{display:flex;flex:none;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums}
.lg-mb{font-size:.85em;opacity:.75}

@media (orientation:landscape) and (max-height:540px){
  .lg-shade{background:var(--lg-shade-l)}
  .lg-stage{padding:max(10px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
  .lg-logo{font-size:clamp(8px,2.9vh,14px)}
  .lg-ribbon-wrap{margin-top:.7em}
  .lg-foot{width:min(100%,620px);gap:8px}
  .lg-tip{min-height:0;gap:8px;padding:5px 12px 5px 6px;font-size:12px}
  .lg-tag{padding:2px 7px 3px;font-size:11px}
  .lg-retry{width:160px;padding-block:6px}
  .lg-bar{zoom:.72}
  .lg-status{font-size:12px}
}

@media (orientation:portrait){
  .lg-shade{background:var(--lg-shade-p)}
  .lg-stage{padding:max(10vh,calc(env(safe-area-inset-top) + 28px)) max(16px,env(safe-area-inset-right)) max(4.5vh,calc(env(safe-area-inset-bottom) + 16px)) max(16px,env(safe-area-inset-left))}
  .lg-logo{font-size:min(4.1vw,2.3vh,24px)}
  .lg-rays{width:40em;height:40em;margin:-20em 0 0 -20em}
  .lg-foot{width:min(100%,560px);gap:14px}
  .lg-tip{font-size:14px;padding:10px 14px 10px 10px}
}

@media (prefers-reduced-motion:no-preference){
  .lg-sky,.lg-sparks{display:block}
  .lg-art{animation:lg-pan 42s ease-in-out infinite alternate}
  .lg-sky i{animation:lg-drift var(--d) linear var(--dl) infinite}
  .lg-sparks i{animation:lg-rise var(--d) linear var(--dl) infinite}
  .lg-rays{animation:lg-spin 70s linear infinite}
  .lg-logo{animation:lg-pop .9s cubic-bezier(.2,1.4,.4,1) both}
  .lg-medal{animation:lg-bob 3.2s ease-in-out infinite}
  .lg-star{animation:lg-twinkle 4.2s ease-in-out infinite}
  .lg-tip-text,.lg-line{animation:lg-fade .45s ease both}
}
@keyframes lg-pan{from{transform:scale(1.04)}to{transform:scale(1.13) translate(-1.6%,-1.2%)}}
@keyframes lg-drift{from{transform:translateX(-40vmax)}to{transform:translateX(100vw)}}
@keyframes lg-rise{0%{transform:translate(0,0);opacity:0}12%{opacity:.95}75%{opacity:.75}100%{transform:translate(var(--dx),-70vh);opacity:0}}
@keyframes lg-spin{to{transform:rotate(1turn)}}
@keyframes lg-pop{0%{opacity:0;transform:translateY(-24px) scale(.82)}60%{opacity:1;transform:translateY(4px) scale(1.04)}100%{opacity:1;transform:none}}
@keyframes lg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.2em)}}
@keyframes lg-twinkle{0%,62%,100%{transform:scale(0) rotate(0);opacity:0}74%{transform:scale(1) rotate(45deg);opacity:1}86%{transform:scale(.3) rotate(90deg);opacity:.5}}
@keyframes lg-fade{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
`;
