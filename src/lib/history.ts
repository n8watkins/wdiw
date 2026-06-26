import type { SearchHistoryEntry, Settings } from "../types";
import { HISTORY_HARD_CAP, USER_RATING_SCALE } from "./constants";

/** Keep only the newest `limit` entries. "unlimited" keeps up to HISTORY_HARD_CAP
 *  (a quota-safety ceiling — see constants). Newest first. */
export function trimToLimit(
  entries: SearchHistoryEntry[],
  limit: Settings["historyLimit"],
): SearchHistoryEntry[] {
  return entries.slice(0, limit === "unlimited" ? HISTORY_HARD_CAP : limit);
}

/**
 * Drop entries older than the configured age when auto-expiry is on. Keeps
 * history from growing unbounded and quietly hitting the chrome.storage.local
 * quota. A no-op when the toggle is off.
 */
export function expireOldEntries(
  entries: SearchHistoryEntry[],
  settings: Settings,
): SearchHistoryEntry[] {
  if (!settings.autoExpireHistory) return entries;
  const cutoff = Date.now() - settings.historyExpiryDays * 24 * 60 * 60 * 1000;
  return entries.filter((e) => {
    const t = new Date(e.createdAt).getTime();
    // Keep entries with an unparseable date rather than silently dropping them.
    return Number.isNaN(t) || t >= cutoff;
  });
}


export type ChannelStats = {
  channel: string;
  avatarUrl?: string;
  count: number;
  avgAiRating: number | null;
  /** Average of the personal verdict mapped through USER_RATING_SCALE; null when none rated. */
  avgUserRating: number | null;
  /** Tally of personal verdicts for this channel. */
  userBreakdown: { engaged: number; skimmed: number; skipped: number };
  /**
   * Σ watchedSeconds across this channel's retained videos. Self-consistent with
   * the `videos` list shown when a channel card is expanded — unlike the persisted
   * LifetimeStats.channels[].secondsWatched (never-pruned, lifetime), this only
   * covers the retained history window, which is the right scope for the
   * browseable Channels view.
   */
  watchedSeconds: number;
  lastWatched: string;
  videos: SearchHistoryEntry[];
};

/** Group history by channel and compute per-channel averages. */
export function computeChannelStats(history: SearchHistoryEntry[]): ChannelStats[] {
  const byChannel = new Map<string, SearchHistoryEntry[]>();
  for (const entry of history) {
    if (!entry.channel) continue;
    const list = byChannel.get(entry.channel) ?? [];
    list.push(entry);
    byChannel.set(entry.channel, list);
  }
  return [...byChannel.entries()]
    .map(([channel, videos]) => {
      // history is newest-first; videos within a channel retain that ordering.
      const aiRatings = videos.map((v) => v.aiRating).filter((r): r is number => r !== undefined);
      const userRatings = videos
        .map((v) => v.userRating)
        .filter((r): r is "watch" | "skim" | "skip" => r !== undefined);
      const userBreakdown = { engaged: 0, skimmed: 0, skipped: 0 };
      for (const r of userRatings) {
        if (r === "watch") userBreakdown.engaged++;
        else if (r === "skim") userBreakdown.skimmed++;
        else userBreakdown.skipped++;
      }
      return {
        channel,
        // Use the most recent entry's avatar (first in newest-first list).
        avatarUrl: videos[0]?.channelAvatarUrl,
        count: videos.length,
        avgAiRating: aiRatings.length ? aiRatings.reduce((a, b) => a + b, 0) / aiRatings.length : null,
        avgUserRating: userRatings.length
          ? userRatings.reduce((a, b) => a + USER_RATING_SCALE[b], 0) / userRatings.length
          : null,
        userBreakdown,
        watchedSeconds: videos.reduce((acc, v) => acc + (v.watchedSeconds ?? 0), 0),
        lastWatched: videos[0]?.createdAt ?? "",
        videos,
      };
    })
    .sort((a, b) => b.count - a.count);
}
