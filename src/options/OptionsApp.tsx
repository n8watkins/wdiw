import { useEffect, useState } from "react";
import { StatsSection } from "./sections/StatsSection";
import { ChannelsSection } from "./sections/ChannelsSection";
import { HistorySection } from "./sections/HistorySection";
import { SettingsSection } from "./sections/SettingsSection";

type NavItem = "stats" | "channels" | "history" | "settings";

const NAV: { id: NavItem; label: string; icon: string }[] = [
  { id: "stats",    label: "Stats",    icon: "✦" },
  { id: "channels", label: "Channels", icon: "▦" },
  { id: "history",  label: "History",  icon: "◷" },
  { id: "settings", label: "Settings", icon: "◧" },
];

const ICON_URL = chrome.runtime.getURL("icons/tl-dw-48.png");
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
        {active === "stats"    && <StatsSection />}
        {active === "channels" && <ChannelsSection />}
        {active === "history"  && <HistorySection />}
        {active === "settings" && <SettingsSection />}
      </main>
    </div>
  );
}
