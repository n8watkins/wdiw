import { useEffect, useState } from "react";
import type { HistoryExpiryDays, HistoryLimit, Settings } from "../../types";
import {
  DEFAULT_SETTINGS,
  HISTORY_EXPIRY_OPTIONS,
  STORAGE_KEYS,
  TLDW_STATS_KEY,
} from "../../lib/constants";
import { getSettings, setSettings } from "../../lib/storage";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icons";

export function SettingsSection() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // Transient text for the % fields so clearing them to retype doesn't snap to
  // the clamp minimum mid-edit. null = not editing; show the persisted value.
  const [engagedDraft, setEngagedDraft] = useState<string | null>(null);
  const [skimmedDraft, setSkimmedDraft] = useState<string | null>(null);

  useEffect(() => {
    void getSettings().then(setLocal);

    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      const next = changes[STORAGE_KEYS.settings]?.newValue;
      if (next) setLocal({ ...DEFAULT_SETTINGS, ...(next as Settings) });
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  async function update(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setLocal(next);
    await setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function clearWatchData() {
    await chrome.storage.local.remove([TLDW_STATS_KEY, STORAGE_KEYS.history]);
    setConfirmClear(false);
  }

  async function resetAll() {
    setLocal(DEFAULT_SETTINGS);
    await setSettings(DEFAULT_SETTINGS);
    setConfirmReset(false);
  }

  if (!settings) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">Settings</h1>
        <p className="section-desc">
          {saved ? <span className="text-success">Saved.</span> : "Changes save automatically."}
        </p>
      </div>

      <div className="settings-group">
        <div className="settings-group-title"><Icon name="bar-chart" /> Engagement tracking</div>
        <div className="setting-sub" style={{ marginBottom: 12 }}>
          Automatically rates each video Engaged / Skimmed / Skipped from how much you actually
          watch. Works on every video, fully locally.
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Track engagement</div>
            <div className="setting-sub">Measure watch time and auto-rate each video.</div>
          </div>
          <div className="setting-control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.trackEngagement}
                onChange={(e) => void update({ trackEngagement: e.target.checked })}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        <div className="setting-row" style={{ opacity: settings.trackEngagement ? 1 : 0.5 }}>
          <div className="setting-info">
            <div className="setting-label">Engaged threshold (%)</div>
            <div className="setting-sub">
              Watched ≥ this % (or 20+ min) counts as Engaged. Default 60.
            </div>
          </div>
          <div className="setting-control">
            <input
              type="number"
              min={5}
              max={100}
              disabled={!settings.trackEngagement}
              value={engagedDraft ?? String(settings.engagedPct)}
              onChange={(e) => setEngagedDraft(e.target.value)}
              onBlur={() => {
                if (engagedDraft === null) return;
                const n = Number(engagedDraft);
                const v = engagedDraft.trim() && Number.isFinite(n)
                  ? Math.min(100, Math.max(5, n))
                  : settings.engagedPct;
                void update({ engagedPct: v, skimmedPct: Math.min(settings.skimmedPct, v - 1) });
                setEngagedDraft(null);
              }}
              style={{ width: 70, textAlign: "center" }}
            />
          </div>
        </div>

        <div className="setting-row" style={{ opacity: settings.trackEngagement ? 1 : 0.5 }}>
          <div className="setting-info">
            <div className="setting-label">Skipped threshold (%)</div>
            <div className="setting-sub">
              Below this % counts as Skipped (above is Skimmed). Default 15.
            </div>
          </div>
          <div className="setting-control">
            <input
              type="number"
              min={1}
              max={95}
              disabled={!settings.trackEngagement}
              value={skimmedDraft ?? String(settings.skimmedPct)}
              onChange={(e) => setSkimmedDraft(e.target.value)}
              onBlur={() => {
                if (skimmedDraft === null) return;
                const n = Number(skimmedDraft);
                const v = skimmedDraft.trim() && Number.isFinite(n)
                  ? Math.min(95, Math.max(1, n))
                  : settings.skimmedPct;
                void update({ skimmedPct: v, engagedPct: Math.max(settings.engagedPct, v + 1) });
                setSkimmedDraft(null);
              }}
              style={{ width: 70, textAlign: "center" }}
            />
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title"><Icon name="eye" /> Doom-scroll guard</div>
        <div className="setting-sub" style={{ marginBottom: 12 }}>
          Set a daily Shorts limit and WDIW nudges you: today's Shorts minutes show on the
          toolbar icon (green → amber → red), with a banner in the popup as you approach it.
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Daily Shorts limit</div>
            <div className="setting-sub">How long you want to cap Shorts at each day. Off by default.</div>
          </div>
          <div className="setting-control">
            <select
              className="setting-select"
              value={String(settings.shortsLimitMinutes)}
              onChange={(e) => void update({ shortsLimitMinutes: Number(e.target.value) })}
            >
              <option value="0">Off</option>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title"><Icon name="clock" /> History</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Keep at most</div>
            <div className="setting-sub">How many recent videos to retain in history.</div>
          </div>
          <div className="setting-control">
            <select
              className="setting-select"
              value={String(settings.historyLimit)}
              onChange={(e) =>
                void update({
                  historyLimit: (e.target.value === "unlimited"
                    ? "unlimited"
                    : Number(e.target.value)) as HistoryLimit,
                })
              }
            >
              <option value="50">50 entries</option>
              <option value="100">100 entries</option>
              <option value="250">250 entries</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Auto-delete old</div>
            <div className="setting-sub">Drop history entries older than the chosen age.</div>
          </div>
          <div className="setting-control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoExpireHistory}
                onChange={(e) => void update({ autoExpireHistory: e.target.checked })}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        <div className="setting-row" style={{ opacity: settings.autoExpireHistory ? 1 : 0.5 }}>
          <div className="setting-info">
            <div className="setting-label">After</div>
            <div className="setting-sub">Age past which entries are deleted.</div>
          </div>
          <div className="setting-control">
            <select
              className="setting-select"
              disabled={!settings.autoExpireHistory}
              value={String(settings.historyExpiryDays)}
              onChange={(e) =>
                void update({ historyExpiryDays: Number(e.target.value) as HistoryExpiryDays })
              }
            >
              {HISTORY_EXPIRY_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title"><Icon name="reset" /> Data</div>

        <div className="card">
          <div className="card-title">Clear all watch data</div>
          <div className="card-desc" style={{ marginBottom: 16 }}>
            Permanently delete your watch history and per-channel stats. Settings are kept.
          </div>
          <button className="btn btn-danger btn-icon-text" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" />
            Clear watch data
          </button>
        </div>

        <div className="card">
          <div className="card-title">Reset settings</div>
          <div className="card-desc" style={{ marginBottom: 16 }}>
            Restore default settings. Your watch data is untouched.
          </div>
          <button className="btn btn-danger btn-icon-text" onClick={() => setConfirmReset(true)}>
            <Icon name="reset" />
            Reset to defaults
          </button>
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Clear all watch data?"
          body="This permanently deletes your watch history and per-channel stats. Your settings are kept."
          confirmLabel="Clear watch data"
          tone="danger"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => void clearWatchData()}
        />
      )}
      {confirmReset && (
        <ConfirmDialog
          title="Reset all settings?"
          body="This restores WDIW settings to their defaults. Your watch data is not changed."
          confirmLabel="Reset settings"
          tone="primary"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void resetAll()}
        />
      )}
    </div>
  );
}
