# Step 4 — Dashboards (design spec)

> The design intent for Watchprint's dashboards. The section files
> (`src/options/sections/StatsSection|ChannelsSection|HistorySection|SettingsSection.tsx`)
> already exist as scaffolding — **build or refine them to match this spec.** The
> guiding principle (from [`IDEAS.md`](IDEAS.md)): everyone else shows *"how much time
> on YouTube?"* — **we lead with engagement**: *which channels you finish vs. abandon,
> and where your attention actually goes.*

## What's the opposite of TL;DW

TL;DW's stats are now **summary-centric** (it counts summaries). Watchprint's are
**watch-centric** (time + engagement). So the dashboards to port are TL;DW's
**pre-`dd34755`** watch dashboards, NOT its current ones:

```
git -C ../tldw show dd34755^:src/options/sections/StatsSection.tsx
git -C ../tldw show dd34755^:src/options/sections/ChannelsSection.tsx
git -C ../tldw show dd34755^:src/options/sections/HistorySection.tsx
```
Those have the time-watched headline, the Engaged/Skimmed/Skipped breakdown, the
engagement donut, the week/month/year windowed view with vs-previous deltas, and the
per-channel-by-time table. **Strip the TL;DW-only bits** when adapting: no AI verdict /
rating, no profiles, no destinations, no tags, no auto-summarize, no SponsorBlock, no
summary cache. Keep + emphasize the watch + engagement surfaces.

## Data + helpers you wire to (already present + tested)

| Source | What it gives |
|---|---|
| `getLifetimeStats()` → `LifetimeStats` | lifetime `secondsWatched`, `engaged`/`skimmed`/`skipped`, the `channels` map (per-channel `ChannelStat`), `activity` (daily map), `since` |
| `ChannelStat` | `name`, `secondsWatched`, `videosWatched`, `engaged`/`skimmed`/`skipped`, `lastWatched`, `avatarUrl` |
| `lib/stats.ts` | `topChannelsByTime(channels, n)`, `mostEngagedChannels(channels, n)`, `engagedRatio(c)`, `trimChannelStats` |
| `lib/dashboards.ts` | `rangeFor` / `windowStats` / `compareWindows` / `pctDelta` / `computeTimeSaved` — the **week/month/year** windowed engagement view from history |
| `lib/history.ts` | `computeChannelStats(history)`, `expireOldEntries`, `trimToLimit` |
| `getHistory()` | the watch log (per-video entries: `channel`, `watchedSeconds`, `userRating`, `durationSeconds`, `createdAt`) |

## ⚠️ The one thing to check first — the activity heatmap source

The GitHub-style **activity heatmap** needs a **daily WATCH** signal. In TL;DW,
`LifetimeStats.activity` was bumped on *summary* completion (a path Watchprint doesn't
have), so **`activity` may be empty here.** Pick one:
- **(preferred)** bump `activity[localDateKey()]` (by +1 video, or +watched-seconds) inside
  `recordWatchProgress` / the background `WATCH_PROGRESS` handler, so it tracks watch days
  going forward; **or**
- derive daily watch-time on the fly from `getHistory()` grouped by `localDateKey(createdAt)`.
Color cells by **minutes watched** (or videos) that day. Keep the streak ("days you
watched something").

## The pages

### Stats — the usage overview
- **Headline cards:** total **time watched**, total **videos watched**, and the
  **engagement split** (Engaged / Skimmed / Skipped — your finish behavior). Lead with
  engagement, not just minutes.
- **Week / Month / Year toggle** with vs-previous-window **delta chips** (use
  `windowStats`/`compareWindows`/`pctDelta`). This is the F7-style dashboard from TL;DW
  pre-`dd34755`.
- **Engagement donut** — Engaged/Skimmed/Skipped proportions (your overall finish rate).
- **Activity heatmap + streak** (see the gotcha above) — daily watch activity over the year.
- **Top channels by time** and **Most engaged channels** (`topChannelsByTime`,
  `mostEngagedChannels`) — two short ranked lists.
- **Time-of-day heatmap (the Watchprint differentiator from IDEAS):** when you watch /
  binge, hour-of-day × day-of-week, from `history` `createdAt`. Nice-to-have for v1;
  high-value for the "where does my attention go" pitch.

### Channels — the per-channel engagement table
- One row per channel: **time watched · videos · engagement** (Engaged/Skimmed/Skipped
  or a **finish-rate %** via `engagedRatio`) · **last watched** · avatar.
- **Sort:** by time / by finish-rate (most vs least engaged) / recent.
- **Search** by channel name. **Virtualize** (`VirtualList`) — channel lists get long.
- Frame engagement as **"finish vs. abandon"** — the wedge. NO tags / auto-summarize
  (those were TL;DW).
- Expandable row → that channel's recent videos (title · % watched · verdict · date).

### History — the watch log
- Every video you watched: title · channel · **% watched** (watchedSeconds/duration) ·
  **verdict** (Engaged/Skimmed/Skipped) · date. Searchable, **virtualized**, with the
  expand/animate pattern. Date-grouped (Today / Yesterday / …) is a plus.

### Settings
- **Engagement thresholds** (`engagedPct` / `skimmedPct`) — what counts as Engaged vs
  Skimmed vs Skipped. **History limit / auto-expiry.** A master **tracking on/off**.
- **Accuracy controls (IDEAS):** exclude YouTube **Music**, don't count background/AFK —
  surface whatever the engine supports. Clear-data + export (JSON) buttons.

### Popup
- A small **"today" card** (time watched today, top channel) + an **Open dashboard**
  button. (Already built — keep it.)

## Acceptance
Load `dist`, watch a few YouTube videos (let progress reports fire), open Options →
Stats/Channels/History should show **per-channel time + engagement accruing**, the
windowed view + donut + heatmap render, and empty/new-user states read sensibly
("tracks from install forward — no historical backfill"). `npm run typecheck` clean,
`npm test` green.

## Conventions
Copy-don't-import from `../tldw` (separate repo, no monorepo). `npm run build` is plain
`vite build` (no version bump). Commit per the trailer in [`HANDOFF.md`](HANDOFF.md) and
push. Theme with `src/options/options.css` (already copied).
