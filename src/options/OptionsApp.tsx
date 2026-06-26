import { useEffect, useState } from "react";
import { getLifetimeStats } from "../lib/storage";

export function OptionsApp() {
  const [summary, setSummary] = useState<{ seconds: number; channels: number } | null>(null);

  useEffect(() => {
    void getLifetimeStats().then((s) =>
      setSummary({ seconds: s.secondsWatched, channels: Object.keys(s.channels ?? {}).length }),
    );
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16, font: "15px/1.5 system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 4 }}>Watchprint</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Your YouTube usage, computed locally. This is the foundation scaffold — the Stats / Channels /
        History dashboards are being ported from TL;DW (the data layer is already here and tested).
      </p>
      <p>
        {summary === null
          ? "Loading…"
          : `${Math.round(summary.seconds / 60)} min watched across ${summary.channels} channel${summary.channels === 1 ? "" : "s"} (tracked locally).`}
      </p>
    </div>
  );
}
