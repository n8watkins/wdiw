import type { SearchHistoryEntry } from "../types";

/**
 * Pure analytics helpers for the Shorts / doom-scroll feature (Step 7, Part C).
 * No chrome.* / React and no `Date.now()` reliance — time is read off each
 * entry's stored `createdAt` so the logic is deterministic and unit-testable
 * (matching the pure-helper style of stats.ts / dashboards.ts).
 *
 * The signal: YouTube Shorts (`isShort === true`) are the algorithm's
 * infinite-feed surface. These helpers surface how that feed pulls on the user —
 * back-to-back "doom-scroll" runs, the channels it keeps serving, and the
 * Shorts-vs-long-form time split.
 */

/** A maximal run of back-to-back Shorts (a "doom-scroll" session). */
export type DoomScrollSession = {
  /** ISO of the earliest Short in the run. */
  startedAt: string;
  /** ISO of the latest Short in the run. */
  endedAt: string;
  /** Number of Shorts in the run. */
  count: number;
  /** Σ watchedSeconds across the run (missing → 0). */
  seconds: number;
};

/** Default gap (minutes) that separates one doom-scroll run from the next. */
const DEFAULT_GAP_MINUTES = 3;

/** A Short entry paired with its parsed createdAt epoch (ms), for grouping. */
type DatedShort = { entry: SearchHistoryEntry; ms: number };

/**
 * Group watched Shorts into doom-scroll sessions: a maximal run of Shorts where
 * each consecutive Short STARTED within `gapMinutes` of the previous one; a
 * larger gap starts a new session.
 *
 * Only entries with `isShort === true` are considered; non-Shorts and entries
 * with an unparseable/missing `createdAt` (`new Date(...).getTime()` → NaN) are
 * ignored. Shorts are sorted ascending by `createdAt` internally for grouping,
 * but sessions are returned newest-first (most recent run first). The input
 * array is not mutated (it's copied before sorting). `gapMinutes` default = 3.
 */
export function doomScrollSessions(
  history: SearchHistoryEntry[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): DoomScrollSession[] {
  const shorts: DatedShort[] = [];
  for (const entry of history) {
    if (entry.isShort !== true) continue;
    const ms = new Date(entry.createdAt).getTime();
    if (Number.isNaN(ms)) continue;
    shorts.push({ entry, ms });
  }
  if (shorts.length === 0) return [];

  // Sort ascending by createdAt without mutating the caller's array.
  shorts.sort((a, b) => a.ms - b.ms);

  const gapMs = gapMinutes * 60_000;
  const sessions: DoomScrollSession[] = [];

  let runStart = shorts[0]!;
  let runEnd = shorts[0]!;
  let count = 1;
  let seconds = shorts[0]!.entry.watchedSeconds ?? 0;

  const flush = (): void => {
    sessions.push({
      startedAt: runStart.entry.createdAt,
      endedAt: runEnd.entry.createdAt,
      count,
      seconds,
    });
  };

  for (let i = 1; i < shorts.length; i++) {
    const cur = shorts[i]!;
    const prev = shorts[i - 1]!;
    if (cur.ms - prev.ms > gapMs) {
      // Gap exceeded → close the current run and open a new one.
      flush();
      runStart = cur;
      count = 1;
      seconds = cur.entry.watchedSeconds ?? 0;
    } else {
      count++;
      seconds += cur.entry.watchedSeconds ?? 0;
    }
    runEnd = cur;
  }
  flush();

  // Return newest-first (most recent session first).
  return sessions.reverse();
}

/**
 * The biggest doom-scroll session by `count` (ties broken by `seconds`), or
 * `null` when there are none.
 */
export function longestDoomScroll(
  sessions: DoomScrollSession[],
): DoomScrollSession | null {
  let best: DoomScrollSession | null = null;
  for (const s of sessions) {
    if (
      best === null ||
      s.count > best.count ||
      (s.count === best.count && s.seconds > best.seconds)
    ) {
      best = s;
    }
  }
  return best;
}

/** Shorts watch-totals for a single channel. */
export type ShortsChannelStat = {
  channel: string;
  shortsCount: number;
  shortsSeconds: number;
};

/**
 * "Channels the algorithm keeps feeding you": Shorts grouped by channel, ranked
 * by `shortsCount` desc, then `shortsSeconds` desc. Entries without a channel or
 * without `isShort` are dropped. `limit` default = 5.
 */
export function algorithmFeedChannels(
  history: SearchHistoryEntry[],
  limit: number = 5,
): ShortsChannelStat[] {
  const byChannel = new Map<string, ShortsChannelStat>();
  for (const entry of history) {
    if (entry.isShort !== true) continue;
    const channel = entry.channel;
    if (!channel) continue;
    const stat = byChannel.get(channel) ?? {
      channel,
      shortsCount: 0,
      shortsSeconds: 0,
    };
    stat.shortsCount++;
    stat.shortsSeconds += entry.watchedSeconds ?? 0;
    byChannel.set(channel, stat);
  }

  return [...byChannel.values()]
    .sort(
      (a, b) =>
        b.shortsCount - a.shortsCount || b.shortsSeconds - a.shortsSeconds,
    )
    .slice(0, limit);
}

/** Shorts-vs-long-form watch totals (seconds + entry counts). */
export type KindSplit = {
  shortsSeconds: number;
  shortsCount: number;
  longSeconds: number;
  longCount: number;
};

/**
 * Split a watch log into Shorts vs long-form totals. `seconds` = Σ
 * watchedSeconds (missing → 0). A "long" entry is any entry that is not
 * `isShort`. Counts are the number of entries in each bucket.
 */
export function shortsVsLong(history: SearchHistoryEntry[]): KindSplit {
  const split: KindSplit = {
    shortsSeconds: 0,
    shortsCount: 0,
    longSeconds: 0,
    longCount: 0,
  };
  for (const entry of history) {
    const seconds = entry.watchedSeconds ?? 0;
    if (entry.isShort === true) {
      split.shortsCount++;
      split.shortsSeconds += seconds;
    } else {
      split.longCount++;
      split.longSeconds += seconds;
    }
  }
  return split;
}

// ---------------------------------------------------------------------------
// Doom-scroll nudge / daily Shorts limit (Step 7-E)
// ---------------------------------------------------------------------------

export type ShortsLimitLevel = "off" | "ok" | "warn" | "over";

/** Today's Shorts usage vs the configured daily limit — drives the toolbar badge
 *  and the popup nudge banner. Pure so it can be unit-tested and shared by both. */
export type ShortsLimitStatus = {
  /** "off" when no limit is set; otherwise ok (<80%) / warn (≥80%) / over (≥100%). */
  level: ShortsLimitLevel;
  /** Today's Shorts minutes watched (rounded). */
  minutes: number;
  /** The configured limit in minutes (0 when off). */
  limitMinutes: number;
  /** todaySeconds / (limit·60), clamped at 0; 0 when off. */
  fraction: number;
  /** Whole minutes left before the limit (0 when off or already over). */
  remainingMinutes: number;
};

/** Fraction of the limit at which the nudge escalates from "ok" to "warn". */
const SHORTS_WARN_FRACTION = 0.8;

/**
 * Compute the daily-Shorts-limit status from today's Shorts seconds and the
 * configured limit (minutes; ≤0 = off). Pure — shared by the background badge
 * and the popup banner so they never disagree.
 */
export function shortsLimitStatus(
  todayShortsSeconds: number,
  limitMinutes: number,
): ShortsLimitStatus {
  const seconds = Math.max(0, todayShortsSeconds);
  const minutes = Math.round(seconds / 60);
  if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) {
    return { level: "off", minutes, limitMinutes: 0, fraction: 0, remainingMinutes: 0 };
  }
  const limitSeconds = limitMinutes * 60;
  const fraction = seconds / limitSeconds;
  const level: ShortsLimitLevel =
    fraction >= 1 ? "over" : fraction >= SHORTS_WARN_FRACTION ? "warn" : "ok";
  const remainingMinutes = Math.max(0, Math.ceil((limitSeconds - seconds) / 60));
  return { level, minutes, limitMinutes, fraction, remainingMinutes };
}
