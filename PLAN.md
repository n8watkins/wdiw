# Watchprint — build plan

Incremental extraction of the analytics layer from TL;DW into this standalone
extension. Each step builds + tests green before the next. TL;DW is **untouched**.

## ✅ Step 1 — Foundation (done)
Project + build infra cloned; analytics **data layer copied whole + tests passing**;
minimal popup/options reading lifetime stats; MV3 manifest (storage + youtube host,
no content scripts yet). Faithful copy on purpose — *make it work, then make it clean.*

## ✅ Step 2 — Trim the data layer (done — commit caa547f)
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

## ✅ Step 3 — Content scripts (capture) (done — commit e0d5fd5)
Port from TL;DW: `watchtime.ts` (watch-time observer + auto engagement verdict) and a
**minimal** `youtube.ts` that does only channel-info + video-meta scraping (NOT the
summary panel). Background records `WATCH_PROGRESS` via `recordWatchProgress`. This is
the live data loop.

## ✅ Step 4 — Dashboards (display) (done — commit c06bc99)
Ported + adapted the watch-centric options shell (recovered from TL;DW *before* its
summary-centric rescope at `dd34755`) and wired every surface to the analytics helpers:
- **Stats** — week/month/year/all toggle; all-time time-watched / videos / top channel,
  engagement donut, 12-week activity heatmap + streak, top-by-time + most-engaged
  channel lists, finish-rate tiles; windowed view leads on time watched this period.
- **Channels** — per-channel time + engagement + last-watched, expandable per-video
  list, sort by time/videos/recent.
- **History** — per-video watch log (verdict, watched-of-duration, date) + limit/expiry
  controls + export/clear.
- **Settings** — engagement thresholds, history limit/expiry, clear-data + reset.
- **Popup** — mini "today" card (time + top channel today).

Copied `VirtualList`, `Icons` (trimmed), `ConfirmDialog`, `options.css`. Data-layer
additions (tests stay green, 79 total): `ChannelStats.watchedSeconds`,
`WindowStats.watchedSeconds`, an `activity[today]` bump on first sight of a video (the
never-pruned heatmap / active-days signal), `HISTORY_EXPIRY_OPTIONS`. Deferred from the
original Watchprint angle: the **Shorts-vs-long-form split** + **time-of-day heatmap** →
now Step 7.

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

## Step 7 — Shorts split + doom-scroll quantifier (A–D done — commit fa5610f; E next)
The competitive white space (ANALYTICS_SPLIT.md §3) and the strongest expressed demand
("help me **stop**"). Prioritized **ahead of Step 5**.

**⚠️ Shorts don't track at all today.** `content/watchtime.ts` `currentVideoId()` reads
the id only from `?v=`; Shorts are `/shorts/<id>` (no `?v=`), so they report an empty id
and never accrue. Step A fixes this — the wedge feature and a real bug fix are the same
work.

Decisions (locked with the user 2026-06-25):
- **Loops count toward duration, not count.** A loop is just more time on the *same*
  Short. Two stats: `shortsCount` (1 per distinct Short) and `shortsSeconds` (sums
  across loops — a 20s Short looped 3× = 60s). Cap each *single* play at the Short's
  duration, then sum plays.
- **Simplified Shorts engagement** — no Engaged/Skimmed/Skipped donut for Shorts; use a
  loops-per-Short / avg-time-on-Short proxy. Keeps the long-form taste metric clean.
- **"Channels the algorithm keeps feeding you"** — Shorts ranked by # served + time,
  flagging channels you rack up Shorts on *without subscribing* (pure algorithm push).
  The novel, on-thesis stat.
- **Time-of-day (peak-hours) heatmap** — "when do you doom-scroll"; the existing heatmap
  is GitHub-style by day.
- **Doom-scroll sessions + nudge are in scope** (not someday) — it's a desktop tool, so
  catching a doom-scroll run is the point. Default session boundary: a new session after
  a **>3 min gap**.

Sub-steps (each independently shippable):
- ✅ **A. Shorts capture** (`content/watchtime.ts`): `currentVideoId()` reads
  `/shorts/<id>` (was `?v=`-only → Shorts never tracked at all); reports tagged
  `isShort`. Loops accrue for free via the existing forward-motion accumulator.
- ✅ **B. Data model** (`types` + `lib/storage`): `isShort` on the message + entry;
  `shortsSeconds`/`shortsCount` (global + per-channel), migration-safe. Shorts get a
  simplified model — no Engaged/Skimmed/Skipped verdict (they loop).
- ✅ **C. Helpers** (`lib/shorts.ts`, +25 tests): `doomScrollSessions` (>3-min gap
  split), `longestDoomScroll`, `algorithmFeedChannels`, `shortsVsLong`.
- ◐ **D. Dashboards** — Stats now shows the Shorts-vs-long split card + longest
  doom-scroll + "channels the algorithm feeds you". **Remaining:** the time-of-day
  heatmap, and a Shorts/long **kind filter** on Channels / History.
- ☐ **E. Nudge / limit** — optional soft daily Shorts limit + toolbar badge / popup
  banner (the "help me stop" payoff). **Not started — the recommended next step.**

Also landed (from the Step-4 deep review): **per-day watch-time attribution** —
`LifetimeStats.dailySeconds`/`dailyShortsSeconds` bump on each delta (keyed by the day
time was *actually* watched), fixing wrong "today"/"this week" totals for videos that
span day boundaries and giving the Shorts quantifier an accurate daily number.

**Data-access note (verified):** no API returns watch history, **with or without Google
auth** (removed 2016-09-12). Build auth-free. Backfill = Google Takeout only (Step 5; no
durations). An API key gets *public* metadata only (free within ~10k units/day) —
optional enrichment, off by default, since it leaks the watch list off-device.

## Shared-code note
Copied from TL;DW, not shared via a package (deliberate — two independent repos). The
only file with a real fix-it-twice cost is the **YouTube DOM scraper** (`getChannelInfo`
/ `getVideoMeta`); if it stings later, factor *just that* into a tiny shared package.
