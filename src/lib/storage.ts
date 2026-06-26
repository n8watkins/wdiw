import type {
  ChannelStat,
  LifetimeStats,
  SearchHistoryEntry,
  Settings,
} from "../types";
import { computeEngagementVerdict, VERDICT_RANK } from "./engagement";
import {
  DEFAULT_SETTINGS,
  extractVideoId,
  STORAGE_KEYS,
  TLDW_STATS_KEY,
} from "./constants";
import { trimChannelStats } from "./stats";

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(r[STORAGE_KEYS.settings] as Settings) };
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getHistory(): Promise<SearchHistoryEntry[]> {
  const r = await chrome.storage.local.get(STORAGE_KEYS.history);
  return (r[STORAGE_KEYS.history] as SearchHistoryEntry[]) ?? [];
}

export async function setHistory(history: SearchHistoryEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
}

/**
 * Accumulated watched-seconds for a video from history (0 if none). A video can
 * have MULTIPLE history rows — a summary entry (no watchedSeconds) prepended by
 * addHistoryEntry can shadow the watch-progress stub that holds the total — so we
 * take the max over ALL matching entries rather than trusting first-match. Pure
 * helper exported for tests. Used by the watch-time engine to RESTORE progress on
 * reload (F3) so a refresh doesn't reset the engagement measurement that feeds the
 * average.
 */
export function watchedSecondsFromHistory(
  history: SearchHistoryEntry[],
  videoId: string,
): number {
  let max = 0;
  for (const e of history) {
    if (extractVideoId(e.videoUrl) === videoId && (e.watchedSeconds ?? 0) > max) {
      max = e.watchedSeconds!;
    }
  }
  return max;
}

// --- write serialization (mutex) -------------------------------------------
// chrome.storage has no atomic read-modify-write. Many concurrent RMW sequences
// run — WATCH_PROGRESS fires from every open YouTube tab (all routed to the one
// worker), stats bumps, and the options page editing history — and a bare
// get→modify→set can interleave so the later set() clobbers the earlier one (lost
// stats, dropped history entries).
//
// Prefer the Web Locks API: it serializes across ALL same-origin realms, so a
// worker WATCH_PROGRESS write and an options-page history edit (both the
// chrome-extension:// origin) coordinate. The in-realm promise-chain is a
// fallback for contexts without navigator.locks. (Content scripts run in the
// page's origin and share a separate lock scope — unavoidable, and they do far
// fewer storage writes.)
const writeChains = new Map<string, Promise<unknown>>();

export function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  if (locks && typeof locks.request === "function") {
    return locks.request(`tldw:${key}`, () => fn()) as Promise<T>;
  }
  // Fallback: in-realm promise chain. Run fn after prev settles (resolve OR
  // reject) so one failed RMW doesn't wedge the queue; store a never-rejecting
  // tail for the next waiter but return the real result so errors still surface.
  const prev = writeChains.get(key) ?? Promise.resolve();
  const result = prev.then(fn, fn);
  writeChains.set(key, result.then(
    () => undefined,
    () => undefined,
  ));
  return result;
}

/**
 * Serialized read-modify-write of the history array. All history mutations
 * (recordWatchProgress, addHistoryEntry) route through here so concurrent
 * writers can't clobber each other. The callback receives the current stored
 * history and returns the next array, or null to skip the write entirely.
 */
export async function mutateHistory(
  fn: (history: SearchHistoryEntry[]) => SearchHistoryEntry[] | null,
): Promise<void> {
  await withWriteLock(STORAGE_KEYS.history, async () => {
    const history = await getHistory();
    const next = fn(history);
    if (next !== null) await setHistory(next);
  });
}

/**
 * Record a watch-progress delta for `videoId`, accumulate the total, compute an
 * engagement verdict (Engaged/Skimmed/Skipped), and persist it using the
 * upgrade-only rule (skip→skim→watch, never downgrade).
 *
 * - Finds the newest history entry for the video (matched by extractVideoId).
 * - If none exists and the delta > 0 or a non-null verdict would result: creates
 *   a lightweight stub entry.
 */
export async function recordWatchProgress(args: {
  videoId: string;
  deltaSeconds: number;
  durationSeconds: number;
  sawSummary: boolean;
  video: { url: string; title?: string; channel?: string; avatarUrl?: string };
  settings: Settings;
}): Promise<void> {
  const { videoId, deltaSeconds, durationSeconds, sawSummary, video, settings } = args;

  // The previous rating (before this update) and the resulting entry, captured
  // out of the serialized history mutation so we can bump stats afterward.
  let updatedEntry: SearchHistoryEntry | null = null;
  let prevRating: "watch" | "skim" | "skip" | undefined;
  // True when this delta created the FIRST history row for the video — used to
  // increment the channel's distinct-video count exactly once per video.
  let wasNewEntry = false;

  await mutateHistory((history) => {
    const idx = history.findIndex((e) => extractVideoId(e.videoUrl) === videoId);
    wasNewEntry = idx === -1;

    // Compute prospective accumulated total if we find (or create) an entry.
    const existingEntry = idx !== -1 ? history[idx]! : null;
    const prevWatched = existingEntry?.watchedSeconds ?? 0;
    const newWatched = prevWatched + deltaSeconds;

    const verdict = computeEngagementVerdict(newWatched, durationSeconds, {
      engagedPct: settings.engagedPct,
      skimmedPct: settings.skimmedPct,
      sawSummary,
    });

    // If there's no entry and we have nothing meaningful to store, skip the write.
    if (idx === -1 && deltaSeconds <= 0 && verdict === null) return null;

    if (idx !== -1) {
      // Existing entry — accumulate and potentially upgrade verdict.
      const current = history[idx]!;
      prevRating = current.userRating;
      const currentRank = VERDICT_RANK[current.userRating ?? "null"] ?? 0;
      const newRank = VERDICT_RANK[verdict ?? "null"] ?? 0;
      // Only upgrade: replace stored rating when new rank is strictly higher.
      const nextRating: "watch" | "skim" | "skip" | undefined =
        newRank > currentRank && verdict !== null
          ? (verdict as "watch" | "skim" | "skip")
          : current.userRating;

      updatedEntry = {
        ...current,
        watchedSeconds: newWatched,
        durationSeconds: durationSeconds || current.durationSeconds,
        ...(nextRating !== undefined ? { userRating: nextRating } : {}),
      };
      history[idx] = updatedEntry;
      return history;
    }

    // No existing entry — create a stub so the channel shows up in Channels view.
    const stub: SearchHistoryEntry = {
      id: crypto.randomUUID(),
      videoUrl: video.url,
      videoTitle: video.title,
      channel: video.channel,
      channelAvatarUrl: video.avatarUrl,
      profileId: "",
      profileName: "",
      prompt: "",
      watchedSeconds: newWatched,
      durationSeconds: durationSeconds || undefined,
      ...(verdict !== null && verdict !== undefined ? { userRating: verdict as "watch" | "skim" | "skip" } : {}),
      createdAt: new Date().toISOString(),
    };
    updatedEntry = stub;
    let next = [stub, ...history];
    if (settings.autoExpireHistory) {
      const cutoff = Date.now() - settings.historyExpiryDays * 24 * 60 * 60 * 1000;
      next = next.filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return Number.isNaN(t) || t >= cutoff;
      });
    }
    if (settings.historyLimit !== "unlimited") {
      next = next.slice(0, settings.historyLimit);
    }
    return next;
  });

  if (!updatedEntry) return;
  // TS can't see that the closure assigned these; narrow explicitly.
  const entry = updatedEntry as SearchHistoryEntry;

  // --- Bump lifetime stats: watch time + verdict transitions ---------------
  // Both the global counters and the per-channel aggregate ride the same
  // bumpLifetimeStats write-lock, so they stay consistent and never lose a
  // concurrent update.
  const newRating = entry.userRating;
  const verdictChanged = newRating !== undefined && newRating !== prevRating;
  if (deltaSeconds > 0 || verdictChanged) {
    const verdictDelta = verdictChanged
      ? verdictCounterDelta(prevRating, newRating!)
      : undefined;
    // Key per-channel stats by channel name — the only channel identifier the
    // watch-time engine reliably threads here (matches how computeChannelStats
    // groups history). Skip the per-channel bump when the channel is unknown.
    const channelName = entry.channel ?? video.channel;
    await bumpLifetimeStats((s) => {
      if (deltaSeconds > 0) s.secondsWatched += deltaSeconds;
      if (verdictDelta) {
        s.engaged = Math.max(0, s.engaged + verdictDelta.engaged);
        s.skimmed = Math.max(0, s.skimmed + verdictDelta.skimmed);
        s.skipped = Math.max(0, s.skipped + verdictDelta.skipped);
      }
      if (channelName) {
        bumpChannelStat(s, {
          channelKey: channelName,
          name: channelName,
          avatarUrl: entry.channelAvatarUrl ?? video.avatarUrl,
          deltaSeconds: deltaSeconds > 0 ? deltaSeconds : 0,
          videoIsNew: wasNewEntry,
          verdictDelta,
        });
      }
    });
  }
}

// --- Lifetime usage stats -------------------------------------------------

export function emptyLifetimeStats(): LifetimeStats {
  return {
    since: "",
    summaries: 0,
    cacheHits: 0,
    durationSummarizedSeconds: 0,
    sponsorSkips: 0,
    sponsorSecondsSaved: 0,
    secondsWatched: 0,
    engaged: 0,
    skimmed: 0,
    skipped: 0,
    activity: {},
    channels: {},
  };
}

/**
 * Trim an activity record to the newest `maxKeys` calendar dates.
 * Pure helper (exported for tests).
 */
export function trimActivity(
  activity: Record<string, number>,
  maxKeys = 366,
): Record<string, number> {
  const keys = Object.keys(activity);
  if (keys.length <= maxKeys) return activity;
  // Sort descending (newest first) and keep only the first maxKeys.
  const keep = new Set(keys.sort((a, b) => b.localeCompare(a)).slice(0, maxKeys));
  const trimmed: Record<string, number> = {};
  for (const k of keep) trimmed[k] = activity[k]!;
  return trimmed;
}

export async function getLifetimeStats(): Promise<LifetimeStats> {
  const r = await chrome.storage.local.get(TLDW_STATS_KEY);
  const stored = r[TLDW_STATS_KEY] as Partial<LifetimeStats> | undefined;
  return {
    ...emptyLifetimeStats(),
    ...stored,
    activity: stored?.activity ?? {},
    channels: stored?.channels ?? {},
  };
}

/**
 * Read-modify-write for lifetime stats. Sets `since` on first write and
 * trims `activity` to the newest 366 calendar dates.
 *
 * Serialized through withWriteLock: the message-driven design has many
 * concurrent callers (WATCH_PROGRESS from every tab), so an un-serialized
 * get→set would lose counter updates.
 */
export async function bumpLifetimeStats(
  mutate: (s: LifetimeStats) => void,
): Promise<void> {
  await withWriteLock(TLDW_STATS_KEY, async () => {
    const stats = await getLifetimeStats();
    if (!stats.since) stats.since = new Date().toISOString();
    mutate(stats);
    stats.activity = trimActivity(stats.activity);
    // Bound the per-channel map the same way activity is bounded — evict the
    // least-recently-watched channels so storage stays well under the quota.
    if (stats.channels) stats.channels = trimChannelStats(stats.channels);
    await chrome.storage.local.set({ [TLDW_STATS_KEY]: stats });
  });
}

/**
 * Apply a watch-progress delta to the per-channel aggregate inside a
 * LifetimeStats draft. Pure mutation over `s.channels` so it can ride the
 * existing `bumpLifetimeStats` write-lock alongside the global counters. Keyed
 * by `channelKey` (the channel display name — the only id the watch-time engine
 * reliably has here). `videoIsNew` bumps the channel's video count when a video
 * first appears in history; it counts once per video per watch session, but a
 * re-watch AFTER that video's history row has been pruned (age/limit) can recount
 * it — so the tally is an at-a-glance lifetime approximation, not an exact
 * distinct-video count. Verdict transitions mirror the global
 * engaged/skimmed/skipped logic so per-channel tallies move in lock-step (never
 * below zero).
 */
export function bumpChannelStat(
  s: LifetimeStats,
  args: {
    channelKey: string;
    name: string;
    avatarUrl?: string;
    deltaSeconds: number;
    videoIsNew: boolean;
    verdictDelta?: { engaged: number; skimmed: number; skipped: number };
  },
): void {
  if (!s.channels) s.channels = {};
  const { channelKey, name, avatarUrl, deltaSeconds, videoIsNew, verdictDelta } = args;
  const prev = s.channels[channelKey];
  const next: ChannelStat = prev ?? {
    name,
    secondsWatched: 0,
    videosWatched: 0,
    engaged: 0,
    skimmed: 0,
    skipped: 0,
    lastWatched: "",
  };
  // Refresh display fields to the latest known values.
  next.name = name || next.name;
  if (avatarUrl) next.avatarUrl = avatarUrl;
  if (deltaSeconds > 0) next.secondsWatched += deltaSeconds;
  if (videoIsNew) next.videosWatched += 1;
  if (verdictDelta) {
    next.engaged = Math.max(0, next.engaged + verdictDelta.engaged);
    next.skimmed = Math.max(0, next.skimmed + verdictDelta.skimmed);
    next.skipped = Math.max(0, next.skipped + verdictDelta.skipped);
  }
  next.lastWatched = new Date().toISOString();
  s.channels[channelKey] = next;
}

/**
 * Compute the delta to apply to the three lifetime verdict counters when a
 * history entry's userRating transitions from `prev` to `next`.
 *
 * Rules:
 * - Decrement the old bucket (floor 0 is enforced by callers).
 * - Increment the new bucket.
 * - If `prev === next` (no transition), return all zeros.
 *
 * Pure helper exported for unit tests.
 */
export function verdictCounterDelta(
  prev: "watch" | "skim" | "skip" | undefined,
  next: "watch" | "skim" | "skip",
): { engaged: number; skimmed: number; skipped: number } {
  const delta = { engaged: 0, skimmed: 0, skipped: 0 };
  if (prev === next) return delta;
  // Decrement old
  if (prev === "watch") delta.engaged -= 1;
  else if (prev === "skim") delta.skimmed -= 1;
  else if (prev === "skip") delta.skipped -= 1;
  // Increment new
  if (next === "watch") delta.engaged += 1;
  else if (next === "skim") delta.skimmed += 1;
  else if (next === "skip") delta.skipped += 1;
  return delta;
}
