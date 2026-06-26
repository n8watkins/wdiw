import { useEffect, useState, type CSSProperties } from "react";
import { StatsSection } from "./sections/StatsSection";
import { ChannelsSection } from "./sections/ChannelsSection";
import { HistorySection } from "./sections/HistorySection";
import { SettingsSection } from "./sections/SettingsSection";
import { getSettings, setSettings } from "../lib/storage";

/**
 * One-time welcome banner — sets the local-only expectation and points new users
 * at the Takeout import for past history. Persists via settings.firstRunNoticeSeen.
 */
function FirstRunNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    void getSettings().then((s) => setShow(!s.firstRunNoticeSeen));
  }, []);
  if (!show) return null;
  async function dismiss() {
    setShow(false);
    const s = await getSettings();
    await setSettings({ ...s, firstRunNoticeSeen: true });
  }
  const linkBtn: CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "var(--accent)",
    cursor: "pointer",
    textDecoration: "underline",
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        justifyContent: "space-between",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 20,
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>👋 Welcome to WDIW</div>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
          WDIW measures your YouTube watching <strong>locally</strong> — per-channel time, engagement,
          and Shorts / doom-scroll. Nothing leaves your browser. It tracks from now on; to load your
          past history, import a Google Takeout export from{" "}
          <button style={linkBtn} onClick={onOpenSettings}>Settings → Import</button>.
        </p>
      </div>
      <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => void dismiss()}>
        Got it
      </button>
    </div>
  );
}

type NavItem = "stats" | "channels" | "history" | "settings";

const NAV: { id: NavItem; label: string; icon: string }[] = [
  { id: "stats",    label: "Stats",    icon: "✦" },
  { id: "channels", label: "Channels", icon: "▦" },
  { id: "history",  label: "History",  icon: "◷" },
  { id: "settings", label: "Settings", icon: "◧" },
];

const ICON_URL = chrome.runtime.getURL("icons/wdiw-48.png");
const VERSION = chrome.runtime.getManifest().version;

const NAV_IDS = NAV.map((n) => n.id);
function hashToNav(): NavItem | null {
  const id = window.location.hash.replace(/^#/, "") as NavItem;
  return NAV_IDS.includes(id) ? id : null;
}

export function OptionsApp() {
  // Mirror the active section in the URL hash (e.g. #channels) so it's
  // deep-linkable and reflected in the address bar.
  const [active, setActive] = useState<NavItem>(() => hashToNav() ?? "stats");

  useEffect(() => {
    const onHashChange = () => {
      const next = hashToNav();
      if (next) setActive(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(id: NavItem) {
    setActive(id);
    if (window.location.hash !== `#${id}`) window.location.hash = id;
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-icon" src={ICON_URL} alt="" />
          <div>
            <span className="logo-text">
              WDIW
              <span
                title="Extension version"
                style={{
                  marginLeft: 8,
                  verticalAlign: "middle",
                  display: "inline-block",
                  background: "rgba(124,58,237,0.18)",
                  border: "1px solid rgba(167,139,250,0.25)",
                  borderRadius: 20,
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--accent)",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                v{VERSION}
              </span>
            </span>
            <span className="logo-sub">What Did I Watch?</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <FirstRunNotice onOpenSettings={() => navigate("settings")} />
        {active === "stats"    && <StatsSection />}
        {active === "channels" && <ChannelsSection />}
        {active === "history"  && <HistorySection />}
        {active === "settings" && <SettingsSection />}
      </main>
    </div>
  );
}
