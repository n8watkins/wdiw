/**
 * Pure accuracy gate for the watch-time engine (the "is this tick real watching?"
 * decision), factored out of the content script so it's unit-testable — the
 * capture path otherwise has no tests. Given one `timeupdate` tick's raw numbers
 * + the player/page state, it returns how many seconds of *genuine* watch time to
 * credit (0 = don't count).
 *
 * The accuracy rules (IDEAS §1.3 — "the tracker that's actually right"):
 *  - Don't count a HIDDEN tab (background audio is not watching). The caller treats
 *    Picture-in-Picture as visible, so PiP still counts.
 *  - Don't count while PAUSED or ENDED (e.g. an autoplay chain that stopped).
 *  - Don't count AD playback (the ad runs in the same <video>, on its own timeline).
 *  - Reject SEEKS and rewinds: only forward motion consistent with continuous
 *    playback since the last tick counts (rate-corrected; the gap is clamped so a
 *    long pause/buffer/suspend can't widen the window and let a later seek through).
 */
export type TickInput = {
  /** currentTime − lastTime (seconds). */
  delta: number;
  /** Wall-clock seconds since the previous tick (0 on the first tick). */
  wallElapsed: number;
  /** video.playbackRate (1 = normal). */
  rate: number;
  /** Tab is hidden AND not in Picture-in-Picture (caller folds PiP in). */
  hidden: boolean;
  /** video.paused. */
  paused: boolean;
  /** video.ended. */
  ended: boolean;
  /** An ad is currently showing in the player. */
  adShowing: boolean;
};

/** Seconds of real watch time to credit for one timeupdate tick (0 = ignore). */
export function countableSeconds(t: TickInput): number {
  // Not actually watching → don't count.
  if (t.hidden || t.paused || t.ended || t.adShowing) return 0;
  // Expected content advance since the last tick is (clamped wall-time × rate);
  // a real seek jumps far beyond that. The first tick (no prior timestamp) uses a
  // 1s baseline; 4s of clamp covers even a throttled tab firing slow ticks.
  const gap = t.wallElapsed > 0 ? Math.min(t.wallElapsed, 4) : 1;
  const maxStep = gap * (t.rate || 1) + 1;
  return t.delta > 0 && t.delta <= maxStep ? t.delta : 0;
}
