import { expireOldEntries, trimToLimit } from "../lib/history";
import {
  getHistory,
  getLifetimeStats,
  getSettings,
  recordWatchProgress,
  setHistory,
} from "../lib/storage";
import { localDateKey, STORAGE_KEYS, TLDW_STATS_KEY } from "../lib/constants";
import { shortsLimitStatus } from "../lib/shorts";
import type { RuntimeMessage } from "../types";

// WDIW (What Did I Watch?) service worker — local-only watch-behavior recorder.
//
// The YouTube content script (src/content/watchtime.ts) observes playback and
// broadcasts WATCH_PROGRESS deltas; this worker accumulates them via
// recordWatchProgress() under the storage write-lock. No Gemini, no AI, no
// destination injectors — WDIW only records what you watch.

/**
 * Bound storage even when the user goes quiet. History expiry/trim normally run
 * on write (inside recordWatchProgress), so a user who stops watching would keep
 * stale data indefinitely. This sweep runs on install + browser startup to apply
 * the auto-delete and the history limit regardless of activity. Best-effort: a
 * maintenance sweep must never throw on startup.
 */
async function startupStorageSweep(): Promise<void> {
  try {
    const settings = await getSettings();
    const history = await getHistory();
    if (history.length > 0) {
      const next = trimToLimit(expireOldEntries(history, settings), settings.historyLimit);
      if (next.length !== history.length) await setHistory(next);
    }
  } catch {
    /* never let a maintenance sweep throw on startup */
  }
}

/**
 * Reflect today's Shorts usage vs the daily limit on the toolbar badge — the
 * always-visible half of the doom-scroll nudge. Shows today's Shorts minutes,
 * green → amber → red as you approach/exceed the limit; cleared when no limit is
 * set. Best-effort: a badge update must never throw.
 */
async function updateShortsBadge(): Promise<void> {
  try {
    const [settings, stats] = await Promise.all([getSettings(), getLifetimeStats()]);
    const todaySeconds = stats.dailyShortsSeconds?.[localDateKey()] ?? 0;
    const status = shortsLimitStatus(todaySeconds, settings.shortsLimitMinutes);
    if (status.level === "off") {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }
    const color =
      status.level === "over" ? "#ef4444" : status.level === "warn" ? "#eab308" : "#22c55e";
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text: String(status.minutes) });
  } catch {
    /* never let a badge update throw */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void getLifetimeStats().then((s) => {
    console.log("[WDIW] installed — stats since", s.since || "(fresh install)");
  });
  void startupStorageSweep();
  void updateShortsBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void startupStorageSweep();
  void updateShortsBadge();
});

// Keep the badge in sync as Shorts time accrues (every WATCH_PROGRESS write hits
// tldwStats) and when the daily limit changes (settings). storage.onChanged
// fires in this worker for its own writes too, so this one listener covers both.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[TLDW_STATS_KEY] || changes[STORAGE_KEYS.settings]) {
    void updateShortsBadge();
  }
});

// Refresh once whenever the service worker spins up.
void updateShortsBadge();

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "WATCH_PROGRESS") {
      const { videoId, deltaSeconds, durationSeconds, isShort, video } = message;
      void (async () => {
        try {
          const settings = await getSettings();
          if (settings.trackEngagement) {
            await recordWatchProgress({
              videoId,
              deltaSeconds,
              durationSeconds,
              // WDIW has no summary panel — playback is the only signal.
              sawSummary: false,
              isShort,
              video,
              settings,
            });
          }
        } catch {
          /* storage error — don't leave the port open; still respond below */
        }
        sendResponse({ ok: true });
      })();
      return true; // async response
    }
    return false;
  },
);
