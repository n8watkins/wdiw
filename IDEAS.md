# Product ideas — making this a great YouTube analysis app

> Grounded in the competitive research (see `../tldw/docs/ANALYTICS_SPLIT.md` §3–4).
> The market is real but weak: the leaders (Watchtime Tracker ~10k, YouTube Time
> Manager ~8k) are dinged for **accuracy bugs, resets, ads, CPU drain**; the most
> dashboard-complete one (YouTube Watch Stats) has ~522 installs. Adjacent giants
> (StayFree 200k, Unhook 1M) **strip the feed or bucket time by domain** — none do
> **per-channel, engagement-aware** analytics. That gap is the wedge.

## The thesis
Everyone today answers "how much time on YouTube?" We answer **"where did my
attention actually go, and was it worth it?"** — per channel, long-form vs. Shorts,
finished vs. abandoned, live and 100% local.

## Phase 0 — the MVP (in progress: steps 1–4)
- Watch-time capture (done: step 3) → per-channel **time + engagement** (engaged /
  skimmed / skipped from how much you actually watch).
- Dashboards: Stats overview, Channels (time + engagement), History — ported from
  TL;DW.
- Local-only, no account, no servers (table stakes — but do it cleanly).

## Phase 1 — the differentiators (the actual wedge)
1. **Engagement / "taste" analytics.** Which channels you *finish* vs. *bail on*;
   your finish-rate trend; "attention quality," not just minutes. **Nobody does this.**
2. **Shorts vs. long-form split + a Shorts quantifier.** Count, time, and
   *doom-scroll sessions* on Shorts specifically — YouTube's own "Time Watched" never
   breaks Shorts out, and every Shorts extension only *hides* them. Pair with an
   **optional limit/nudge** ("you've done 40 min of Shorts today") — demand skews
   toward "help me stop," not just "show me a number."
3. **Accuracy as a headline feature.** The #1 universal complaint about every
   incumbent. Be focus/visibility/playback-state aware: don't count background or
   AFK tabs, don't double-count, make YouTube **Music** excludable. "The tracker
   that's actually right."
4. **Time-of-day / peak-hour heatmap.** When you watch (and binge), GitHub-style.

## Phase 2 — the moat
5. **Google Takeout import.** Seed *years* of historical watch history (the only
   ToS-clean path to backfill — live observation only sees data from install-date
   forward). No extension does this well; it instantly makes the dashboards rich on
   day one. (Caveat: Takeout has no watch *durations* — enrich what we can, be honest.)
6. **"Where I found this" source attribution.** Home feed vs. search vs. channel vs.
   Shorts vs. subscriptions — how each surface eats your time. Only one tiny
   extension touches this; analytically juicy.
7. **Trends & affinity over time.** Week/month/year; which channels are rising or
   fading in your attention; new-vs-returning channel mix.

## Phase 3 — wellbeing & sharing (optional)
8. **Goals & limits / gentle nudges.** Daily caps, "you're 80% to your Shorts limit,"
   end-of-day recap. Matches the strongest expressed demand ("help me stop").
9. **Exportable / shareable insights.** Your own "year in watching" you control and
   can export — but **don't make yearly-wrapped the core** (YouTube shipped native
   **Recap** in Dec 2025). Lead with *always-on*, *finer-grained*, *local*.
10. **Category / topic breakdown.** Group channels into themes (learning vs.
    entertainment vs. news) and show the mix.

## Hard "don'ts" (positioning guardrails)
- **No servers, no LLM, no selling watch data.** Local-only is the trust story (and
  sidesteps most ToS/privacy concerns — the SponsorBlock posture).
- **Don't be "yet another yearly wrapped"** — Recap exists; differentiate on
  always-on + per-channel + engagement + Shorts + accuracy.
- **No ads, no CPU drain** — two of the incumbents' loudest complaints; winning here
  is free.

## Monetization (parked — F7 paid analytics dropped, noted for later)
The space *does* monetize (DF Tube went paid; ShortsBlocker sells "time-saved"
stats). If ever wanted, the paid hooks are the **moat** features — Takeout import,
source attribution, trends, optional privacy-preserving sync — not the basic
time/channel view (give that away free to win distribution). Keep core free for now.

## Suggested build order
Phase 0 (finish the dashboards) → **Shorts split + quantifier** (Phase 1.2, the
clearest unmet need) → **accuracy hardening** (1.3, the trust win) → **Takeout import**
(2.5, the day-one-rich moat) → trends/source-attribution → wellbeing/export.
