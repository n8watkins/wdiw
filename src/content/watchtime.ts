/**
 * Watch-time CAPTURE content script for Watchprint.
 *
 * Runs on youtube.com watch pages (isolated world). It observes the player and
 * periodically reports how many content-seconds the user has actually watched
 * for each video to the background worker via WATCH_PROGRESS messages. The
 * background reads settings and records the deltas — this script never reads
 * settings or summarizes anything (Watchprint is local-only analytics).
 *
 * Self-contained: the YouTube meta scrapers (video id, channel info, video
 * meta) are inlined here so the script has no runtime dependencies beyond the
 * shared message type. Ported from TL;DW's content/watchtime.ts +
 * content/youtube.ts, preserving the watch-time double-counting fix.
 *
 * Time tracking:
 *  - Uses `timeupdate` events; delta = currentTime − lastTime.
 *  - Counts forward motion consistent with continuous playback since the last
 *    tick (rate-corrected, seek-rejecting). Works at any playback speed and in
 *    throttled background tabs.
 *  - On `seeked`, resets lastTime so the seek gap is not counted.
 *
 * Reporting triggers:
 *  - Every ~10 accumulated unreported content-seconds.
 *  - On `visibilitychange` (hidden).
 *  - On navigation away (handleNav reset).
 *  - On `pagehide`.
 *
 * SPA navigation:
 *  - currentVideoId() + immediate run + yt-navigate-finish + 500ms interval poll,
 *    so tracking follows YouTube's client-side navigation and resets per video.
 */

import type { WatchProgressMessage } from "../types";

const log = (...args: unknown[]) => console.log("[Watchprint WT]", ...args);

// ---- inlined YouTube scrapers ----------------------------------------------

const currentVideoId = (): string => {
  try {
    return new URLSearchParams(location.search).get("v") ?? "";
  } catch {
    return "";
  }
};

/** Parse "12:34" / "1:02:03" into seconds. */
function hmsToSeconds(text: string | null | undefined): number {
  if (!text) return 0;
  const parts = text.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

type ChannelInfo = { id: string; name: string; avatarUrl: string };

/** Extract channel handle/ID, display name, and avatar from the current watch page. */
function getChannelInfo(): ChannelInfo | null {
  // querySelectorAll returns elements in DOM order. The avatar link appears before the
  // channel-name link and has no text content, so we iterate and skip empty anchors
  // rather than stopping at the first match.
  const candidates = document.querySelectorAll<HTMLAnchorElement>(
    "ytd-video-owner-renderer a[href^='/@'], ytd-video-owner-renderer a[href^='/channel/'], " +
      "ytd-channel-name a[href^='/@'], ytd-channel-name a[href^='/channel/'], " +
      "#owner a[href^='/@'], #owner a[href^='/channel/'], " +
      "ytd-channel-name a, #owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint",
  );
  let anchor: HTMLAnchorElement | null = null;
  let name = "";
  for (const el of candidates) {
    const text = el.textContent?.trim() ?? "";
    if (text) {
      anchor = el;
      name = text;
      break;
    }
  }
  if (!anchor || !name) return null;
  const href = anchor.getAttribute("href") ?? "";
  const id = href.startsWith("/") ? href : `/@${name}`;
  const avatarUrl =
    document.querySelector<HTMLImageElement>(
      "ytd-video-owner-renderer #avatar img, #owner yt-img-shadow img, ytd-video-owner-renderer yt-img-shadow img",
    )?.src ?? "";
  return { id, name, avatarUrl };
}

/** Read the current video's duration (seconds), channel name, and channel avatar URL. */
function getVideoMeta(): { durationSeconds: number; channel: string; avatarUrl?: string } {
  const v = document.querySelector<HTMLVideoElement>("video.html5-main-video, video");
  let durationSeconds = v && Number.isFinite(v.duration) ? v.duration : 0;
  if (!durationSeconds) {
    durationSeconds = hmsToSeconds(document.querySelector(".ytp-time-duration")?.textContent);
  }
  const info = getChannelInfo();
  const channel =
    info?.name ??
    document
      .querySelector(
        "ytd-channel-name a, #owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint",
      )
      ?.textContent?.trim() ??
    "";
  const avatarUrl = info?.avatarUrl || undefined;
  return { durationSeconds, channel, avatarUrl };
}

/** Build the WATCH_PROGRESS `video` payload: url + title + channel + avatar. */
function currentVideoMeta(): WatchProgressMessage["video"] {
  const title = document.title.replace(/\s*-\s*YouTube$/, "").trim() || undefined;
  const meta = getVideoMeta();
  return {
    url: location.href,
    title,
    channel: meta.channel || undefined,
    avatarUrl: meta.avatarUrl,
  };
}

// ---- module state -----------------------------------------------------------

let currentVid = "";
let lastHandledVid = "";

/** Accumulated content-seconds for the current video (never resets mid-video). */
let totalWatched = 0;
/** Unreported content-seconds since the last successful sendMessage. */
let pendingDelta = 0;
/** Threshold for periodic reports (content-seconds). */
const REPORT_INTERVAL_S = 10;

let video: HTMLVideoElement | null = null;
let lastTime = 0;
/** Wall-clock ms of the last timeupdate, to bound how far content can have
 *  legitimately advanced since (continuous playback vs. a seek). */
let lastTickAt = 0;

/**
 * Snapshots taken while the tracked video is actually playing, so a forced
 * flush during navigation reports the OLD video's duration/meta — not whatever
 * the DOM happens to show for the next video.
 */
let lastKnownDuration = 0;
let lastKnownMeta: WatchProgressMessage["video"] | null = null;
let lastMetaRefresh = 0;

// ---- reporting --------------------------------------------------------------

function currentDuration(): number {
  return video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
}

async function reportProgress(forced = false): Promise<void> {
  if (pendingDelta <= 0 && !forced) return;
  const vid = currentVid;
  if (!vid) return;

  // Claim the pending seconds BEFORE the await, not after. sendMessage to a cold
  // service worker is slow, so a periodic report and a visibilitychange/pagehide
  // flush routinely overlap; reading `delta` here but only subtracting after the
  // await let both calls capture — and the background double-count — the SAME
  // seconds. Zero it up front; restore on failure so nothing is lost.
  const delta = pendingDelta;
  pendingDelta = 0;
  // Prefer snapshots captured while this video was playing — during a SPA
  // navigation the live DOM may already describe the NEXT video.
  const dur = lastKnownDuration || currentDuration();
  const videoMeta = lastKnownMeta ?? currentVideoMeta();

  const message: WatchProgressMessage = {
    type: "WATCH_PROGRESS",
    videoId: vid,
    deltaSeconds: delta,
    durationSeconds: dur,
    sawSummary: false, // Watchprint never summarizes.
    video: videoMeta,
  };

  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // Service worker may be sleeping — return the seconds to the pending pool so
    // the next report retries them (unless we've since navigated to a new video,
    // in which case handleNav already reset the counters and they don't apply).
    if (currentVid === vid) pendingDelta += delta;
  }
}

// ---- video element listener -------------------------------------------------

function onTimeUpdate(): void {
  if (!video) return;
  const now = Date.now();
  const wallElapsed = lastTickAt ? (now - lastTickAt) / 1000 : 0;
  lastTickAt = now;
  const t = video.currentTime;
  const delta = t - lastTime;
  lastTime = t;
  // Count forward motion consistent with continuous playback since the last
  // tick. The expected content advance is (wall-clock elapsed × playbackRate); a
  // real seek jumps far beyond that and is rejected — rate-correct AND
  // seek-rejecting at any speed. CLAMP the gap: while paused/buffering/suspended
  // ticks stop, so an un-clamped wallElapsed (seconds–minutes) would inflate the
  // window and let a subsequent seek through. Normal playback ticks every
  // ~0.25–1s, so 4s covers even a throttled background tab; the first tick (no
  // prior timestamp) uses a 1s baseline.
  const rate = video.playbackRate || 1;
  const gap = wallElapsed > 0 ? Math.min(wallElapsed, 4) : 1;
  const maxStep = gap * rate + 1;
  if (delta > 0 && delta <= maxStep) {
    totalWatched += delta;
    pendingDelta += delta;
    // Snapshot while this video is verifiably the one playing (cheap reads
    // every tick; the meta querySelectors at most every 5s).
    lastKnownDuration = currentDuration() || lastKnownDuration;
    if (Date.now() - lastMetaRefresh > 5000) {
      lastMetaRefresh = Date.now();
      lastKnownMeta = currentVideoMeta();
    }
    if (pendingDelta >= REPORT_INTERVAL_S) {
      void reportProgress();
    }
  }
}

function onSeeked(): void {
  // Reset so the next timeupdate doesn't count the seek gap as watch time.
  if (video) lastTime = video.currentTime;
}

function findVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>("video.html5-main-video, video");
}

function attach(): void {
  const v = findVideo();
  if (!v) {
    window.setTimeout(attach, 500);
    return;
  }
  if (v === video) return; // already wired
  video?.removeEventListener("timeupdate", onTimeUpdate);
  video?.removeEventListener("seeked", onSeeked);
  video = v;
  lastTime = v.currentTime;
  video.addEventListener("timeupdate", onTimeUpdate);
  video.addEventListener("seeked", onSeeked);
}

// ---- navigation -------------------------------------------------------------

function handleNav(): void {
  const vid = currentVideoId();
  if (vid === lastHandledVid) return;

  // Report any pending delta for the OLD video before resetting. This runs
  // synchronously up to the sendMessage await, so it captures the old
  // currentVid + snapshots before we reset below.
  if (lastHandledVid && pendingDelta > 0) {
    void reportProgress(true);
  }

  lastHandledVid = vid;
  currentVid = vid;
  totalWatched = 0;
  pendingDelta = 0;
  lastTime = 0;
  lastTickAt = 0;
  lastKnownDuration = 0;
  lastKnownMeta = null;
  lastMetaRefresh = 0;

  // Left the watch page entirely (home, search, channel…) — nothing to track.
  if (!vid) return;

  attach();
  log("tracking video", vid);
}

// ---- visibility / pagehide flush ------------------------------------------

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    void reportProgress(true);
  }
});

window.addEventListener("pagehide", () => {
  void reportProgress(true);
});

// ---- SPA navigation strategy (immediate + yt-navigate-finish + interval) ----

handleNav();
window.addEventListener("yt-navigate-finish", () => handleNav());
window.setInterval(() => handleNav(), 500);

export {};
