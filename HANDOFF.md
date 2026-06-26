# Handoff — Watchprint

Zero-context handoff. Read this + [`PLAN.md`](PLAN.md) + [`IDEAS.md`](IDEAS.md) +
[`NAMES.md`](NAMES.md) first; they answer most questions — don't re-ask the user
what these already decide. _Last updated: 2026-06-25._

## Project summary

**Watchprint** (working name) is a **local-only Manifest V3 Chrome extension** that
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

**Verified:** `npm run typecheck` clean, **78/78** tests, `npm run build` OK
(`watchtime.ts` content chunk bundles). The extension **loads and accrues data**.

**NOT done yet:** the **dashboards UI** — `popup/App.tsx` and `options/OptionsApp.tsx`
are placeholders that only print a lifetime-stats line. The captured data has no real
UI yet. The **name** is provisional.

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

### 1. ★ Step 4 — Dashboards UI (the main task)
Make the captured data visible. Port + adapt from TL;DW's options sections:
- **⚠️ Critical source gotcha:** TL;DW's *current* `StatsSection`/`ChannelsSection`
  are **summary-centric** (wrong for Watchprint). The **watch-centric** versions you
  want are in TL;DW's history **before commit `dd34755`**. Recover them with e.g.
  `git -C ../tldw show dd34755^:src/options/sections/StatsSection.tsx` (and
  `ChannelsSection.tsx`, `HistorySection.tsx`) — those have the time-watched +
  engagement (Engaged/Skimmed/Skipped) + per-channel-by-time dashboards, the donut,
  the heatmap, the week/month/year windowed view. Copy + adapt those.
- Also copy the **options shell** (`../tldw/src/options/OptionsApp.tsx` + sidebar nav),
  **components** (`VirtualList.tsx`, `Icons.tsx`, `ConfirmDialog.tsx`), and
  **`options.css`** for theming.
- Wire to the existing helpers above. Scope the nav to Watchprint's surfaces (Stats,
  Channels, History, Settings) — drop TL;DW-only sections (DirectApi, Profiles, Tags,
  Setup, Support/About can be minimal).
- **Popup**: a mini "today" card (time watched today, top channel).
- **Acceptance:** load `dist`, watch a few YouTube videos, then open Options and see
  per-channel **time + engagement** accrue, plus a usage overview.

### 2. Step 2.5 — finish the trim (cleanup, low priority)
`types/index.ts` still carries a dead summarizer/message/sponsor type block (left
intentionally to avoid a cascade during step 2). Remove what's now truly unused.
Optionally rename the `tldw*` storage keys (then add a migration in step 5).

### 3. Step 5 — Migration + history
chrome.storage is per-extension, so Watchprint starts **empty** and can't read TL;DW's
`tldwStats`. Build a one-time **export-from-TL;DW → import** bridge (JSON), and an
optional **Google Takeout** `watch-history.json` importer for backfill (the only
ToS-clean path to past data; note: Takeout has **no watch durations**).

### 4. Then the product roadmap → [`IDEAS.md`](IDEAS.md)
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
- **Name is provisional** ("Watchprint") — it's in `package.json`, `manifest.config.ts`
  name, and popup/options copy. User is leaning **Attune** or **Tally** (see
  `NAMES.md`). Don't bake a name deep until they pick.

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
