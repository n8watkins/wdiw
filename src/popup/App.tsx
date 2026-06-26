import { useEffect, useState } from "react";
import { getLifetimeStats } from "../lib/storage";
import { localDateKey } from "../lib/constants";

/** seconds → "Xh Ym" / "Ym" / "<1m" / "0m" */
function fmtSeconds(total: number): string {
  const s = Math.round(total);
  if (s <= 0) return "0m";
  const m = Math.floor(s / 60);
  if (m < 1) return "<1m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

type Today = {
  seconds: number;
  shortsSeconds: number;
  videos: number;
};

const C = {
  bg: "#0d1424",
  surface: "#111827",
  border: "#1f2f45",
  text: "#f1f5f9",
  muted: "#94a3b8",
  faint: "#64748b",
  accent: "#a78bfa",
};

export function App() {
  const [today, setToday] = useState<Today | null>(null);
  const [lifetimeSeconds, setLifetimeSeconds] = useState(0);

  useEffect(() => {
    void (async () => {
      const stats = await getLifetimeStats();
      // "Today" is read from the never-pruned per-day maps, attributed to the day
      // time was actually watched (not a video's first-seen day).
      const key = localDateKey();
      setToday({
        seconds: stats.dailySeconds?.[key] ?? 0,
        shortsSeconds: stats.dailyShortsSeconds?.[key] ?? 0,
        videos: stats.activity?.[key] ?? 0,
      });
      setLifetimeSeconds(stats.secondsWatched);
    })();
  }, []);

  const hasToday = today !== null && (today.seconds > 0 || today.videos > 0);

  return (
    <div
      style={{
        width: 300,
        padding: 18,
        background: C.bg,
        color: C.text,
        font: "14px/1.45 system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 16, letterSpacing: "0.04em", color: C.accent }}>Watchprint</strong>
        <span style={{ fontSize: 11, color: C.faint }}>Today</span>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 16,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
        }}
      >
        {today === null ? (
          <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : hasToday ? (
          <>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
              {fmtSeconds(today.seconds)}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              watched today · {today.videos} {today.videos === 1 ? "video" : "videos"}
            </div>
            {today.shortsSeconds > 0 && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px solid ${C.border}`,
                  fontSize: 13,
                  color: C.text,
                  fontWeight: 600,
                }}
              >
                📱 {fmtSeconds(today.shortsSeconds)}
                <span style={{ color: C.muted, fontWeight: 400 }}> on Shorts today</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Nothing watched yet today</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              Watch a YouTube video and your time shows up here — tracked locally.
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
        <span style={{ fontSize: 11, color: C.faint }}>
          {fmtSeconds(lifetimeSeconds)} all-time
        </span>
        <button
          onClick={() => void chrome.runtime.openOptionsPage()}
          style={{
            background: "linear-gradient(180deg, #7c3aed, #6d28d9)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Open dashboard →
        </button>
      </div>
    </div>
  );
}
