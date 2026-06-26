# WDIW — What Did I Watch?

A local-only Chrome extension that analyzes **your own YouTube usage** — per-channel
watch time and engagement, the Shorts-vs-long-form split, doom-scroll detection, and
when-you-watch trends. Everything is computed in your browser and stored in
`chrome.storage.local`: **no account, no servers, nothing ever leaves your device**
(the SponsorBlock observe-only pattern). It's the **post-watch** companion to
[TL;DW](https://github.com/n8watkins/tldw) ("should I watch this?") — WDIW answers
"what have I been watching?".

## Features

- **Per-channel watch time** — see which channels actually own your hours.
- **Engagement, auto-rated** — every video is scored **Engaged / Skimmed / Skipped**
  from how much of it you actually watched, so you can tell what you finish vs. abandon.
- **Shorts vs. long-form split** — with **doom-scroll session detection** and an
  optional **daily Shorts limit** nudge (toolbar badge + popup banner).
- **Activity heatmap** — days watched, calendar-style.
- **"When you watch" heatmap** — your time-of-day viewing pattern.
- **Dashboards** — per-channel and lifetime views across **Stats**, **Channels**, and
  **History** tabs.
- **Today card** — a quick popup summary of today's watching.
- **Import** — bring in a TL;DW history export, a WDIW backup, or a **Google Takeout**
  `watch-history.json` to seed years of past history. (Takeout has no watch durations,
  so engagement is only computed for videos observed live.)

## Privacy

WDIW is local-only. It observes the videos you watch on YouTube, computes everything
on your device, and stores it in `chrome.storage.local`. **Nothing is ever transmitted,
sold, or shared** — there are no servers, no analytics, no telemetry, no ads, and no
remote code. Because it observes live, it only sees videos watched **while installed**;
the only way to add past history is the optional, user-initiated Google Takeout import.
There is no YouTube API or Google login (YouTube removed watch-history API access in
2016). See [PRIVACY.md](PRIVACY.md) for the full policy.

## Install

Build the extension and load it unpacked:

```
npm install
npm run build           # → dist/
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
select the `dist/` folder.

### Importing history

Open **Settings → Import** and choose a file:

- a **TL;DW** history export,
- a **WDIW** backup, or
- a **Google Takeout** `watch-history.json` (YouTube → "My Activity" export).

Takeout gives you titles, channels, and timestamps but **no watch durations**, so
imported videos count toward history without an engagement rating.

## Dev

```
npm install
npm run typecheck
npm test          # pure-logic Vitest unit tests
npm run build     # → dist/ (load unpacked in chrome://extensions)
```

Built with Vite + [@crxjs/vite-plugin](https://github.com/crxjs/chrome-extension-tools) +
React + TypeScript. Tests are pure-logic Vitest covering the analytics layer (engagement
scoring, stats aggregation, dashboards, history, per-channel storage). Icons live in
`public/icons`.

## How it works

A content script on `youtube.com` observes video playback (title, channel, URL,
timestamps, watch time) and reports it to the background service worker, which records
it to `chrome.storage.local`. The popup and dashboards read that local store to compute
engagement ratings, the Shorts split, and the heatmaps — nothing is sent anywhere.

## Docs

- [`PLAN.md`](PLAN.md) — build plan and roadmap.
- [`IDEAS.md`](IDEAS.md) — product ideas and future directions.
- [`HANDOFF.md`](HANDOFF.md) — current state and developer handoff notes.

## License

[MIT](LICENSE) © 2026 Nathan Watkins
