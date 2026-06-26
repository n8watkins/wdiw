import { useEffect, useState } from "react";
import { getLifetimeStats } from "../lib/storage";

export function App() {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    void getLifetimeStats().then((s) => setSeconds(s.secondsWatched));
  }, []);

  return (
    <div style={{ width: 280, padding: 16, font: "14px/1.4 system-ui, sans-serif" }}>
      <strong style={{ fontSize: 15 }}>Watchprint</strong>
      <p style={{ color: "#666", fontSize: 12, margin: "6px 0" }}>
        {seconds === null
          ? "Loading…"
          : `${Math.round(seconds / 60)} min watched (tracked locally)`}
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>Open Options for the full dashboard.</p>
    </div>
  );
}
