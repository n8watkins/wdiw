# Watchprint (working name)

A local-only Chrome extension that analyzes **your own YouTube usage** — per-channel
watch time, engagement (which channels you finish vs. abandon), Shorts-vs-long-form
split, and trends over time. It's the **post-watch** companion to
[TL;DW](../tldw) ("should I watch this?"); Watchprint answers "what have I been
watching?".

**No account, no servers.** It observes the videos you watch in your browser and
stores everything in `chrome.storage.local` (the SponsorBlock pattern). Because of
that, it only sees videos watched **while it's installed** — there's no historical
backfill (an optional Google Takeout import is planned to seed past history).

> Split rationale, competitive research, data-access reality, and the tech-debt
> analysis live in [`../tldw/docs/ANALYTICS_SPLIT.md`](../tldw/docs/ANALYTICS_SPLIT.md).
> This is a **separate** extension/repo (no monorepo); shared code is copied from
> TL;DW by design.

## Status — step 1: foundation scaffold ✅

- Build infra (Vite + crxjs + React + TypeScript + Vitest) cloned from TL;DW.
- The **analytics data layer is copied and tested** (`src/lib/` — engagement, stats,
  dashboards, history, per-channel storage) and its unit tests pass.
- Minimal popup + options that read the lifetime stats, proving the data layer is wired.
- No content scripts yet — nothing is recorded until step 2.

## Dev

```
npm install
npm run typecheck
npm test          # ported analytics unit tests
npm run build     # → dist/ (load unpacked in chrome://extensions)
```

## Roadmap

See [`PLAN.md`](PLAN.md).
