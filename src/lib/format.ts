/**
 * Shared duration formatters — one source of truth so the same watch time reads
 * identically across Stats, Channels, History, and the popup (previously each
 * file had its own slightly-divergent `fmtSeconds`).
 *
 * Two granularities, by context:
 *  - `fmtDuration`     — coarse ("Xh Ym" / "Ym" / "<1m"), for AGGREGATE times
 *    (lifetime/today totals, per-channel totals).
 *  - `fmtDurationFine` — precise ("Xh Ym" / "Xm Ys" / "Xs"), for PER-VIDEO times
 *    (a single video's watched/duration), where seconds matter.
 */

/** Coarse watch-time, e.g. "2h 15m" / "47m" / "<1m" / "0m". */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.round(Math.max(0, totalSeconds));
  if (s <= 0) return "0m";
  const m = Math.floor(s / 60);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** Precise watch-time, e.g. "1h 4m" / "12m 30s" / "45s". */
export function fmtDurationFine(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
