# Watchprint — build plan

Incremental extraction of the analytics layer from TL;DW into this standalone
extension. Each step builds + tests green before the next. TL;DW is **untouched**.

## ✅ Step 1 — Foundation (done)
Project + build infra cloned; analytics **data layer copied whole + tests passing**;
minimal popup/options reading lifetime stats; MV3 manifest (storage + youtube host,
no content scripts yet). Faithful copy on purpose — *make it work, then make it clean.*

## Step 2 — Trim the data layer (make it clean)
The copy dragged in summarizer-only code to stay green. Now remove it:
- `storage.ts`: drop profiles / Gemini / pending-prompts / open-searches /
  delivery-status / summary-cache / tags functions. Keep: `withWriteLock`,
  history RMW (`mutateHistory`/`getHistory`/`setHistory`), `getSettings`/`setSettings`,
  lifetime + per-channel stats (`recordWatchProgress`, `bumpLifetimeStats`,
  `bumpChannelStat`, `verdictCounterDelta`, `trimActivity`, `watchedSecondsFromHistory`),
  startup sweep.
- `constants.ts` / `types/index.ts`: trim to the analytics subset (`Settings` →
  engagement fields only; drop destinations/profiles/Gemini types). Delete the
  copied `watchprint/src/lib/profiles.ts` — it's dead weight here (Watchprint
  doesn't summarize, so it has no prompt profiles). **TL;DW keeps its own
  profiles.ts untouched — this only removes Watchprint's copy.**
- Decide storage-key naming: keep `tldwStats`/`history` (isolated per-extension, so
  no collision) or rename to `watchprint*` (cleaner, but then the migration importer
  must map old → new).

## Step 3 — Content scripts (capture)
Port from TL;DW: `watchtime.ts` (watch-time observer + auto engagement verdict) and a
**minimal** `youtube.ts` that does only channel-info + video-meta scraping (NOT the
summary panel). Background records `WATCH_PROGRESS` via `recordWatchProgress`. This is
the live data loop.

## Step 4 — Dashboards (display)
Port + adapt `StatsSection`, `ChannelsSection`, `HistorySection` + the options shell,
`VirtualList`, `Icons`, `ConfirmDialog`, and `options.css`. Add the Watchprint angle:
per-channel **engagement** (finish vs. abandon), **Shorts-vs-long-form** split,
time-of-day heatmap.

## Step 5 — Migration + history
- One-time **export-from-TL;DW → import** bridge (chrome.storage is per-extension, so
  Watchprint starts empty; existing TL;DW users' `tldwStats` would otherwise be stranded).
- Optional **Google Takeout** `watch-history.json` importer to seed years of past
  history (the only ToS-clean path to historical data; no watch durations in it).

## Step 6 — Positioning
Lead on the competitive white space (see ANALYTICS_SPLIT.md): per-channel,
engagement-aware, **live + local**, **desktop**, with a Shorts quantifier — optionally
paired with a limit/nudge (demand skews "help me stop"). Avoid "yet another yearly
wrapped" (YouTube shipped native Recap, Dec 2025).

## Shared-code note
Copied from TL;DW, not shared via a package (deliberate — two independent repos). The
only file with a real fix-it-twice cost is the **YouTube DOM scraper** (`getChannelInfo`
/ `getVideoMeta`); if it stings later, factor *just that* into a tiny shared package.
