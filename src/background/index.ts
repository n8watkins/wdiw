import { expireOldEntries, trimToLimit } from "../lib/history";
import {
  getHistory,
  getLifetimeStats,
  getSettings,
  recordWatchProgress,
  setHistory,
} from "../lib/storage";
import type { RuntimeMessage } from "../types";

// Watchprint service worker — local-only watch-behavior recorder.
//
// The YouTube content script (src/content/watchtime.ts) observes playback and
// broadcasts WATCH_PROGRESS deltas; this worker accumulates them via
// recordWatchProgress() under the storage write-lock. No Gemini, no AI, no
// destination injectors — Watchprint only records what you watch.

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

chrome.runtime.onInstalled.addListener(() => {
  void getLifetimeStats().then((s) => {
    console.log("[watchprint] installed — stats since", s.since || "(fresh install)");
  });
  void startupStorageSweep();
});

chrome.runtime.onStartup.addListener(() => {
  void startupStorageSweep();
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === "WATCH_PROGRESS") {
      const { videoId, deltaSeconds, durationSeconds, video } = message;
      void (async () => {
        try {
          const settings = await getSettings();
          if (settings.trackEngagement) {
            await recordWatchProgress({
              videoId,
              deltaSeconds,
              durationSeconds,
              // Watchprint has no summary panel — playback is the only signal.
              sawSummary: false,
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
