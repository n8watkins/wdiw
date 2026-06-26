import type { Settings } from "../types";

export const STORAGE_KEYS = {
  history: "history",
  settings: "settings",
} as const;

/** chrome.storage.local key for lifetime usage stats (never pruned). */
export const TLDW_STATS_KEY = "tldwStats";

/**
 * Hard cap on the per-channel watch aggregates kept in LifetimeStats.channels.
 * At ~80–120 bytes/channel a cap of 500 ≈ 40–60 KB — trivial vs the ~5 MB
 * chrome.storage.local quota (no `unlimitedStorage` permission), but the map
 * must be bounded since otherwise it grows one entry per distinct channel ever
 * watched. The least-recently-watched channels are evicted first (see
 * trimChannelStats).
 */
export const CHANNEL_STATS_CAP = 500;

/** Age thresholds (days) offered by the history auto-expiry control. */
export const HISTORY_EXPIRY_OPTIONS = [7, 30, 90, 365] as const;

export const DEFAULT_SETTINGS: Settings = {
  autoSubmit: true,
  saveHistoryOnSearch: true,
  historyLimit: 100,
  autoExpireHistory: true,
  historyExpiryDays: 30,
  focusGeminiTab: true,
  autoPauseOnSummarize: false,
  worthWatchingGate: false,
  worthWatchingMinutes: 30,
  gateBypassTerms: "",
  destinationId: "gemini",
  temporaryChats: true,
  autoTldwMinutes: 0,
  geminiApiKey: "",
  geminiApiKeyName: "",
  useDirectApi: false,
  showAiRecommendation: true,
  trackAiAverage: true,
  trackEngagement: true,
  showEngagementStatus: true,
  engagedPct: 60,
  skimmedPct: 15,
  trackMyAverage: true,
  skipSponsors: true,
  keepFullCallLog: false,
  firstRunNoticeSeen: false,
};

/**
 * Display labels for the personal verdict. The internal enum stays
 * watch/skim/skip everywhere; only what the user sees changes.
 */
export const USER_RATING_LABELS: Record<"watch" | "skim" | "skip", string> = {
  watch: "Engaged",
  skim: "Skimmed",
  skip: "Skipped",
};

/** Numeric scale for averaging the personal verdict across a channel's videos. */
export const USER_RATING_SCALE: Record<"watch" | "skim" | "skip", number> = {
  watch: 3,
  skim: 2,
  skip: 1,
};

/**
 * Map a 1–10 quality/audience score to the WATCH/SKIM/SKIP verdict vocabulary.
 * Shared by the content panel and the Channels view so both speak in words, not
 * numbers (≤3 SKIP, ≤6 SKIM, else WATCH).
 */
export function scoreToVerdict(score: number): string {
  if (score <= 3) return "SKIP";
  if (score <= 6) return "SKIM";
  return "WATCH";
}

/**
 * Map an averaged personal verdict (USER_RATING_SCALE, 1–3) to the nearest
 * bucket label: ≥2.5 → Engaged, ≥1.5 → Skimmed, else Skipped.
 */
export function userAvgToLabel(avg: number): string {
  if (avg >= 2.5) return USER_RATING_LABELS.watch;
  if (avg >= 1.5) return USER_RATING_LABELS.skim;
  return USER_RATING_LABELS.skip;
}

/**
 * Local-timezone "YYYY-MM-DD" key. The activity heatmap and the daily counters
 * are presented as "today" (the user's calendar day), so the day key must be
 * derived from local components on BOTH the write and read side.
 * `Date.toISOString().slice(0,10)` slices the UTC date, which drifts a day for
 * negative-UTC zones (all of the Americas) once the UTC day has rolled over —
 * making a streak read as broken. Use this on both sides so they always agree.
 */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract the YouTube video ID from any watch/shorts/youtu.be URL.
 * Returns null for non-video URLs or URLs that don't parse.
 */
export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shorts = /^\/shorts\/([^/?]+)/.exec(u.pathname);
      if (shorts) return shorts[1];
    }
    if (host === "youtu.be") return u.pathname.slice(1) || null;
  } catch {
    // fall through
  }
  return null;
}
