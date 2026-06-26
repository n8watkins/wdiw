export type PromptProfile = {
  id: string;
  name: string;
  description?: string;
  promptTemplate: string;
  isDefault?: boolean;
  isCustomized?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SearchHistoryEntry = {
  id: string;
  videoUrl: string;
  videoTitle?: string;
  /** YouTube channel name — used for per-channel stats. */
  channel?: string;
  /** Channel avatar URL scraped from the YouTube DOM. */
  channelAvatarUrl?: string;
  profileId: string;
  profileName: string;
  /** Destination the search was sent to, so "ask again" reopens the right one. */
  destinationId?: string;
  prompt: string;
  /**
   * Legacy: raw Gemini response. No longer written — the single home for full
   * prompt + response is now the Direct API call log (de-duplicated). Kept on
   * the type so older stored entries still render in the History view.
   */
  apiResponse?: string;
  /** AI quality score (1-10) parsed from the TL;DW rating field. */
  aiRating?: number;
  /**
   * The user's personal verdict on this video. Internal enum is kept as
   * watch/skim/skip (displayed as Engaged/Skimmed/Skipped); numeric map for
   * channel averages is watch=3, skim=2, skip=1 (see USER_RATING_SCALE).
   * Now set automatically by the watch-time engine (watchtime.ts) rather than
   * by manual button clicks.
   */
  userRating?: "watch" | "skim" | "skip";
  /** Accumulated content-seconds watched for this video (from the watch-time engine). */
  watchedSeconds?: number;
  /** Latest known video duration in seconds (written by the watch-time engine). */
  durationSeconds?: number;
  createdAt: string;
};

export type HistoryLimit = 50 | 100 | 250 | "unlimited";

/** Age thresholds the history auto-expiry offers. */
export type HistoryExpiryDays = 7 | 30 | 90 | 365;

/**
 * Per-channel watch aggregate inside LifetimeStats.channels. Lives in the
 * never-pruned `tldwStats` so it survives history expiry — unlike
 * computeChannelStats(history), which only sees the retained history window.
 * Populated forward from recordWatchProgress; existing users start from zero
 * (per-channel watch deltas weren't recorded before this field existed).
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
  /** ISO timestamp of the most recent watch — also the eviction key. */
  lastWatched: string;
  /** Latest channel avatar URL scraped from the watch page, if known. */
  avatarUrl?: string;
};

/**
 * Lifetime usage counters stored under "tldwStats" in chrome.storage.local.
 * Never pruned — survives history expiry and cache clears.
 */
export type LifetimeStats = {
  /** ISO timestamp of the first write. */
  since: string;
  /** Total completed summaries (both Direct API and tab-scrape paths). */
  summaries: number;
  /** Summaries served instantly from cache — zero API wait. */
  cacheHits: number;
  /** Sum of video durations (in seconds) for summarized videos when known. */
  durationSummarizedSeconds: number;
  /** Total SponsorBlock auto-skips recorded. */
  sponsorSkips: number;
  /** Total seconds saved by SponsorBlock auto-skips. */
  sponsorSecondsSaved: number;
  /** Total tracked watch time across all videos (in seconds). */
  secondsWatched: number;
  /** Lifetime count of videos rated "Engaged" (watch). */
  engaged: number;
  /** Lifetime count of videos rated "Skimmed" (skim). */
  skimmed: number;
  /** Lifetime count of videos rated "Skipped" (skip). */
  skipped: number;
  /**
   * Daily summary counts for activity heatmap.
   * Keys are "YYYY-MM-DD"; capped at the most recent 366 entries.
   */
  activity: Record<string, number>;
  /**
   * Per-channel watch aggregates, keyed by channel key (channelId ?? name).
   * Capped at the most-recently-watched CHANNEL_STATS_CAP channels (see
   * trimChannelStats) so it stays well under the storage quota. Optional so
   * existing stored stats (written before this field) read back cleanly.
   */
  channels?: Record<string, ChannelStat>;
};

/** Minutes thresholds the worth-watching gate offers (see WATCH_THRESHOLD_OPTIONS). */
export type WatchThresholdMinutes = 15 | 20 | 30 | 45 | 60;

/**
 * What gets handed to a destination. "prompt" (default) sends the analysis
 * prompt, with the transcript appended when the destination can't watch the
 * video itself. "source" sends the raw transcript only — for tools like
 * NotebookLM that ingest source material and do their own questioning, where a
 * prompt would be meaningless. "link" sends just the YouTube URL.
 */
export type DestinationPayload = "prompt" | "source" | "link";

export type Destination = {
  id: string;
  label: string;
  url: string;
  payload?: DestinationPayload;
  /**
   * True only for destinations that can open the YouTube URL themselves
   * (Gemini). When false, the transcript is included in the prompt because the
   * destination can't watch the video — independent of how it's delivered.
   */
  canWatch?: boolean;
  /**
   * URL to open when temporary/incognito mode is enabled. If absent, the
   * content script handles the toggle (e.g. clicking the temp-chat button).
   */
  incognitoUrl?: string;
};

export type Settings = {
  defaultProfileId?: string;
  autoSubmit: boolean;
  saveHistoryOnSearch: boolean;
  historyLimit: HistoryLimit;
  /** Auto-delete history entries older than `historyExpiryDays`. */
  autoExpireHistory: boolean;
  /** Age (in days) past which entries are dropped when auto-expire is on. */
  historyExpiryDays: HistoryExpiryDays;
  /** Switch focus to the new destination tab; when false it opens in the background. */
  focusGeminiTab: boolean;
  /** Pause the YouTube video when a summary is sent. */
  autoPauseOnSummarize: boolean;
  /** Ask for a WATCH/SKIM/SKIP verdict first on videos over the threshold. */
  worthWatchingGate: boolean;
  /** Duration (minutes) above which the worth-watching verdict is requested. */
  worthWatchingMinutes: WatchThresholdMinutes;
  /** Channels/keywords (one per line) that bypass the gate — always full summary. */
  gateBypassTerms: string;
  /** Which destination a summary is sent to (see DESTINATIONS). */
  destinationId: string;
  /** Open chats in incognito/temporary mode — not saved to the AI's history. */
  temporaryChats: boolean;
  /** Auto-run TL;DW when opening a video longer than this many minutes (0 = off). */
  autoTldwMinutes: number;
  /** Gemini API key for direct (headless) calls — no tab opened when set. */
  geminiApiKey: string;
  /** Display name the user gave this key (e.g. "Personal AI Studio key"). */
  geminiApiKeyName: string;
  /** Use the direct API path when a key is present (can be toggled off in the popup). */
  useDirectApi: boolean;
  /** Whether the user has acknowledged the first-run privacy notice (SponsorBlock + engagement). */
  firstRunNoticeSeen: boolean;
  /** Profile to use for Direct API auto-runs; falls back to the default profile if unset. */
  directApiProfileId?: string;
  /** AI dimension — collect/show: render the AI verdict + numeric score pills in the panel. */
  showAiRecommendation: boolean;
  /** AI dimension — track-average: show the per-channel AI rating average + cue. Requires showAiRecommendation. */
  trackAiAverage: boolean;
  /**
   * Engagement tracking — master switch. When true, watch-time is measured and
   * videos are auto-rated Engaged/Skimmed/Skipped based on actual playback.
   */
  trackEngagement: boolean;
  /** Engagement tracking — show the live on-page watch-progress cue in the summary panel. */
  showEngagementStatus: boolean;
  /** Percentage of video watched to count as Engaged (default 60). */
  engagedPct: number;
  /** Percentage floor for Skimmed; below this threshold counts as Skipped (default 15). */
  skimmedPct: number;
  /**
   * My dimension — track-average: show the per-channel engagement average + cue.
   * Computed from auto-tracked ratings (no manual buttons).
   */
  trackMyAverage: boolean;
  /** Auto-skip in-video sponsored segments using the free SponsorBlock community data. */
  skipSponsors: boolean;
  /**
   * Keep the full prompt + raw response in the Direct API call log. Off by
   * default — the log stores only metadata (video, time), since the call COUNT
   * already lives in geminiUsage. Turn on for prompt debugging.
   */
  keepFullCallLog: boolean;
};

export type VideoContext = {
  url: string;
  title?: string;
  channel?: string;
  /** Channel id/href (e.g. "/@Handle" or "/channel/UC…") from getChannelInfo().id.
   *  Used to resolve channel tags by id (with name fallback), matching the
   *  widget's writer and the auto-run channel lookups. */
  channelId?: string;
  avatarUrl?: string;
};

/** Message from the Gemini content script asking for its pending prompt. */
export type GetPendingMessage = { type: "GET_PENDING" };

/**
 * Message from the popup requesting a summary run. `destinationId` lets the
 * popup override the saved default for this one send (a per-session choice that
 * never changes the stored default).
 */
export type AskMessage = {
  type: "ASK";
  profileId?: string;
  destinationId?: string;
  /** Per-send override for the worth-watching verdict gate. */
  worthWatchingGate?: boolean;
  /** Optional one-off question to weave into the prompt for this send. */
  userCuriosity?: string;
  /**
   * Where this send originated, so the worker can decide between the headless
   * Direct API path and opening a destination tab. In-page auto-runs default to
   * "auto" (headless when Direct API is on); the popup's explicit "Send to X"
   * button passes "popup" so it opens that destination like the right-click menu.
   */
  source?: SummarySource;
};

/**
 * Entry point that triggered a summarize. Explicit "send to this destination"
 * gestures ("menu", "popup") open the destination tab even when Direct API is
 * on; the keyboard shortcut and in-page auto-run ("command", "auto") run
 * headless so the TL;DW widget fills in place.
 */
export type SummarySource = "menu" | "command" | "popup" | "auto";

/** Sent from options page after profiles change to sync the context menu. */
export type RebuildMenuMessage = { type: "REBUILD_MENU" };

/** Reported by the injector after an auto-fill attempt on a destination page. */
export type InjectResultMessage = {
  type: "INJECT_RESULT";
  site: string;
  ok: boolean;
  reason?: string;
};

/** Compact structured data extracted from the AI response and injected onto the YouTube page. */
export type TldwSummary = {
  /** WATCH, SKIM, or SKIP */
  verdict: string;
  /** One sentence stating the video's core conclusion or argument. */
  summary: string;
  /** e.g. "8/10" */
  rating: string;
  /** 1-2 sentences of supporting evidence or key context. */
  details?: string;
};

/**
 * Sent from the inject script once the AI finishes responding. The background
 * forwards it to the source YouTube tab so the summary appears on the page.
 */
export type AiSummaryMessage = {
  type: "AI_SUMMARY";
  tldw: TldwSummary;
  sourceTabId: number;
};

/** Popup/content asking the worker to open the extension's options page.
 *  Optional `section` deep-links to a sidebar section via the page's URL hash. */
export type OpenOptionsMessage = { type: "OPEN_OPTIONS"; section?: string };

/**
 * Content panel's "Open tab" button: focus the destination tab we already
 * scraped for this video if it's still open, otherwise open (and focus) a fresh
 * one. Lets the user jump to the AI tab without spawning duplicates.
 */
export type OpenOrFocusDestinationMessage = { type: "OPEN_OR_FOCUS_DESTINATION" };

/**
 * Sent from watchtime.ts (the watch-time engine content script) to report
 * accumulated playback progress. The background uses this to auto-rate videos
 * as Engaged/Skimmed/Skipped based on actual watch time, replacing the old
 * manual rating buttons.
 */
export type WatchProgressMessage = {
  type: "WATCH_PROGRESS";
  videoId: string;
  /** Seconds of content watched since the last successful report. */
  deltaSeconds: number;
  /** Latest known video duration in seconds. */
  durationSeconds: number;
  /** True if a TL;DW summary panel was shown for this video (affects skip verdict). */
  sawSummary: boolean;
  video: { url: string; title?: string; channel?: string; avatarUrl?: string };
};

/** One sponsor segment from SponsorBlock: a [start, end] time range in seconds. */
export type SponsorSegment = { start: number; end: number; category: string };

/** A sponsor segment as published to the TL;DW panel (with skip/undo state). */
export type SponsorPanelSegment = {
  index: number;
  start: number;
  end: number;
  category: string;
  skipped: boolean;
  disabled: boolean;
  /** True briefly after an auto-skip — the Undo affordance shows only then. */
  undoable: boolean;
};

/**
 * Bridge the SponsorBlock content script (sponsorblock.ts) exposes on `window`
 * so the panel renderer (youtube.ts) — same content-script world — can show the
 * segment timestamps and drive Undo. Changes fire a `tldw-sponsor-update` event.
 */
export type SponsorWindowApi = {
  getSegments: () => SponsorPanelSegment[];
  isEnabled: () => boolean;
  /**
   * Seek to a segment's start or end and take manual control of it (no
   * auto-skip after). Drives the clickable timestamps and the Undo button.
   */
  jumpTo: (index: number, edge: "start" | "end") => void;
};

/** Content script asking the worker to fetch this video's SponsorBlock segments. */
export type GetSponsorSegmentsMessage = { type: "GET_SPONSOR_SEGMENTS"; videoId: string };

/**
 * Fired from sponsorblock.ts each time a segment is auto-skipped, so the
 * background can tally lifetime sponsorSkips + sponsorSecondsSaved stats.
 */
export type SponsorSkippedMessage = {
  type: "SPONSOR_SKIPPED";
  secondsSaved: number;
  category: string;
};

/** Worker's reply with the (possibly empty) list of segments to skip. */
export type SponsorSegmentsResponse = { segments: SponsorSegment[] };

export type RuntimeMessage =
  | GetPendingMessage
  | AskMessage
  | RebuildMenuMessage
  | InjectResultMessage
  | AiSummaryMessage
  | OpenOptionsMessage
  | OpenOrFocusDestinationMessage
  | WatchProgressMessage
  | GetSponsorSegmentsMessage
  | SponsorSkippedMessage;
