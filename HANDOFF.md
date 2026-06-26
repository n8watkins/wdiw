# Handoff — Watchprint

Zero-context handoff. Read this + [`PLAN.md`](PLAN.md) + [`IDEAS.md`](IDEAS.md) +
[`NAMES.md`](NAMES.md) first; they answer most questions — don't re-ask the user
what these already decide. _Last updated: 2026-06-25._

## Project summary

**WDIW** ("What Did I Watch?") is a **local-only Manifest V3 Chrome extension** that
analyzes **your own YouTube usage** — per-channel **watch time** and **engagement**
(which channels you finish vs. abandon). It's the **post-watch** companion to
**TL;DW** (a YouTube summarizer at `../tldw`): TL;DW answers *"should I watch /
summarize this?"*, Watchprint answers *"what/how much have I been watching?"*. They
were one extension and were **split** (rationale + competitive research + data-access
feasibility in [`../tldw/docs/ANALYTICS_SPLIT.md`](../tldw/docs/ANALYTICS_SPLIT.md)).

- **Stack:** TypeScript + Vite + `@crxjs/vite-plugin`; React for popup/options;
  vanilla TS content script; Vitest.
- **Repo:** `github.com/n8watkins/watchprint` (**private**), branch `master`.
- **Separate repo — NO monorepo.** Shared code is **copied** from `../tldw` by
  design (the user chose two independent extensions over DRY; duplication accepted).
  When you need a helper/component from TL;DW, **copy + adapt it**, don't import across.
- **Local-only:** observes the videos you watch (the SponsorBlock pattern), stores in
  `chrome.storage.local`. No account, no servers. **No historical backfill** — it only
  sees videos watched *while installed* (Takeout import is planned, step 5).
- **Run:** `npm run dev` (live). `npm run build` → `dist/` (load unpacked at
  `chrome://extensions`). **`build` is plain `vite build` — it does NOT auto-bump the
  version** (unlike TL;DW). **Gate before commit:** `npm run typecheck` && `npm test`
  (**78 tests**, all pure-logic).

## State (done this session — all committed + pushed)

| Commit | What |
|---|---|
| `753be9c` | **Step 1 — foundation**: build infra cloned from TL;DW; analytics data layer copied + tested; minimal popup/options. |
| `caa547f` | **Step 2 — trim**: data layer cut to analytics-only (deleted `profiles.ts`; dropped Gemini/cache/tags/pending from storage/constants/types). |
| `e0d5fd5` | **Step 3 — capture**: the live loop. `content/watchtime.ts` observes playback + scrapes channel/meta + broadcasts `WATCH_PROGRESS`; `background/index.ts` records it via `recordWatchProgress`. |
| `8110e55` | Docs: `NAMES.md`, `IDEAS.md`. |
| `c06bc99` | **Step 4 — dashboards UI**: watch-centric Stats / Channels / History / Settings + popup "today" card; options shell + `VirtualList`/`Icons`/`ConfirmDialog`/`options.css` ported; data-layer `watchedSeconds` + `activity` heatmap additions. |
| `fa5610f` | **Step 7 (A–D)**: Shorts capture fix + data model + `lib/shorts.ts` helpers (doom-scroll sessions, algorithm-feed) + Stats Shorts split card. Plus deep-review fixes: per-day watch-time attribution (`dailySeconds`), lifted Channels expand state, windowed empty-state guard. |
| `0a6730c` | **Rename → WDIW** ("What Did I Watch?"). GitHub repo also renamed to `n8watkins/wdiw`. Internal `tldw*` keys + working dir unchanged. |
| `b10428c` `4d1c325` | **Step 7-E**: doom-scroll nudge — daily Shorts limit (Settings) → toolbar badge + popup banner (`shortsLimitStatus`). `4d1c325` = a second deep review's fixes (global `videosWatched` counter for a consistent Shorts/long split; badge listener short-circuit; nudge-number reconciliation). |
| `8f866c5` | **Step 7-D polish (completes Step 7)**: "When you watch" time-of-day heatmap (`dashboards.hourlyHeatmap`) + Shorts/Long/All kind filter on Channels + History. |
| `54bf935` | **Step 5a — TL;DW import bridge**: `lib/migrate.ts` (parse/collapse/fold) + `storage.importHistoryEntries` + Settings → Import card. Imports a TL;DW history export (or WDIW backup) and rebuilds the stats. |
| `4214df8` | **Step 5b — Google Takeout importer (completes Step 5)**: `parseTakeoutHistory` (cleans the Takeout array) + `importTakeoutEvents` (watermarked, idempotent) + auto-detect in Settings → Import + "Most-watched channels" by-count card. Takeout = counts/activity only (no durations/engagement; Shorts indistinguishable). |

**Verified:** `npm run typecheck` clean, **137/137** tests, `npm run build` OK. **Steps 7
and 5 are complete** (live capture + dashboards + nudge + TL;DW import + Google Takeout
import). The extension loads, accrues data (incl. Shorts), renders the dashboards
(per-channel time/engagement, Shorts split, peak-hours heatmap, kind filters), and shows
the doom-scroll nudge. A loadable build is copied to `C:\Users\natha\Downloads\watchprint-dist`
for unpacked install (`build` is plain `vite build` — no auto Windows copy; re-copy
`dist/` after rebuilds).

**NOT done yet:** the build-plan steps are **done** (1–7 + migration). Remaining work is
polish/roadmap: the step 2.5 type-trim cleanup (dead summarizer types/CSS), per-hour
never-pruned data so the time-of-day heatmap survives history pruning, accuracy hardening,
and the `IDEAS.md` roadmap. (Name: **WDIW**; repo `n8watkins/wdiw`.)

## How the capture works (the data flow)

```
content/watchtime.ts  ──WATCH_PROGRESS──▶  background/index.ts  ──▶  recordWatchProgress (storage.ts)
  observe video element                       getSettings()              writes history (per-video)
  accumulate content-seconds                  gated on trackEngagement   bumps tldwStats:
  (seek-reject, double-count-safe)                                         · lifetime (secondsWatched…)
  scrape channel/duration (inlined)                                        · per-channel `channels` map
  send every ~10s / visibility / nav                                         (secondsWatched, videosWatched,
                                                                              engaged/skimmed/skipped, lastWatched)
```
- **Engagement** verdict (Engaged/Skimmed/Skipped) is computed from watch-% by
  `lib/engagement.ts` (`computeEngagementVerdict`).
- **Storage keys** (`chrome.storage.local`): **`tldwStats`** (lifetime + per-channel
  `channels` map), **`history`** (the watch log), **`settings`**. ⚠️ Keys are still
  named `tldw*` — harmless (storage is per-extension, no collision with TL;DW), rename
  is **optional** and would need a migration.
- **Ready-to-use analytics helpers** (already present + tested, just not wired to UI):
  `lib/stats.ts` (`topChannelsByTime`, `mostEngagedChannels`, `engagedRatio`,
  `trimChannelStats`), `lib/dashboards.ts` (week/month/year window aggregation),
  `lib/history.ts` (`computeChannelStats`).

## Next steps (ordered)

### 1. ✅ Step 4 — Dashboards UI (done — commit `c06bc99`)
Watch-centric Stats / Channels / History / Settings + a popup "today" card; the options
shell + `VirtualList`/`Icons`/`ConfirmDialog`/`options.css` ported from TL;DW
(pre-`dd34755`). Full breakdown in `PLAN.md` Step 4. Verified typecheck / 79 tests /
build. Loadable build copied to `C:\Users\natha\Downloads\watchprint-dist`.

### 2. ✅ Step 7 — Shorts split + doom-scroll quantifier (complete)
Shorts track (capture fixed); Stats shows the Shorts-vs-long split, longest doom-scroll,
"channels the algorithm feeds you", and the peak-hours heatmap; Channels + History have a
kind filter; and the **nudge** ships (daily Shorts limit → toolbar badge + popup banner).

### 3. ✅ Step 5 — Migration from TL;DW + Takeout backfill (complete)
Settings → Import loads, auto-detecting the file: a **TL;DW history export / WDIW backup**
(`importHistoryEntries`, rebuilds time + engagement) or a **Google Takeout
`watch-history.json`** (`parseTakeoutHistory` + `importTakeoutEvents`, watermarked;
counts/activity only — no durations/engagement, Shorts indistinguishable). **Data-access
verified:** no API returns watch history with or without Google auth (removed 2016);
Takeout (manual self-export) is the only ToS-clean backfill.

### ★ Next — polish & roadmap
Build plan (steps 1–7 + migration) is done. Candidates: step 2.5 type-trim; never-pruned
per-hour data (so the time-of-day heatmap isn't limited to retained history); accuracy
hardening + the `IDEAS.md` roadmap.

### 4. Step 2.5 — finish the trim (cleanup, low priority)
`types/index.ts` still carries a dead summarizer/message/sponsor type block (left
intentionally to avoid a cascade during step 2). Remove what's now truly unused.
Optionally rename the `tldw*` storage keys (then add a migration in step 5).

### 5. Then the product roadmap → [`IDEAS.md`](IDEAS.md)
Shorts-vs-long split + a **Shorts quantifier**, **accuracy hardening** (the #1
incumbent complaint), source attribution, trends, optional goals/nudges.

## Conventions & gotchas

- **Two independent repos, copy not import.** Adapt TL;DW code into Watchprint files.
- **`npm run build` = plain `vite build`** — no version bump, no Windows copy (those
  were TL;DW-isms). Output is `dist/`.
- **Commit** after each logical change with the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; push to
  `origin` (private repo). Gate: typecheck + test.
- **The data layer here is ACTIVE and wired** (engagement engine, `recordWatchProgress`,
  per-channel helpers) — the opposite of TL;DW, where those same modules are now dead
  code post-decoupling.
- **No historical backfill** is inherent — surface honest empty states ("tracks from
  install forward") and lean on the planned Takeout import.
- **Name: WDIW** ("What Did I Watch?") — chosen 2026-06-25 (see `NAMES.md`); set in
  `package.json`, `manifest.config.ts`, and popup/options copy. NOT renamed: the internal
  `tldw*` storage keys (a rename needs a data migration — step 5) and the GitHub
  repo/dir, both still `watchprint`.

## File map

- `src/content/watchtime.ts` — the watch-time observer + inlined channel/meta scraper
  (the live capture). The one fragile bit (YouTube DOM selectors) — keep in sync with
  reality if YouTube changes its watch-page DOM.
- `src/background/index.ts` — `WATCH_PROGRESS` → `recordWatchProgress`; startup sweep.
- `src/lib/storage.ts` — `recordWatchProgress`, `bumpChannelStat`, `verdictCounterDelta`,
  lifetime + per-channel stats, history RMW, `withWriteLock`, settings. (Analytics-only.)
- `src/lib/engagement.ts` — `computeEngagementVerdict` (Engaged/Skimmed/Skipped).
- `src/lib/stats.ts` / `dashboards.ts` / `history.ts` — the ranking + window + per-channel
  helpers that **step 4 wires into the UI**.
- `src/lib/constants.ts` / `src/types/index.ts` — trimmed; types still carry a dead
  block (step 2.5).
- `src/popup/` + `src/options/` — **placeholder UI** (step 4 replaces with dashboards).
- `src/manifest.config.ts` — MV3 manifest (storage perm, youtube host, the watchtime
  content script).
- `PLAN.md` — the step-by-step build plan. `IDEAS.md` — product roadmap. `NAMES.md` —
  naming. `../tldw/docs/ANALYTICS_SPLIT.md` — the split rationale + research + data-access.
