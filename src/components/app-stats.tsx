"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { open, SKIP_HOSTS, useDownloadCount } from "@/components/apk-downloads";

/**
 * Downloads and star ratings for a game's Android app, Play Store style. Ratings are stars only (no comments): the
 * database keeps one counter per star (ratings/<slug>/s1..s5), and each phone remembers its own rating so it can change
 * it later (one counter down, the other up) instead of rating twice.
 */
type Counts = Record<1 | 2 | 3 | 4 | 5, number>;
const STARS = [1, 2, 3, 4, 5] as const;
const EMPTY: Counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

async function readRatings(slug: string): Promise<Counts | null> {
  try {
    const { fb, db } = await open();
    const val = (await fb.get(fb.ref(db, `ratings/${slug}`))).val() ?? {};
    const counts = { ...EMPTY };
    for (const s of STARS) counts[s] = Math.max(0, Number(val[`s${s}`]) || 0);
    return counts;
  } catch {
    return null;
  }
}

async function saveRating(slug: string, stars: number, previous: number | null): Promise<boolean> {
  try {
    const { fb, db } = await open();
    const change: Record<string, object> = { [`s${stars}`]: fb.increment(1) };
    if (previous) change[`s${previous}`] = fb.increment(-1);
    await fb.update(fb.ref(db, `ratings/${slug}`), change);
    return true;
  } catch {
    return false;
  }
}

function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="relative inline-flex" aria-hidden>
      <span className="flex text-line-strong">
        {STARS.map((s) => (
          <Star key={s} className={`${size} fill-current`} />
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-amber-400" style={{ width: `${(value / 5) * 100}%` }}>
        {STARS.map((s) => (
          <Star key={s} className={`${size} shrink-0 fill-current`} />
        ))}
      </span>
    </span>
  );
}

export function AppStats({ slug, title }: { slug: string; title: string }) {
  const downloads = useDownloadCount(slug);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const key = `rating:${slug}`;

  useEffect(() => {
    let live = true;
    void readRatings(slug).then((c) => {
      if (!live) return;
      setCounts(c);
      try {
        const saved = Number(localStorage.getItem(key));
        if (saved >= 1 && saved <= 5) setMine(saved);
      } catch {
        /* storage blocked */
      }
    });
    return () => {
      live = false;
    };
  }, [slug, key]);

  const total = counts ? STARS.reduce((n, s) => n + counts[s], 0) : 0;
  const average = counts && total ? STARS.reduce((n, s) => n + s * counts[s], 0) / total : 0;

  async function rate(stars: number) {
    if (saving || stars === mine) return;
    setSaving(true);
    const ok = SKIP_HOSTS.has(location.hostname) || (await saveRating(slug, stars, mine));
    if (ok) {
      setCounts((c) => {
        const next = { ...(c ?? EMPTY) };
        next[stars as keyof Counts] += 1;
        if (mine) next[mine as keyof Counts] = Math.max(0, next[mine as keyof Counts] - 1);
        return next;
      });
      setMine(stars);
      try {
        localStorage.setItem(key, String(stars));
      } catch {
        /* ignore */
      }
    }
    setSaving(false);
  }

  const shown = hover || mine || 0;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <dl className="grid grid-cols-2 divide-x divide-line text-center">
        <div>
          <dt className="sr-only">Rating</dt>
          <dd className="flex items-center justify-center gap-1 text-lg font-bold text-fg">
            {total ? average.toFixed(1) : "–"} <Star className="size-4 fill-amber-400 text-amber-400" />
          </dd>
          <dd className="text-xs text-subtle">
            {counts === null ? "Ratings" : total ? `${total.toLocaleString("en-IN")} ${total === 1 ? "rating" : "ratings"}` : "No ratings yet"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Downloads</dt>
          <dd className="text-lg font-bold text-fg">{downloads === null ? "–" : downloads.toLocaleString("en-IN")}</dd>
          <dd className="text-xs text-subtle">{downloads === 1 ? "Download" : "Downloads"}</dd>
        </div>
      </dl>

      {total > 0 && counts && (
        <div className="mt-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-fg">{average.toFixed(1)}</p>
            <StarRow value={average} size="size-3" />
          </div>
          <ul className="flex-1 space-y-1">
            {[...STARS].reverse().map((s) => (
              <li key={s} className="flex items-center gap-2 text-[11px] text-subtle">
                <span className="w-2 text-right">{s}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(counts[s] / total) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{mine ? "Your rating — tap to change" : `Rate ${title}`}</p>
        <div className="flex" role="radiogroup" aria-label={`Rate ${title}`} onMouseLeave={() => setHover(0)}>
          {STARS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={mine === s}
              aria-label={`${s} ${s === 1 ? "star" : "stars"}`}
              disabled={saving}
              onMouseEnter={() => setHover(s)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(0)}
              onClick={() => void rate(s)}
              className="p-1 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            >
              <Star className={`size-6 ${s <= shown ? "fill-amber-400 text-amber-400" : "text-line-strong"}`} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
