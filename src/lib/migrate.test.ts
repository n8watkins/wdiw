import { describe, expect, it } from "vitest";
import { collapseByVideo, foldImportedEntries, parseHistoryExport, videoKey } from "./migrate";
import { emptyLifetimeStats } from "./storage";
import type { SearchHistoryEntry } from "../types";

function entry(over: Partial<SearchHistoryEntry> & { videoUrl: string; createdAt: string }): SearchHistoryEntry {
  return { id: over.videoUrl + over.createdAt, profileId: "", profileName: "", prompt: "", ...over };
}

describe("parseHistoryExport", () => {
  it("accepts the TL;DW export wrapper { entries: [...] }", () => {
    const json = {
      exportedAt: "2026-06-01T00:00:00Z",
      source: "TL;DW",
      entries: [
        { videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z", channel: "A" },
      ],
    };
    expect(parseHistoryExport(json)).toHaveLength(1);
  });

  it("accepts a bare array", () => {
    const json = [{ videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z" }];
    expect(parseHistoryExport(json)).toHaveLength(1);
  });

  it("drops rows without a videoUrl or with an unparseable createdAt", () => {
    const json = {
      entries: [
        { videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z" }, // ok
        { createdAt: "2026-06-01T10:00:00Z" }, // no url
        { videoUrl: "https://youtube.com/watch?v=b", createdAt: "not-a-date" }, // bad date
        "garbage",
      ],
    };
    expect(parseHistoryExport(json).map((e) => e.videoUrl)).toEqual(["https://youtube.com/watch?v=a"]);
  });

  it("throws on an unrecognized shape", () => {
    expect(() => parseHistoryExport({ foo: 1 })).toThrow(/history export/i);
    expect(() => parseHistoryExport(null)).toThrow();
  });
});

describe("collapseByVideo", () => {
  it("collapses multiple rows per video — max watched, best verdict, earliest createdAt", () => {
    const rows = [
      entry({ videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-02T10:00:00Z", watchedSeconds: 30, userRating: "skim", channel: "Chan" }),
      entry({ videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z", watchedSeconds: 120, userRating: "watch", durationSeconds: 200 }),
    ];
    const out = collapseByVideo(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.watchedSeconds).toBe(120);
    expect(out[0]!.userRating).toBe("watch"); // best verdict
    expect(out[0]!.createdAt).toBe("2026-06-01T10:00:00Z"); // earliest
    expect(out[0]!.channel).toBe("Chan"); // first non-empty
    expect(out[0]!.durationSeconds).toBe(200);
  });

  it("keeps distinct videos separate (keyed by video id)", () => {
    const out = collapseByVideo([
      entry({ videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z" }),
      entry({ videoUrl: "https://youtu.be/a", createdAt: "2026-06-01T11:00:00Z" }), // same id "a"
      entry({ videoUrl: "https://youtube.com/watch?v=b", createdAt: "2026-06-01T12:00:00Z" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("videoKey", () => {
  it("keys by video id across url forms", () => {
    expect(videoKey(entry({ videoUrl: "https://youtube.com/watch?v=xyz", createdAt: "x" }))).toBe("xyz");
    expect(videoKey(entry({ videoUrl: "https://youtu.be/xyz", createdAt: "x" }))).toBe("xyz");
  });
});

describe("foldImportedEntries", () => {
  it("folds watch time, video counts, verdicts, and per-channel stats", () => {
    const stats = emptyLifetimeStats();
    foldImportedEntries(stats, [
      entry({ videoUrl: "https://youtube.com/watch?v=a", createdAt: new Date(2026, 5, 1, 10).toISOString(), watchedSeconds: 100, userRating: "watch", channel: "Chan", durationSeconds: 120 }),
      entry({ videoUrl: "https://youtube.com/watch?v=b", createdAt: new Date(2026, 5, 1, 11).toISOString(), watchedSeconds: 50, userRating: "skim", channel: "Chan" }),
    ]);
    expect(stats.secondsWatched).toBe(150);
    expect(stats.videosWatched).toBe(2);
    expect(stats.engaged).toBe(1);
    expect(stats.skimmed).toBe(1);
    const c = stats.channels!["Chan"]!;
    expect(c.secondsWatched).toBe(150);
    expect(c.videosWatched).toBe(2);
    expect(c.engaged).toBe(1);
    expect(c.skimmed).toBe(1);
    // activity + dailySeconds keyed by the entries' local day
    const day = localDay(new Date(2026, 5, 1, 10));
    expect(stats.activity[day]).toBe(2);
    expect(stats.dailySeconds![day]).toBe(150);
  });

  it("sets `since` to the earliest imported watch", () => {
    const stats = emptyLifetimeStats();
    stats.since = "2026-06-10T00:00:00Z";
    foldImportedEntries(stats, [
      entry({ videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-03T10:00:00Z", watchedSeconds: 10 }),
    ]);
    expect(stats.since).toBe("2026-06-03T10:00:00Z");
  });

  it("treats Shorts with the simplified model (no engagement verdict)", () => {
    const stats = emptyLifetimeStats();
    foldImportedEntries(stats, [
      entry({ videoUrl: "https://youtube.com/shorts/a", createdAt: new Date(2026, 5, 1, 9).toISOString(), watchedSeconds: 40, userRating: "watch", isShort: true, channel: "Chan" }),
    ]);
    expect(stats.shortsCount).toBe(1);
    expect(stats.shortsSeconds).toBe(40);
    expect(stats.engaged).toBe(0); // Shorts don't move the engagement counters
    expect(stats.channels!["Chan"]!.shortsVideos).toBe(1);
  });
});

// Local-day key mirroring constants.localDateKey, so the test asserts the right bucket.
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
