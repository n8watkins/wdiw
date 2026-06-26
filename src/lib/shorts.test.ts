import { describe, expect, it } from "vitest";
import {
  algorithmFeedChannels,
  doomScrollSessions,
  longestDoomScroll,
  shortsVsLong,
  type DoomScrollSession,
} from "./shorts";
import type { SearchHistoryEntry } from "../types";

// Small fixture builder — mirrors the hist() helper in stats.test.ts. Only the
// fields the Shorts helpers read are interesting; the rest are filled to keep
// SearchHistoryEntry happy.
function entry(over: Partial<SearchHistoryEntry> = {}): SearchHistoryEntry {
  return {
    id: over.id ?? "id",
    videoUrl: "https://youtube.com/shorts/x",
    profileId: "p",
    profileName: "P",
    prompt: "",
    createdAt: "2025-06-01T00:00:00Z",
    ...over,
  };
}

/** A Short at `createdAt` (minutes offset from a base), with optional seconds. */
function shortAt(minutes: number, watchedSeconds?: number, over: Partial<SearchHistoryEntry> = {}): SearchHistoryEntry {
  const base = new Date("2025-06-01T12:00:00Z").getTime();
  return entry({
    isShort: true,
    watchedSeconds,
    createdAt: new Date(base + minutes * 60_000).toISOString(),
    ...over,
  });
}

// ---------------------------------------------------------------------------
// doomScrollSessions
// ---------------------------------------------------------------------------

describe("doomScrollSessions", () => {
  it("returns [] for empty input", () => {
    expect(doomScrollSessions([])).toEqual([]);
  });

  it("groups a single back-to-back run into one session", () => {
    const sessions = doomScrollSessions([
      shortAt(0, 10),
      shortAt(1, 20),
      shortAt(2, 30),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.count).toBe(3);
    expect(sessions[0]!.seconds).toBe(60);
    expect(sessions[0]!.startedAt).toBe(shortAt(0).createdAt);
    expect(sessions[0]!.endedAt).toBe(shortAt(2).createdAt);
  });

  it("splits into two sessions when the gap exceeds gapMinutes", () => {
    // gap of 4 min > default 3 → break.
    const sessions = doomScrollSessions([
      shortAt(0, 5),
      shortAt(1, 5),
      shortAt(5, 5), // 4 min after the previous → new session
      shortAt(6, 5),
    ]);
    expect(sessions).toHaveLength(2);
    // newest-first: the later run (starting at minute 5) comes first.
    expect(sessions[0]!.startedAt).toBe(shortAt(5).createdAt);
    expect(sessions[0]!.count).toBe(2);
    expect(sessions[1]!.startedAt).toBe(shortAt(0).createdAt);
    expect(sessions[1]!.count).toBe(2);
  });

  it("keeps a gap exactly at the boundary in the same session", () => {
    // Exactly 3 min apart with default gap 3 → NOT a break (> is strict).
    const sessions = doomScrollSessions([shortAt(0), shortAt(3)]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.count).toBe(2);
  });

  it("honours a custom gapMinutes", () => {
    // 2 min apart, gap = 1 → break into two sessions.
    const sessions = doomScrollSessions([shortAt(0), shortAt(2)], 1);
    expect(sessions).toHaveLength(2);
  });

  it("ignores non-Short entries", () => {
    const sessions = doomScrollSessions([
      shortAt(0),
      entry({ isShort: false, createdAt: new Date("2025-06-01T12:01:00Z").toISOString() }),
      entry({ createdAt: new Date("2025-06-01T12:02:00Z").toISOString() }), // isShort undefined
      shortAt(1),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.count).toBe(2);
  });

  it("skips Shorts with an unparseable or missing createdAt", () => {
    const sessions = doomScrollSessions([
      shortAt(0),
      entry({ isShort: true, createdAt: "not-a-date" }),
      entry({ isShort: true, createdAt: "" }),
      shortAt(1),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.count).toBe(2);
  });

  it("sorts unordered input ascending before grouping", () => {
    // Fed out of order — should still produce one ascending run.
    const sessions = doomScrollSessions([shortAt(2), shortAt(0), shortAt(1)]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.startedAt).toBe(shortAt(0).createdAt);
    expect(sessions[0]!.endedAt).toBe(shortAt(2).createdAt);
  });

  it("returns sessions newest-first", () => {
    const sessions = doomScrollSessions([
      shortAt(0),
      shortAt(10), // run 2
      shortAt(20), // run 3
    ]);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]!.startedAt).toBe(shortAt(20).createdAt);
    expect(sessions[1]!.startedAt).toBe(shortAt(10).createdAt);
    expect(sessions[2]!.startedAt).toBe(shortAt(0).createdAt);
  });

  it("treats missing watchedSeconds as 0 when summing", () => {
    const sessions = doomScrollSessions([
      shortAt(0, 30),
      shortAt(1), // no watchedSeconds → +0
      shortAt(2, 12),
    ]);
    expect(sessions[0]!.seconds).toBe(42);
  });

  it("does not mutate the input array", () => {
    const input = [shortAt(2), shortAt(0), shortAt(1)];
    const snapshot = input.map((e) => e.createdAt);
    doomScrollSessions(input);
    expect(input.map((e) => e.createdAt)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// longestDoomScroll
// ---------------------------------------------------------------------------

function session(count: number, seconds: number): DoomScrollSession {
  return { startedAt: "s", endedAt: "e", count, seconds };
}

describe("longestDoomScroll", () => {
  it("returns null for an empty list", () => {
    expect(longestDoomScroll([])).toBeNull();
  });

  it("picks the session with the highest count", () => {
    const best = longestDoomScroll([session(2, 999), session(5, 10), session(3, 50)]);
    expect(best!.count).toBe(5);
  });

  it("breaks count ties by higher seconds", () => {
    const best = longestDoomScroll([session(4, 100), session(4, 250), session(4, 50)]);
    expect(best!.seconds).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// algorithmFeedChannels
// ---------------------------------------------------------------------------

describe("algorithmFeedChannels", () => {
  it("groups Shorts by channel and ranks by count desc", () => {
    const ranked = algorithmFeedChannels([
      entry({ isShort: true, channel: "A", watchedSeconds: 10 }),
      entry({ isShort: true, channel: "A", watchedSeconds: 5 }),
      entry({ isShort: true, channel: "B", watchedSeconds: 100 }),
    ]);
    expect(ranked.map((r) => r.channel)).toEqual(["A", "B"]);
    expect(ranked[0]!.shortsCount).toBe(2);
    expect(ranked[0]!.shortsSeconds).toBe(15);
  });

  it("breaks count ties by higher shortsSeconds", () => {
    const ranked = algorithmFeedChannels([
      entry({ isShort: true, channel: "A", watchedSeconds: 10 }),
      entry({ isShort: true, channel: "B", watchedSeconds: 99 }),
    ]);
    expect(ranked.map((r) => r.channel)).toEqual(["B", "A"]);
  });

  it("drops entries without a channel and non-Shorts", () => {
    const ranked = algorithmFeedChannels([
      entry({ isShort: true, channel: "A" }),
      entry({ isShort: true }), // no channel
      entry({ isShort: false, channel: "B" }), // not a Short
      entry({ channel: "C" }), // isShort undefined
    ]);
    expect(ranked.map((r) => r.channel)).toEqual(["A"]);
  });

  it("treats missing watchedSeconds as 0", () => {
    const ranked = algorithmFeedChannels([
      entry({ isShort: true, channel: "A" }),
      entry({ isShort: true, channel: "A", watchedSeconds: 7 }),
    ]);
    expect(ranked[0]!.shortsSeconds).toBe(7);
  });

  it("respects the limit (default 5)", () => {
    const many: SearchHistoryEntry[] = [];
    for (let i = 0; i < 8; i++) {
      // Channel ci gets (8 - i) Shorts so c0 is the busiest, c7 the least.
      for (let j = 0; j < 8 - i; j++) {
        many.push(entry({ isShort: true, channel: `c${i}` }));
      }
    }
    expect(algorithmFeedChannels(many)).toHaveLength(5);
    expect(algorithmFeedChannels(many, 2).map((r) => r.channel)).toEqual(["c0", "c1"]);
  });

  it("returns [] when there are no Shorts", () => {
    expect(algorithmFeedChannels([entry({ channel: "A" })])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shortsVsLong
// ---------------------------------------------------------------------------

describe("shortsVsLong", () => {
  it("splits seconds and counts across Shorts and long-form", () => {
    const split = shortsVsLong([
      entry({ isShort: true, watchedSeconds: 10 }),
      entry({ isShort: true, watchedSeconds: 5 }),
      entry({ isShort: false, watchedSeconds: 600 }),
      entry({ watchedSeconds: 300 }), // isShort undefined → long
    ]);
    expect(split).toEqual({
      shortsSeconds: 15,
      shortsCount: 2,
      longSeconds: 900,
      longCount: 2,
    });
  });

  it("treats missing watchedSeconds as 0", () => {
    const split = shortsVsLong([
      entry({ isShort: true }),
      entry({ isShort: false }),
    ]);
    expect(split.shortsSeconds).toBe(0);
    expect(split.longSeconds).toBe(0);
    expect(split.shortsCount).toBe(1);
    expect(split.longCount).toBe(1);
  });

  it("handles an all-long log", () => {
    const split = shortsVsLong([
      entry({ watchedSeconds: 100 }),
      entry({ isShort: false, watchedSeconds: 200 }),
    ]);
    expect(split).toEqual({
      shortsSeconds: 0,
      shortsCount: 0,
      longSeconds: 300,
      longCount: 2,
    });
  });

  it("handles an all-Shorts log", () => {
    const split = shortsVsLong([
      entry({ isShort: true, watchedSeconds: 30 }),
      entry({ isShort: true, watchedSeconds: 30 }),
    ]);
    expect(split).toEqual({
      shortsSeconds: 60,
      shortsCount: 2,
      longSeconds: 0,
      longCount: 0,
    });
  });

  it("returns all-zero for an empty log", () => {
    expect(shortsVsLong([])).toEqual({
      shortsSeconds: 0,
      shortsCount: 0,
      longSeconds: 0,
      longCount: 0,
    });
  });
});
