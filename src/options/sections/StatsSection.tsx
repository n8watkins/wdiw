import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { LifetimeStats, SearchHistoryEntry } from "../../types";
import { getLifetimeStats, getHistory } from "../../lib/storage";
import { computeChannelStats } from "../../lib/history";
import {
  engagedRatio,
  mostEngagedChannels,
  topChannelsByTime,
  type RankedChannel,
} from "../../lib/stats";
import { localDateKey, STORAGE_KEYS, TLDW_STATS_KEY } from "../../lib/constants";
import {
  compareWindows,
  pctDelta,
  type Delta,
  type WindowKind,
  type WindowStats,
} from "../../lib/dashboards";
import { algorithmFeedChannels, doomScrollSessions, longestDoomScroll } from "../../lib/shorts";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format seconds → "Xh Ym" / "Ym" / "<1m" */
function fmtSeconds(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s <= 0) return "0m";
  const m = Math.floor(s / 60);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Streak: consecutive days with ≥1 watched video ending today or yesterday
// ---------------------------------------------------------------------------
function computeStreak(activity: Record<string, number>): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use LOCAL date keys to match the writer (localDateKey): slicing the UTC ISO
  // string here would land on the wrong calendar day in negative-UTC zones and
  // read a real streak as broken.
  const todayStr = localDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = localDateKey(yesterday);

  if (!activity[todayStr] && !activity[yesterdayStr]) return 0;

  let streak = 0;
  const cursor = activity[todayStr] ? new Date(today) : new Date(yesterday);
  while (true) {
    const key = localDateKey(cursor);
    if (!activity[key]) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// 12-week activity heatmap helpers
// ---------------------------------------------------------------------------

/** Build a 7×12 grid (rows=day-of-week, cols=week) from the activity map. */
function buildHeatmapGrid(activity: Record<string, number>): { date: string; count: number }[][] {
  // 84 days total (12 weeks), ending today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the beginning of the week (Sunday) 12 weeks ago.
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - today.getDay()); // rewind to Sunday of current week
  startDay.setDate(startDay.getDate() - 11 * 7);         // 11 more weeks back = 12 weeks total

  const cols: { date: string; count: number }[][] = [];
  for (let col = 0; col < 12; col++) {
    const week: { date: string; count: number }[] = [];
    for (let row = 0; row < 7; row++) {
      const d = new Date(startDay);
      d.setDate(d.getDate() + col * 7 + row);
      const key = localDateKey(d); // match the writer's local-date keys
      week.push({ date: key, count: activity[key] ?? 0 });
    }
    cols.push(week);
  }
  return cols;
}

function heatmapColor(count: number): string {
  if (count === 0) return "rgba(124,58,237,0.07)";
  if (count === 1) return "rgba(124,58,237,0.28)";
  if (count <= 3) return "rgba(124,58,237,0.55)";
  return "rgba(124,58,237,0.9)";
}

// ---------------------------------------------------------------------------
// Donut chart (pure SVG)
// ---------------------------------------------------------------------------
type DonutSlice = { value: number; color: string; label: string };

function DonutChart({ slices, size = 120 }: { slices: DonutSlice[]; size?: number }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.72;
  const stroke = r * 0.46;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  // Skip zero-value slices: a round line-cap paints a visible dot even on a
  // zero-length dash (a stray dot when only one category has a value — common in
  // the short windowed views).
  const arcs = slices.filter((s) => s.value > 0).map((slice) => {
    const pct = slice.value / total;
    const dashArray = `${pct * circumference} ${(1 - pct) * circumference}`;
    const dashOffset = -offset * circumference;
    offset += pct;
    return { ...slice, dashArray, dashOffset, pct };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={stroke}
          strokeDasharray={arc.dashArray}
          strokeDashoffset={arc.dashOffset}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#f1f5f9" fontSize="18" fontWeight="800">
        {fmtCount(total)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="9">
        videos
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Windowed-view helpers
// ---------------------------------------------------------------------------

const WINDOW_LABEL: Record<WindowKind, string> = { week: "week", month: "month", year: "year" };

/** A ▲/▼ pill comparing this window to the prior one. */
function DeltaChip({ delta, suffix = "vs last", unit = "%" }: { delta: Delta; suffix?: string; unit?: string }) {
  if (delta.dir === "new") {
    return <span className="stat-delta new">new</span>;
  }
  if (delta.dir === "flat" || delta.pct === null) return null;
  const arrow = delta.dir === "up" ? "▲" : "▼";
  return (
    <span className={`stat-delta ${delta.dir}`}>
      {arrow} {Math.abs(Math.round(delta.pct))}{unit} {suffix}
    </span>
  );
}

/** A finish-rate (0..1) is a ratio, so compare it in percentage POINTS — a prior
 *  rate of exactly 0% is real data (all skim/skip), not absence, so it must never
 *  read as "new". */
function ratePointsDelta(cur: number, prev: number): Delta {
  const pts = (cur - prev) * 100;
  return { pct: pts, dir: pts > 0.5 ? "up" : pts < -0.5 ? "down" : "flat" };
}

/** Channel avatar with a graceful fallback to a plain circle — YouTube's signed
 *  CDN avatar URLs expire, and a bare <img> would show a broken glyph. Falls
 *  back to the same .stat-channel-av placeholder on missing/expired. */
function ChannelAv({ url }: { url?: string }) {
  const [err, setErr] = useState(false);
  if (!url || err) return <span className="stat-channel-av" />;
  return <img className="stat-channel-av" src={url} alt="" onError={() => setErr(true)} />;
}

/**
 * A ranked list of persisted channels (top-by-time / most-engaged). Each row
 * shows the avatar, name, and a meta line built by `meta`. Empty list renders an
 * inline empty-state. Pure-presentational over RankedChannel from lib/stats.
 */
function RankedChannelList({
  channels,
  meta,
  emptyText,
}: {
  channels: RankedChannel[];
  meta: (c: RankedChannel) => string;
  emptyText: string;
}) {
  if (channels.length === 0) {
    return <div className="stat-empty">{emptyText}</div>;
  }
  return (
    <div>
      {channels.map((c) => (
        <div key={c.key} className="stat-channel-row">
          <ChannelAv url={c.avatarUrl} />
          <span className="stat-channel-name">{c.name}</span>
          <span className="stat-channel-meta">{meta(c)}</span>
        </div>
      ))}
    </div>
  );
}

/** Finish-rate = engaged / rated (0..1, or null when nothing rated). */
function finishRate(e: { engaged: number; skimmed: number; skipped: number }): number | null {
  const rated = e.engaged + e.skimmed + e.skipped;
  return rated > 0 ? e.engaged / rated : null;
}

/** The week/month/year view. Pure-presentational: all data is precomputed. */
function WindowedView({
  kind, cur, prev,
}: {
  kind: WindowKind;
  cur: WindowStats;
  prev: WindowStats;
}) {
  const label = WINDOW_LABEL[kind];
  const finCur = finishRate(cur.engagement);
  const finPrev = finishRate(prev.engagement);
  const ratedTotal = cur.engagement.engaged + cur.engagement.skimmed + cur.engagement.skipped;
  const donutSlices: DonutSlice[] = [
    { value: cur.engagement.engaged, color: "#22c55e", label: "Engaged" },
    { value: cur.engagement.skimmed, color: "#eab308", label: "Skimmed" },
    { value: cur.engagement.skipped, color: "#ef4444", label: "Skipped" },
  ];

  // activeDays comes from the never-pruned activity map, so a long window (year)
  // can have real activity even when in-window history has been pruned away —
  // don't show "nothing watched" in that case.
  if (cur.videosWithMeta === 0 && cur.watchedSeconds === 0 && cur.activeDays === 0) {
    return <div className="empty-state" style={{ marginTop: 8 }}>Nothing watched this {label} yet.</div>;
  }

  return (
    <div>
      {/* Hero — time watched this period */}
      <div className="stat-card" style={{ "--ca": "#14b8a6", "--cg": "rgba(20,184,166,0.22)", marginBottom: 16 } as CSSProperties}>
        <div className="stat-card-label">Time watched this {label}</div>
        <div className="stat-card-num" style={{ color: "#2dd4bf" }}>
          {fmtSeconds(cur.watchedSeconds)}{" "}
          <DeltaChip delta={pctDelta(cur.watchedSeconds, prev.watchedSeconds)} />
        </div>
        <div className="stats-hero-line">
          <strong>{fmtCount(cur.videosWithMeta)}</strong>{" "}
          {cur.videosWithMeta === 1 ? "video" : "videos"} watched.
        </div>
      </div>

      {/* Finish-rate donut + what you watched */}
      <div className="stats-grid stats-mid-row">
        <div className="stat-card stat-card-donut" style={{ "--ca": "#8b5cf6", "--cg": "rgba(139,92,246,0.15)" } as CSSProperties}>
          <div className="stat-card-label">
            Finish rate
            {finCur !== null && finPrev !== null && (
              <span style={{ marginLeft: 8 }}><DeltaChip delta={ratePointsDelta(finCur, finPrev)} unit="pts" /></span>
            )}
          </div>
          {ratedTotal === 0 ? (
            <div className="stat-empty">Nothing rated this {label} yet.</div>
          ) : (
            <div className="stat-donut-body">
              <DonutChart slices={donutSlices} size={130} />
              <div className="stat-donut-legend">
                {donutSlices.map((s) => (
                  <div key={s.label} className="stat-legend-row">
                    <span className="stat-legend-dot" style={{ background: s.color }} />
                    <span className="stat-legend-label">{s.label}</span>
                    <span className="stat-legend-count">{fmtCount(s.value)}</span>
                    <span className="stat-legend-pct">{Math.round((s.value / ratedTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="stat-card" style={{ "--ca": "#f43f5e", "--cg": "rgba(244,63,94,0.12)" } as CSSProperties}>
          <div className="stat-card-label">What you watched</div>
          {cur.topChannels.length === 0 ? (
            <div className="stat-empty">No channels this {label}.</div>
          ) : (
            <div>
              {cur.topChannels.slice(0, 5).map((c) => {
                const b = c.userBreakdown;
                const rated = b.engaged + b.skimmed + b.skipped;
                const eng = rated > 0 ? Math.round((b.engaged / rated) * 100) : null;
                return (
                  <div key={c.channel} className="stat-channel-row">
                    <ChannelAv url={c.avatarUrl} />
                    <span className="stat-channel-name">{c.channel}</span>
                    <span className="stat-channel-meta">
                      {c.count} {c.count === 1 ? "video" : "videos"}{eng !== null ? ` · ${eng}% engaged` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Small tiles */}
      <div className="stats-grid stats-small-row">
        <div className="stat-card stat-card-sm" style={{ "--ca": "#22c55e", "--cg": "rgba(34,197,94,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">📺</div>
          <div className="stat-sm-num" style={{ color: "#4ade80" }}>{fmtCount(cur.videosWithMeta)}</div>
          <div className="stat-sm-label">Videos watched</div>
          <div className="stat-sm-sub"><DeltaChip delta={pctDelta(cur.videosWithMeta, prev.videosWithMeta)} /></div>
        </div>
        <div className="stat-card stat-card-sm" style={{ "--ca": "#06b6d4", "--cg": "rgba(6,182,212,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">🗓</div>
          <div className="stat-sm-num" style={{ color: "#22d3ee" }}>
            {cur.activeDays}<span style={{ fontSize: 14, color: "#64748b" }}> / {cur.totalDays}</span>
          </div>
          <div className="stat-sm-label">Active days</div>
          <div className="stat-sm-sub">this {label}</div>
        </div>
        <div className="stat-card stat-card-sm" style={{ "--ca": "#a78bfa", "--cg": "rgba(167,139,250,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">📡</div>
          <div className="stat-sm-num" style={{ color: "#c4b5fd" }}>{fmtCount(cur.uniqueChannels)}</div>
          <div className="stat-sm-label">Channels</div>
          <div className="stat-sm-sub">this {label}</div>
        </div>
      </div>

      {kind === "year" && (
        <div className="stats-window-note">
          Year view reflects your retained history — older entries may be pruned by your history limit / auto-delete settings.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StatsSection() {
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [view, setView] = useState<WindowKind | "all">("week");

  // Windowed comparison — derived only, recomputed when data or window changes
  // (no extra storage reads; the storage listener already keeps history/stats fresh).
  const comparison = useMemo(
    () =>
      view !== "all" && stats
        ? compareWindows(history, stats.activity, stats.dailySeconds ?? {}, view)
        : null,
    [view, stats, history],
  );

  async function loadAll() {
    const [s, h] = await Promise.all([getLifetimeStats(), getHistory()]);
    setStats(s);
    setHistory(h);
  }

  useEffect(() => {
    void loadAll();

    // Only reload for the keys this page renders, and debounce: watch-time fires
    // frequent storage writes, and reloading everything (2 storage reads +
    // channel-stat recompute) on each is wasteful.
    const RELEVANT = new Set<string>([TLDW_STATS_KEY, STORAGE_KEYS.history]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (!Object.keys(changes).some((k) => RELEVANT.has(k))) return;
      clearTimeout(timer);
      timer = setTimeout(() => void loadAll(), 300);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  if (!stats) {
    return (
      <div className="section-header">
        <div className="section-title">Your watch stats</div>
      </div>
    );
  }

  // Derived values. Per-channel rankings draw from the PERSISTED stats.channels
  // map (the never-pruned source of truth) so "most engaged" / "time spent"
  // survive history pruning — unlike computeChannelStats(history), which only
  // sees the retained window. `channelStats` (history-derived) is still used for
  // "Channels explored" so that count matches the rest of the history views.
  const channelStats = computeChannelStats(history);
  const timeRanked = topChannelsByTime(stats.channels, 5);
  const engagedRanked = mostEngagedChannels(stats.channels, 5);
  // Lifetime "Top channel" = most time spent (engagement-meaningful), from the
  // persisted map.
  const topChannel = timeRanked[0];
  const uniqueChannels = channelStats.length;
  // Global counter (channel-independent) so it stays consistent with the global
  // shortsCount in the Shorts split — the per-channel sum would miss channel-less
  // / evicted-channel videos and make `longCount = total − shorts` skew.
  const totalVideos = stats.videosWatched ?? 0;
  const channelCount = Object.keys(stats.channels ?? {}).length;
  const streak = computeStreak(stats.activity);
  const heatmapGrid = buildHeatmapGrid(stats.activity);

  const donutSlices: DonutSlice[] = [
    { value: stats.engaged, color: "#22c55e", label: "Engaged" },
    { value: stats.skimmed, color: "#eab308", label: "Skimmed" },
    { value: stats.skipped, color: "#ef4444", label: "Skipped" },
  ];
  const donutTotal = stats.engaged + stats.skimmed + stats.skipped;
  const finishPct = donutTotal > 0 ? Math.round((stats.engaged / donutTotal) * 100) : null;

  // Shorts split. Lifetime totals come from the never-pruned stats (shorts is a
  // subset of secondsWatched/totalVideos). The doom-scroll session + algorithm-
  // feed list need per-entry timestamps, so they read the retained history window.
  const shortsSeconds = stats.shortsSeconds ?? 0;
  const shortsCount = stats.shortsCount ?? 0;
  const longSeconds = Math.max(0, stats.secondsWatched - shortsSeconds);
  const longCount = Math.max(0, totalVideos - shortsCount);
  const hasShorts = shortsCount > 0 || shortsSeconds > 0;
  const shortsPct = stats.secondsWatched > 0 ? Math.round((shortsSeconds / stats.secondsWatched) * 100) : 0;
  const feedChannels = hasShorts ? algorithmFeedChannels(history, 5) : [];
  const longestSession = hasShorts ? longestDoomScroll(doomScrollSessions(history)) : null;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Your watch stats</div>
        <div className="section-desc">
          Where your YouTube time actually goes — counted locally, nothing leaves your browser.
        </div>
      </div>

      <div className="stats-window-toggle" role="tablist" aria-label="Stats window">
        {(["week", "month", "year", "all"] as const).map((w) => (
          <button
            key={w}
            role="tab"
            aria-selected={view === w}
            className={view === w ? "active" : ""}
            onClick={() => setView(w)}
          >
            {w === "all" ? "All-time" : w === "week" ? "This week" : w === "month" ? "This month" : "This year"}
          </button>
        ))}
      </div>

      {view !== "all" && comparison && (
        <WindowedView
          kind={view}
          cur={comparison.current}
          prev={comparison.previous}
        />
      )}

      {view === "all" && (
      <>
      {/* ── Hero row ───────────────────────────────────────────── */}
      <div className="stats-grid stats-hero-row">

        <div className="stat-card" style={{ "--ca": "#14b8a6", "--cg": "rgba(20,184,166,0.22)" } as CSSProperties}>
          <div className="stat-card-label">Time watched</div>
          <div className="stat-card-num" style={{ color: "#2dd4bf" }}>{fmtSeconds(stats.secondsWatched)}</div>
          <div className="stat-card-sub">tracked locally</div>
        </div>

        <div className="stat-card" style={{ "--ca": "#7c3aed", "--cg": "rgba(124,58,237,0.25)" } as CSSProperties}>
          <div className="stat-card-label">Videos watched</div>
          <div className="stat-card-num" style={{ color: "#a78bfa" }}>{fmtCount(totalVideos)}</div>
          <div className="stat-card-sub">across {fmtCount(channelCount)} channels</div>
        </div>

        <div className="stat-card" style={{ "--ca": "#f43f5e", "--cg": "rgba(244,63,94,0.22)" } as CSSProperties}>
          <div className="stat-card-label">Top channel</div>
          <div className="stat-card-num" style={{ color: "#fb7185", fontSize: topChannel ? "18px" : undefined }}>
            {topChannel ? topChannel.name : "—"}
          </div>
          <div className="stat-card-sub">
            {topChannel ? `${fmtSeconds(topChannel.secondsWatched)} watched` : "no data yet"}
          </div>
        </div>
      </div>

      {/* ── Middle row: donut + heatmap ────────────────────────── */}
      <div className="stats-grid stats-mid-row">

        {/* Engagement donut */}
        <div className="stat-card stat-card-donut" style={{ "--ca": "#8b5cf6", "--cg": "rgba(139,92,246,0.15)" } as CSSProperties}>
          <div className="stat-card-label">Engagement breakdown</div>
          {donutTotal === 0 ? (
            <div className="stat-empty">Watch some videos — WDIW rates them automatically.</div>
          ) : (
            <div className="stat-donut-body">
              <DonutChart slices={donutSlices} size={130} />
              <div className="stat-donut-legend">
                {donutSlices.map((s) => {
                  const pct = donutTotal > 0 ? Math.round((s.value / donutTotal) * 100) : 0;
                  return (
                    <div key={s.label} className="stat-legend-row">
                      <span className="stat-legend-dot" style={{ background: s.color }} />
                      <span className="stat-legend-label">{s.label}</span>
                      <span className="stat-legend-count">{fmtCount(s.value)}</span>
                      <span className="stat-legend-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Activity heatmap */}
        <div className="stat-card stat-card-heatmap" style={{ "--ca": "#7c3aed", "--cg": "rgba(124,58,237,0.12)" } as CSSProperties}>
          <div className="stat-card-label">
            Activity
            {streak > 0 && (
              <span className="stat-streak">🔥 {streak}-day streak</span>
            )}
          </div>
          <div className="stat-heatmap">
            {heatmapGrid.map((week, wi) => (
              <div key={wi} className="stat-heatmap-col">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className="stat-heatmap-cell"
                    title={day.count > 0 ? `${day.date}: ${day.count} video${day.count === 1 ? "" : "s"}` : day.date}
                    style={{ background: heatmapColor(day.count) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Per-channel engagement: time spent + most engaged ───── */}
      <div className="stats-grid stats-mid-row">

        <div className="stat-card" style={{ "--ca": "#14b8a6", "--cg": "rgba(20,184,166,0.12)" } as CSSProperties}>
          <div className="stat-card-label">Top channels by time spent</div>
          <RankedChannelList
            channels={timeRanked}
            emptyText="No watch time tracked per channel yet."
            meta={(c) => {
              const vids = `${fmtCount(c.videosWatched)} ${c.videosWatched === 1 ? "video" : "videos"}`;
              return `${fmtSeconds(c.secondsWatched)} · ${vids}`;
            }}
          />
        </div>

        <div className="stat-card" style={{ "--ca": "#22c55e", "--cg": "rgba(34,197,94,0.12)" } as CSSProperties}>
          <div className="stat-card-label">Most engaged channels</div>
          <RankedChannelList
            channels={engagedRanked}
            emptyText="No engaged videos tracked per channel yet."
            meta={(c) => {
              const ratio = engagedRatio(c);
              const eng = `${fmtCount(c.engaged)} engaged`;
              return ratio !== null ? `${eng} · ${Math.round(ratio * 100)}%` : eng;
            }}
          />
        </div>
      </div>

      {/* ── Shorts: split + doom-scroll + algorithm feed ────────── */}
      {hasShorts && (
      <div className="stats-grid stats-mid-row">

        <div className="stat-card" style={{ "--ca": "#f43f5e", "--cg": "rgba(244,63,94,0.12)" } as CSSProperties}>
          <div className="stat-card-label">Shorts vs long-form</div>
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", margin: "12px 0 14px" }}>
            <div style={{ width: `${shortsPct}%`, background: "#f43f5e" }} />
            <div style={{ width: `${100 - shortsPct}%`, background: "#22c55e" }} />
          </div>
          <div className="stat-channel-row">
            <span className="stat-channel-name"><span style={{ color: "#fb7185" }}>●</span> Shorts</span>
            <span className="stat-channel-meta">
              {fmtSeconds(shortsSeconds)} · {fmtCount(shortsCount)} {shortsCount === 1 ? "short" : "shorts"}
            </span>
          </div>
          <div className="stat-channel-row">
            <span className="stat-channel-name"><span style={{ color: "#4ade80" }}>●</span> Long-form</span>
            <span className="stat-channel-meta">
              {fmtSeconds(longSeconds)} · {fmtCount(longCount)} {longCount === 1 ? "video" : "videos"}
            </span>
          </div>
          {longestSession && (
            <div className="stats-window-note" style={{ marginTop: 12 }}>
              Longest doom-scroll: <strong>{fmtCount(longestSession.count)}</strong> shorts in a row · {fmtSeconds(longestSession.seconds)}
            </div>
          )}
        </div>

        <div className="stat-card" style={{ "--ca": "#a78bfa", "--cg": "rgba(167,139,250,0.12)" } as CSSProperties}>
          <div className="stat-card-label">Channels the algorithm feeds you</div>
          {feedChannels.length === 0 ? (
            <div className="stat-empty">No Shorts tracked in your recent history yet.</div>
          ) : (
            <div>
              {feedChannels.map((c) => (
                <div key={c.channel} className="stat-channel-row">
                  <span className="stat-channel-av" />
                  <span className="stat-channel-name">{c.channel}</span>
                  <span className="stat-channel-meta">
                    {fmtCount(c.shortsCount)} {c.shortsCount === 1 ? "short" : "shorts"} · {fmtSeconds(c.shortsSeconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Small tile row ──────────────────────────────────────── */}
      <div className="stats-grid stats-small-row">

        <div className="stat-card stat-card-sm" style={{ "--ca": "#22c55e", "--cg": "rgba(34,197,94,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">🎯</div>
          <div className="stat-sm-num" style={{ color: "#4ade80" }}>{finishPct !== null ? `${finishPct}%` : "—"}</div>
          <div className="stat-sm-label">Finish rate</div>
          <div className="stat-sm-sub">of rated videos engaged</div>
        </div>

        <div className="stat-card stat-card-sm" style={{ "--ca": "#06b6d4", "--cg": "rgba(6,182,212,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">📡</div>
          <div className="stat-sm-num" style={{ color: "#22d3ee" }}>{fmtCount(uniqueChannels)}</div>
          <div className="stat-sm-label">Channels explored</div>
          <div className="stat-sm-sub">in your history</div>
        </div>

        <div className="stat-card stat-card-sm" style={{ "--ca": "#a78bfa", "--cg": "rgba(167,139,250,0.15)" } as CSSProperties}>
          <div className="stat-sm-icon">🔥</div>
          <div className="stat-sm-num" style={{ color: "#c4b5fd" }}>{fmtCount(streak)}</div>
          <div className="stat-sm-label">Day streak</div>
          <div className="stat-sm-sub">consecutive days</div>
        </div>

      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      {stats.since && (
        <div className="stats-since">
          Tracking since {fmtDate(stats.since)}
        </div>
      )}
      </>
      )}
    </div>
  );
}
