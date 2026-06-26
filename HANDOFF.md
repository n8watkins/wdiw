# Handoff — WDIW (What Did I Watch?)

Zero-context handoff. Read this + [`PLAN.md`](PLAN.md) + [`IDEAS.md`](IDEAS.md) +
[`NAMES.md`](NAMES.md) first; they answer most questions — don't re-ask the user
what these already decide. _Last updated: 2026-06-25._

> **TL;DR:** WDIW is **feature-complete and review-hardened**. The whole build plan
> (steps 1–7) + migration + shipping polish are done; the codebase passed two
> multi-agent review rounds. The remaining work is **validation** (it has never been
> run live in a real browser) and the **product roadmap** — not core build.

## Project summary

**WDIW** ("What Did I Watch?") is a **local-only Manifest V3 Chrome extension** that
analyzes **your own YouTube usage** — per-channel **watch time** and **engagement**
(which channels you finish vs. abandon), a **Shorts-vs-long-form split + doom-scroll
quantifier**, and **activity / peak-hours heatmaps**. It's the **post-watch** companion
to **TL;DW** (a YouTube summarizer at `../tldw`): TL;DW answers *"should I watch this?"*,
WDIW answers *"what/how much have I been watching?"*. They were one extension and were
**split** (rationale + competitive research + data-access feasibility in
[`../tldw/docs/ANALYTICS_SPLIT.md`](../tldw/docs/ANALYTICS_SPLIT.md)).

- **Stack:** TypeScript + Vite + `@crxjs/vite-plugin`; React for popup/options;
  vanilla TS content script; Vitest. Deps: only `react`, `react-dom`, `@tanstack/react-virtual`.
- **Repo:** `github.com/n8watkins/wdiw` (**private**), branch `master`. The GitHub repo
  and the local working dir are both `wdiw` (only the internal `tldw*` storage keys keep
  the old name — they need a data migration to rename).
- **Separate repo — NO monorepo.** Shared code is **copied** from `../tldw` by design
  (the user chose two independent extensions over DRY). Copy + adapt, don't import across.
- **Local-only:** observes the videos you watch (SponsorBlock pattern), stores in
  `chrome.storage.local`. No account, no servers, no analytics. Live capture only sees
  videos watched *while installed*; **Google Takeout import** (Settings → Import) is the
  historical backfill.
- **Run / gate:** `npm run build` → `dist/` (load unpacked at `chrome://extensions`).
  `build` is plain `vite build` — NO version bump. **Gate before every commit:**
  `npm run typecheck` && `npm test` (**145 tests**, pure-logic) — CI also runs these on push.

## State — feature-complete + hardened (all committed + pushed)

| Commit | What |
|---|---|
| `753be9c`…`8110e55` | **Steps 1–3**: foundation; trim data layer to analytics-only; live capture loop (`watchtime.ts` → `WATCH_PROGRESS` → `recordWatchProgress`). |
| `c06bc99` | **Step 4 — dashboards UI**: watch-centric Stats / Channels / History / Settings + popup "today" card; options shell + components + `options.css` ported from TL;DW pre-`dd34755`. |
| `fa5610f` `8f866c5` | **Step 7 — Shorts**: capture fix (`/shorts/<id>`), `lib/shorts.ts` (doom-scroll sessions, algorithm-feed), Stats split card, per-day attribution (`dailySeconds`), time-of-day heatmap, Shorts/Long/All kind filter. |
| `b10428c` `4d1c325` | **Step 7-E — doom-scroll nudge**: daily Shorts limit → toolbar badge + popup banner (`shortsLimitStatus`). |
| `0a6730c` | **Rename → WDIW**; GitHub repo → `n8watkins/wdiw`. |
| `54bf935` `4214df8` | **Step 5 — migration**: `lib/migrate.ts` + `storage.importHistoryEntries` (TL;DW/WDIW export) + `importTakeoutEvents` (Google Takeout, watermarked). Settings → Import auto-detects the file. |
| `a51827b` | **Shipping polish**: real WDIW icons (`scripts/gen-icons.mjs`), first-run onboarding, README/PRIVACY/LICENSE/STORE. |
| `2be979c` | **Accuracy hardening** (IDEAS §1.3): pure `lib/watchgate.ts` `countableSeconds` — ignore hidden/background tabs (PiP counts), paused/ended, ads; seek-reject + clamp. |
| `f09e599` `7d925a6` | **Quick wins**: CI + `minimum_chrome_version`; popup capture-health (`lastRecordedAt`) + pause toggle; **dead summarizer code trimmed** (types/Settings/LifetimeStats). |
| `72e5d92` | **Correctness-review fixes** (5-agent): unified video-id extraction, atomic `recordWatchProgress`, `WATCH_PROGRESS` clamp, import busy-guard, windowed-stats consistency, ConfirmDialog a11y, dead `watchedSecondsFromHistory` removed. |
| `edc3765` `33c90c5` | **Perf/polish-review fixes**: `HISTORY_HARD_CAP` (quota safety under "unlimited"), global `:focus-visible`, aria-labels, shared `lib/format.ts`, ~46% dead `options.css` trim (26.5→14.3 kB). |

**Verified:** `npm run typecheck` clean, **145/145 tests**, `npm run build` OK. The
extension loads, accrues data (incl. Shorts), renders all dashboards, shows the doom-scroll
nudge, and imports TL;DW/Takeout files. `npm run build` (TL;DW-style `build-release.mjs`)
bumps the patch version, runs `vite build`, and **auto-copies `dist/` to
`C:\Users\natha\Projects\Tools\wdiw`** — the folder Chrome loads from. (CI uses
`build:ci` = plain `vite build`, no bump/copy.)

**Two reviews stand behind the current state** — a 5-agent correctness pass (capture,
storage, migration, helpers, UI) and a 2-agent perf/memory + polish pass. Verdict: core
sound and well-bounded; the real findings were fixed in the commits above. Items
deliberately **left as-is** (don't "fix" without reason): StatsSection render recompute
(bounded inputs + 300ms debounce — memoizing is net-negative), the toolbar-badge midnight
lag (popup is always live-correct; a clean fix needs the `alarms` permission, which the
user **declined** to keep the permission surface minimal), and a few harmless
descendant-of-dead CSS rules.

## How capture works (data flow)

```
content/watchtime.ts ──WATCH_PROGRESS──▶ background/index.ts ──▶ recordWatchProgress (storage.ts)
  observe <video>, accumulate seconds        clamp delta/duration     ATOMIC (one write-lock):
  via countableSeconds (lib/watchgate.ts:     gate on trackEngagement  · history stub (per-video)
   skip hidden/paused/ad, reject seeks)                                · tldwStats: lifetime + per-day
  tag isShort, scrape channel/duration                                   maps + per-channel `channels`
  send every ~10s / visibility / nav
```
- **Engagement verdict** (Engaged/Skimmed/Skipped) from watch-% in `lib/engagement.ts`.
  Shorts get a **simplified model** (no verdict — they loop). Shorts seconds still count.
- **Storage keys** (`chrome.storage.local`): **`tldwStats`** (never-pruned lifetime +
  per-channel + per-day maps; key name is historical, harmless), **`history`** (the
  pruned watch log), **`settings`**. All maps are bounded: channels 500, activity/daily
  366 days, history by `historyLimit` (capped at `HISTORY_HARD_CAP`=5000 even under "unlimited").
- **Stats page reads the never-pruned `tldwStats`** (lifetime-accurate); **Channels/History
  pages read `computeChannelStats(history)`** (recent window). They can legitimately differ
  after pruning — surfaced honestly in the UI, don't "reconcile" blindly.

## Next steps (ordered)

### 1. ★ Verify it live in a real browser (the one unvalidated assumption)
Everything is verified by unit tests + static review, but **capture has never been run
against real YouTube** — and it leans on YouTube's DOM (`watchtime.ts` selectors) and now
gates on hidden/ad state. **This should gate any store submission.** Load `dist` (or
`C:\Users\natha\Projects\Tools\wdiw`), watch a few long videos **and Shorts**, set a
Shorts limit, and confirm: per-channel time/engagement accrue, the Shorts split + heatmaps
populate, the badge/banner behave, the popup "last tracked" updates. The fragile bit is the
DOM scraping in `getChannelInfo`/`getVideoMeta`/`isAdShowing` — fix selectors if YouTube changed.

### 2. ★ Run the user's real Google Takeout export through the importer
The user requested their Takeout (`watch-history.json`) and it's on the way. When it lands,
import it (Settings → Import) and validate `parseTakeoutHistory` / `importTakeoutEvents`
against real data (cleaning, channel attribution, the activity/peak-hours heatmaps, the
"Most-watched channels" by-count card). Caveat (by design): Takeout has **no durations**,
so it backfills counts/channels/activity, not watch-time.

### 3. Chrome Web Store submission (human steps)
Take the `STORE.md` screenshot set (Stats / Channels / Shorts split / popup / import),
register a CWS developer account ($5), zip `dist`, paste `STORE.md` copy + the `PRIVACY.md`
URL, complete the data-practices form, submit. Decide repo visibility (currently private;
`README`/`STORE` reference it).

### 4. Product roadmap → [`IDEAS.md`](IDEAS.md)
Remaining wedge/moat features: **trends over time** (rising/fading channels — the windowed
view is a basic version), **source attribution** ("where I found this" — high-effort/niche),
category/topic breakdown, broader goals/recap. Honest take recorded in IDEAS: trends is
mostly there, source-attribution is niche — confirm interest before building.

### 5. Low-priority cleanup (optional)
Rename the internal `tldw*` storage keys → `wdiw*` (needs a one-time migration of stored
data); a never-pruned per-hour store so the time-of-day heatmap isn't limited to retained
history. Neither is blocking.

## Conventions & gotchas
- **Copy not import** from `../tldw` (two independent repos).
- **`npm run build` = plain `vite build`** — no version bump, no Windows copy. Gate every
  commit with `npm run typecheck` && `npm test` (145 tests); commit with the trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; push to `origin`.
- **The data layer here is ACTIVE and wired** (engagement engine, `recordWatchProgress`,
  per-channel helpers) — the live core, not dead code.
- **Video-id is one source of truth:** `extractVideoId` in `lib/constants.ts`; the content
  script and the storage history-matching both use it. Don't reintroduce a second regex.
- **`recordWatchProgress` is atomic** (single `withWriteLock("watchRecord")`); keep it so.
- **DOM fragility is the #1 ongoing risk** — `watchtime.ts` selectors break silently if
  YouTube changes its DOM (no telemetry, by design). The popup "last tracked" line is the
  user-visible canary.
- **No historical backfill from live capture** is inherent — keep honest empty states; the
  Takeout import is the backfill.
- **Name: WDIW**; GitHub repo `n8watkins/wdiw`; internal `tldw*` keys + working dir unchanged.

## File map (current)
- `src/content/watchtime.ts` — live capture: observe `<video>`, accumulate via `countableSeconds`, scrape channel/meta, broadcast `WATCH_PROGRESS`. **The fragile DOM bit.**
- `src/lib/watchgate.ts` — pure `countableSeconds` accuracy gate (hidden/ad/seek-aware) + tests.
- `src/background/index.ts` — `WATCH_PROGRESS` → `recordWatchProgress` (clamped); Shorts toolbar-badge updater; startup sweep.
- `src/lib/storage.ts` — `recordWatchProgress` (atomic), bumps, write-lock, history RMW, `importHistoryEntries`, `importTakeoutEvents`, settings.
- `src/lib/migrate.ts` — import parsers: `parseHistoryExport` (TL;DW/WDIW), `parseTakeoutHistory` (Takeout), `collapseByVideo`, `foldImportedEntries`.
- `src/lib/engagement.ts` — `computeEngagementVerdict`. `src/lib/shorts.ts` — doom-scroll sessions, algorithm-feed, `shortsLimitStatus`.
- `src/lib/stats.ts` / `dashboards.ts` / `history.ts` — pure ranking / windowing / per-channel helpers (wired into the UI). `src/lib/format.ts` — shared duration formatters.
- `src/lib/constants.ts` / `src/types/index.ts` — trimmed to live fields; caps (`CHANNEL_STATS_CAP`, `HISTORY_HARD_CAP`).
- `src/options/sections/*` — Stats / Channels / History / Settings. `src/options/components/*` — VirtualList / Icons / ConfirmDialog. `src/popup/App.tsx` — today card + nudge banner + capture-health + pause.
- `src/manifest.config.ts` — MV3 manifest (storage perm, youtube host, `minimum_chrome_version`).
- `scripts/gen-icons.mjs` — dependency-free WDIW icon generator. `.github/workflows/ci.yml` — typecheck+test+build on push.
- `PLAN.md` (build plan, all done) · `IDEAS.md` (roadmap + status) · `NAMES.md` (naming decision) · `README.md` / `PRIVACY.md` / `LICENSE` / `STORE.md` (launch docs) · `../tldw/docs/ANALYTICS_SPLIT.md` (split rationale + data-access).
