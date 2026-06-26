import { getLifetimeStats } from "../lib/storage";

// Watchprint service worker — foundation only.
//
// Step 2 wires the real loop: a YouTube content script (watch-time observer +
// channel-info scraper, ported from TL;DW) broadcasts WATCH_PROGRESS, and this
// worker records it via recordWatchProgress() under the storage write-lock, plus
// a startup history/stats sweep. For now it just proves the data layer is
// reachable from the worker.
chrome.runtime.onInstalled.addListener(() => {
  void getLifetimeStats().then((s) => {
    console.log("[watchprint] installed — stats since", s.since || "(fresh install)");
  });
});
