import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchHistoryEntry } from "../../types";
import { getHistory } from "../../lib/storage";
import { computeChannelStats, type ChannelStats } from "../../lib/history";
import { USER_RATING_LABELS, userAvgToLabel, STORAGE_KEYS } from "../../lib/constants";
import { VirtualList } from "../components/VirtualList";

// ---- helpers ----------------------------------------------------------------

/** Format a watch-time duration in seconds → "Xh Ym" / "Ym" / "<1m" / "0m". */
function fmtSeconds(seconds: number): string {
  if (seconds <= 0) return "0m";
  if (seconds < 60) return "<1m";
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  return `${mins}m`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

function channelColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** Pill colors for an engagement verdict label (Engaged/Skimmed/Skipped). */
function engagementPillStyle(label: string): { background: string; color: string } {
  if (label === USER_RATING_LABELS.watch) return { background: "#16a34a", color: "#fff" };
  if (label === USER_RATING_LABELS.skim) return { background: "#d97706", color: "#fff" };
  return { background: "#dc2626", color: "#fff" };
}

type SortKey = "time" | "count" | "recent";

// ---- Avatar component -------------------------------------------------------

function ChannelAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const [imgError, setImgError] = useState(false);
  const showFallback = !avatarUrl || imgError;
  const color = channelColor(name);
  const letter = name.charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: showFallback ? color : "transparent",
        color: "#fff",
        fontWeight: 700,
        fontSize: 18,
      }}
    >
      {!showFallback && (
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {showFallback && letter}
    </div>
  );
}

// ---- Video row inside expanded card -----------------------------------------

function VideoRow({ entry }: { entry: SearchHistoryEntry }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Title */}
      <button
        onClick={() => void chrome.tabs.create({ url: entry.videoUrl })}
        style={{
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text)",
          fontSize: 13,
          lineHeight: "1.4",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: "underline",
          textDecorationColor: "var(--border)",
          textUnderlineOffset: "2px",
        }}
        title={entry.videoTitle ?? entry.videoUrl}
      >
        {entry.videoTitle ?? entry.videoUrl}
      </button>

      {/* Personal engagement pill */}
      {entry.userRating && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            background: "var(--border)",
            color: "var(--text)",
          }}
        >
          {USER_RATING_LABELS[entry.userRating]}
        </span>
      )}

      {/* Watch fraction */}
      {entry.durationSeconds && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 11,
            color: "var(--muted)",
            whiteSpace: "nowrap",
          }}
        >
          {fmtSeconds(entry.watchedSeconds ?? 0)} / {fmtSeconds(entry.durationSeconds)}
        </span>
      )}

      {/* Date */}
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          color: "var(--muted)",
          whiteSpace: "nowrap",
          minWidth: 40,
          textAlign: "right",
        }}
      >
        {shortDate(entry.createdAt)}
      </span>
    </div>
  );
}

// ---- Channel card -----------------------------------------------------------

function ChannelCard({ stats }: { stats: ChannelStats }) {
  const [expanded, setExpanded] = useState(false);

  const engagementLabel =
    stats.avgUserRating !== null ? userAvgToLabel(stats.avgUserRating) : null;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "12px 16px",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Avatar */}
        <ChannelAvatar name={stats.channel} avatarUrl={stats.avatarUrl} />

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {stats.channel}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {stats.count} {stats.count === 1 ? "video" : "videos"} · {fmtSeconds(stats.watchedSeconds)}
            </span>
            {/* Personal engagement pill */}
            {engagementLabel !== null && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  ...engagementPillStyle(engagementLabel),
                }}
                title={`Engaged ${stats.userBreakdown.engaged} · Skimmed ${stats.userBreakdown.skimmed} · Skipped ${stats.userBreakdown.skipped}`}
              >
                usually {engagementLabel}
              </span>
            )}
            {/* Last watched */}
            {stats.lastWatched && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {timeAgo(stats.lastWatched)}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <span
          style={{
            flexShrink: 0,
            fontSize: 14,
            color: "var(--muted)",
            transition: "transform 0.2s",
            display: "inline-block",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>

      {/* Expandable video list (CSS grid accordion) */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 0.2s ease",
          overflow: "hidden",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "4px 16px 8px 16px",
            }}
          >
            {/* Render the video rows only while open (the accordion otherwise
                mounts EVERY channel's full list even when collapsed) and window
                them, so a channel with hundreds of watched videos stays cheap. */}
            {expanded && (
              <VirtualList
                items={stats.videos}
                getKey={(v) => v.id}
                estimateSize={40}
                gap={0}
                style={{ maxHeight: 320 }}
                renderItem={(v) => <VideoRow entry={v} />}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main section -----------------------------------------------------------

export function ChannelsSection() {
  const [channels, setChannels] = useState<ChannelStats[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    const history = await getHistory();
    setChannels(computeChannelStats(history));
    setTotalVideos(history.filter((e) => !!e.channel).length);
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEYS.history]) void reload();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  const sorted = useMemo(() => {
    return [...channels].sort((a, b) => {
      if (sortKey === "time") return b.watchedSeconds - a.watchedSeconds;
      if (sortKey === "count") return b.count - a.count;
      // recent
      return new Date(b.lastWatched).getTime() - new Date(a.lastWatched).getTime();
    });
  }, [channels, sortKey]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return sorted;
    return sorted.filter((ch) => ch.channel.toLowerCase().includes(q));
  }, [sorted, q]);

  return (
    <div>
      {/* Section header */}
      <div className="section-header">
        <h1 className="section-title">Channels</h1>
        <p className="section-desc">
          Every channel you've watched — how much time you spent and how engaged you were. Counted locally.
        </p>
      </div>

      {channels.length === 0 ? (
        <div className="empty-state">
          No channel data yet. Watch some YouTube videos and your channels will appear here.
        </div>
      ) : (
        <>
          <div className="history-toolbar" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search channels by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              {visible.length === channels.length
                ? `${channels.length} channels · ${totalVideos} videos total`
                : `${visible.length} of ${channels.length} channels`}
            </p>
            <select
              className="setting-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              style={{ fontSize: 12 }}
            >
              <option value="time">Most time</option>
              <option value="count">Most videos</option>
              <option value="recent">Recent</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="empty-state">No channels match “{search}”.</div>
          ) : (
            <VirtualList
              items={visible}
              getKey={(ch) => ch.channel}
              estimateSize={76}
              style={{ maxHeight: "calc(100vh - 260px)" }}
              renderItem={(ch) => <ChannelCard stats={ch} />}
            />
          )}
        </>
      )}
    </div>
  );
}
