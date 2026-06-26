export type SearchHistoryEntry = {
  id: string;
  videoUrl: string;
  videoTitle?: string;
  /** YouTube channel name — used for per-channel stats. */
  channel?: string;
  /** Channel avatar URL scraped from the YouTube DOM. */
  channelAvatarUrl?: string;
  /** Vestigial (the entry shape was shared with TL;DW); written as "" by the
   *  watch-time stubs + importers. Kept so older stored entries read back cleanly. */
  profileId: string;
  profileName: string;
  prompt: string;
  /** Vestigial summarizer fields, kept so old/imported entries still parse. */
  destinationId?: string;
  apiResponse?: string;
  aiRating?: number;
  /**
   * The user's auto-tracked verdict for this video (watch/skim/skip, shown as
   * Engaged/Skimmed/Skipped). Numeric map for channel averages is watch=3,
   * skim=2, skip=1 (see USER_RATING_SCALE). Set by the watch-time engine.
   */
  userRating?: "watch" | "skim" | "skip";
  /** Accumulated content-seconds watched for this video (from the watch-time engine). */
  watchedSeconds?: number;
  /** Latest known video duration in seconds (written by the watch-time engine). */
  durationSeconds?: number;
  /**
   * True if this entry is a YouTube Short (/shorts/…). Drives the Shorts-vs-
   * long-form split and the doom-scroll metrics. Shorts use a simplified
   * engagement model — no Engaged/Skimmed/Skipped verdict (they loop, so
   * "finish rate" is meaningless), so `userRating` stays unset for Shorts.
   */
  isShort?: boolean;
  createdAt: string;
};

export type HistoryLimit = 50 | 100 | 250 | "unlimited";

/** Age thresholds the history auto-expiry offers. */
export type HistoryExpiryDays = 7 | 30 | 90 | 365;

/**
 * Per-channel watch aggregate inside LifetimeStats.channels. Lives in the
 * never-pruned `tldwStats` so it survives history expiry — unlike
 * computeChannelStats(history), which only sees the retained history window.
 */
export type ChannelStat = {
  /** Channel display name (latest seen). */
  name: string;
  /** Total content-seconds watched on this channel. */
  secondsWatched: number;
  /** Distinct videos from this channel that have accrued watch time. */
  videosWatched: number;
  /** Lifetime engagement verdict tallies for this channel. */
  engaged: number;
  skimmed: number;
  skipped: number;
  /** Seconds watched on Shorts from this channel (subset of secondsWatched). */
  shortsSeconds?: number;
  /** Distinct Shorts from this channel that accrued watch time. */
  shortsVideos?: number;
  /** ISO timestamp of the most recent watch — also the eviction key. */
  lastWatched: string;
  /** Latest channel avatar URL scraped from the watch page, if known. */
  avatarUrl?: string;
};

/**
 * Lifetime usage counters stored under "tldwStats" in chrome.storage.local.
 * Never pruned — survives history expiry. (Key name is `tldw*` for historical
 * reasons; storage is per-extension so there's no collision, and renaming would
 * need a migration.)
 */
export type LifetimeStats = {
  /** ISO timestamp of the first write. */
  since: string;
  /** Total tracked watch time across all videos (in seconds). */
  secondsWatched: number;
  /**
   * Lifetime count of distinct videos watched — bumped once per new video,
   * channel-independent (unlike the per-channel `videosWatched` tally, which
   * misses channel-less videos and is capped). Approximate, like that tally.
   */
  videosWatched?: number;
  /** Lifetime count of videos rated "Engaged" (watch). */
  engaged: number;
  /** Lifetime count of videos rated "Skimmed" (skim). */
  skimmed: number;
  /** Lifetime count of videos rated "Skipped" (skip). */
  skipped: number;
  /** Total Shorts watch-seconds (subset of secondsWatched). */
  shortsSeconds?: number;
  /** Distinct Shorts watched (approximate, like videosWatched). */
  shortsCount?: number;
  /**
   * Distinct videos first seen per local day ("YYYY-MM-DD") — the activity
   * heatmap + "active days". Capped at the most recent 366 entries.
   */
  activity: Record<string, number>;
  /**
   * Watch-seconds per local day ("YYYY-MM-DD"), attributed to the day the time
   * was ACTUALLY watched (bumped by each delta) — not a video's first-seen day.
   * The accurate source for "time watched today / this week" (history, by
   * contrast, dates a video once at first sight). Capped to 366 days.
   */
  dailySeconds?: Record<string, number>;
  /** Shorts watch-seconds per local day — backs the Shorts daily quantifier/nudge. */
  dailyShortsSeconds?: Record<string, number>;
  /**
   * ISO time of the latest Google Takeout watch event already imported. A
   * re-import only folds events newer than this — so re-importing the same file
   * is a no-op, and re-exporting Takeout months later folds just the new events
   * (incremental). Set by `importTakeoutEvents`.
   */
  takeoutThrough?: string;
  /**
   * ISO time of the most recent LIVE watch-progress record (set by
   * recordWatchProgress, NOT by imports). Powers the popup's "last tracked"
   * capture-health signal so a silently-broken content script is noticeable.
   */
  lastRecordedAt?: string;
  /**
   * Per-channel watch aggregates, keyed by channel name. Capped at the
   * most-recently-watched CHANNEL_STATS_CAP channels (see trimChannelStats) so it
   * stays well under the storage quota. Optional so existing stored stats (written
   * before this field) read back cleanly.
   */
  channels?: Record<string, ChannelStat>;
};

export type Settings = {
  /** How many recent videos to retain in the history log. */
  historyLimit: HistoryLimit;
  /** Auto-delete history entries older than `historyExpiryDays`. */
  autoExpireHistory: boolean;
  /** Age (in days) past which entries are dropped when auto-expire is on. */
  historyExpiryDays: HistoryExpiryDays;
  /** Whether the user has seen the first-run welcome notice. */
  firstRunNoticeSeen: boolean;
  /**
   * Engagement tracking — master switch. When true, watch-time is measured and
   * videos are auto-rated Engaged/Skimmed/Skipped based on actual playback.
   */
  trackEngagement: boolean;
  /** Percentage of video watched to count as Engaged (default 60). */
  engagedPct: number;
  /** Percentage floor for Skimmed; below this threshold counts as Skipped (default 15). */
  skimmedPct: number;
  /**
   * Daily Shorts limit in minutes (0 = off — the default). When set, WDIW shows a
   * doom-scroll nudge: a toolbar badge with today's Shorts minutes (green → amber
   * → red as you approach/exceed it) and a banner in the popup.
   */
  shortsLimitMinutes: number;
};

/**
 * Sent from watchtime.ts (the watch-time engine content script) to report
 * accumulated playback progress. The background records it via recordWatchProgress.
 */
export type WatchProgressMessage = {
  type: "WATCH_PROGRESS";
  videoId: string;
  /** Seconds of content watched since the last successful report. */
  deltaSeconds: number;
  /** Latest known video duration in seconds. */
  durationSeconds: number;
  /** Legacy flag (always false in WDIW — no summary panel); affects skip verdict. */
  sawSummary: boolean;
  /** True when the tracked video is a YouTube Short (/shorts/…). */
  isShort: boolean;
  video: { url: string; title?: string; channel?: string; avatarUrl?: string };
};

/** The only runtime message WDIW sends (content script → background). */
export type RuntimeMessage = WatchProgressMessage;
