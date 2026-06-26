import type { LifetimeStats, SearchHistoryEntry } from "../types";
import { extractVideoId, localDateKey } from "./constants";

/**
 * One-time migration from TL;DW → WDIW (Step 5, part a).
 *
 * chrome.storage is per-extension, so WDIW can't read TL;DW's store directly.
 * TL;DW exports its watch log as JSON (Options → History → Export:
 * `{ exportedAt, source: "TL;DW", entries: SearchHistoryEntry[] }`); WDIW imports
 * that file here. The same shape is what WDIW exports, so this doubles as
 * backup/restore. TL;DW does NOT export the never-pruned `tldwStats` aggregates,
 * so we rebuild the per-channel + lifetime stats by FOLDING the imported videos
 * in (the entries carry channel / watchedSeconds / durationSeconds / userRating /
 * createdAt — everything the dashboards need).
 *
 * Pure (no chrome.*) so the parse + fold logic is unit-testable; the storage
 * orchestration (dedupe vs current history, write under the locks) lives in
 * storage.ts `importHistoryEntries`.
 */

/**
 * Validate + extract the entries from a TL;DW/WDIW history export. Accepts either
 * the `{ entries: [...] }` wrapper or a bare array. Drops rows without a video URL
 * or a parseable `createdAt`. Throws a user-facing message on an unrecognized shape.
 */
export function parseHistoryExport(json: unknown): SearchHistoryEntry[] {
  const arr = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { entries?: unknown }).entries)
      ? (json as { entries: unknown[] }).entries
      : null;
  if (!arr) {
    throw new Error(
      'Unrecognized file — expected a TL;DW or WDIW history export (a JSON object with an "entries" array).',
    );
  }
  const out: SearchHistoryEntry[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Partial<SearchHistoryEntry>;
    if (typeof e.videoUrl !== "string" || !e.videoUrl) continue;
    if (typeof e.createdAt !== "string" || Number.isNaN(new Date(e.createdAt).getTime())) continue;
    // Extra summarizer fields (prompt, profileId…) are harmless — kept as-is.
    out.push(e as SearchHistoryEntry);
  }
  return out;
}

/** Stable per-video key: the YouTube video id, falling back to the raw URL. */
export function videoKey(e: SearchHistoryEntry): string {
  return extractVideoId(e.videoUrl) ?? e.videoUrl;
}

/** Upgrade-only rank for the engagement verdict, picking the "best" of duplicates. */
const VERDICT_RANK: Record<string, number> = { skip: 1, skim: 2, watch: 3 };

/**
 * Collapse multiple rows for the same video into one watch record — TL;DW (like
 * WDIW) can store several history rows per video (a summary row + a watch stub).
 * Takes the max watched-seconds + longest known duration, the best verdict, the
 * earliest createdAt (first watched), and the first non-empty channel/title/avatar.
 * Pure; does not mutate the input.
 */
export function collapseByVideo(entries: SearchHistoryEntry[]): SearchHistoryEntry[] {
  const byVideo = new Map<string, SearchHistoryEntry>();
  for (const e of entries) {
    const k = videoKey(e);
    const cur = byVideo.get(k);
    if (!cur) {
      byVideo.set(k, { ...e });
      continue;
    }
    const curRank = VERDICT_RANK[cur.userRating ?? ""] ?? 0;
    const eRank = VERDICT_RANK[e.userRating ?? ""] ?? 0;
    byVideo.set(k, {
      ...cur,
      watchedSeconds: Math.max(cur.watchedSeconds ?? 0, e.watchedSeconds ?? 0),
      durationSeconds: Math.max(cur.durationSeconds ?? 0, e.durationSeconds ?? 0) || undefined,
      userRating: eRank > curRank ? e.userRating : cur.userRating,
      createdAt: new Date(e.createdAt) < new Date(cur.createdAt) ? e.createdAt : cur.createdAt,
      channel: cur.channel ?? e.channel,
      channelAvatarUrl: cur.channelAvatarUrl ?? e.channelAvatarUrl,
      videoTitle: cur.videoTitle ?? e.videoTitle,
      isShort: cur.isShort ?? e.isShort,
    });
  }
  return [...byVideo.values()];
}

/**
 * Fold collapsed watch records into a LifetimeStats draft (mutates + returns it),
 * mirroring how `recordWatchProgress` accrues stats — but per finished record, in
 * bulk, attributed to each record's own `createdAt` day. Each record counts as one
 * distinct video. Caller is responsible for deduping against already-counted data.
 * Pure (no chrome.*).
 */
export function foldImportedEntries(
  stats: LifetimeStats,
  records: SearchHistoryEntry[],
): LifetimeStats {
  stats.dailySeconds ??= {};
  stats.dailyShortsSeconds ??= {};
  if (!stats.channels) stats.channels = {};

  for (const e of records) {
    const secs = e.watchedSeconds ?? 0;
    const day = localDateKey(new Date(e.createdAt));
    const isShort = e.isShort === true;

    if (secs > 0) {
      stats.secondsWatched += secs;
      stats.dailySeconds[day] = (stats.dailySeconds[day] ?? 0) + secs;
      if (isShort) {
        stats.shortsSeconds = (stats.shortsSeconds ?? 0) + secs;
        stats.dailyShortsSeconds[day] = (stats.dailyShortsSeconds[day] ?? 0) + secs;
      }
    }

    stats.videosWatched = (stats.videosWatched ?? 0) + 1;
    stats.activity[day] = (stats.activity[day] ?? 0) + 1;
    if (isShort) stats.shortsCount = (stats.shortsCount ?? 0) + 1;

    // Engagement verdict — Shorts use the simplified model (no verdict), matching
    // the live path; imported TL;DW entries are long-form and carry a rating.
    if (!isShort) {
      if (e.userRating === "watch") stats.engaged++;
      else if (e.userRating === "skim") stats.skimmed++;
      else if (e.userRating === "skip") stats.skipped++;
    }

    if (e.channel) {
      const c = stats.channels[e.channel] ?? {
        name: e.channel,
        secondsWatched: 0,
        videosWatched: 0,
        engaged: 0,
        skimmed: 0,
        skipped: 0,
        lastWatched: "",
      };
      c.name = e.channel;
      if (e.channelAvatarUrl) c.avatarUrl = e.channelAvatarUrl;
      if (secs > 0) c.secondsWatched += secs;
      c.videosWatched += 1;
      if (!isShort) {
        if (e.userRating === "watch") c.engaged++;
        else if (e.userRating === "skim") c.skimmed++;
        else if (e.userRating === "skip") c.skipped++;
      } else {
        c.shortsSeconds = (c.shortsSeconds ?? 0) + secs;
        c.shortsVideos = (c.shortsVideos ?? 0) + 1;
      }
      // lastWatched = the most recent watch on this channel.
      if (!c.lastWatched || new Date(e.createdAt) > new Date(c.lastWatched)) {
        c.lastWatched = e.createdAt;
      }
      stats.channels[e.channel] = c;
    }

    // Pull "tracking since" back to the earliest imported watch.
    if (!stats.since || new Date(e.createdAt) < new Date(stats.since)) {
      stats.since = e.createdAt;
    }
  }
  return stats;
}
