import { describe, expect, it } from "vitest";
import {
  collapseByVideo,
  foldImportedEntries,
  looksLikeTakeout,
  parseHistoryExport,
  parseTakeoutHistory,
  videoKey,
} from "./migrate";
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

describe("parseTakeoutHistory", () => {
  it("parses a normal watched record (prefix stripped, channel from subtitles[0], createdAt normalized)", () => {
    const out = parseTakeoutHistory([
      {
        header: "YouTube",
        title: "Watched My Great Video",
        titleUrl: "https://www.youtube.com/watch?v=abc123",
        subtitles: [{ name: "Cool Channel", url: "https://www.youtube.com/channel/UC123" }],
        time: "2023-10-27T10:00:00.000Z",
        products: ["YouTube"],
        activityControls: ["YouTube watch history"],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.videoTitle).toBe("My Great Video"); // "Watched " prefix stripped
    expect(out[0]!.channel).toBe("Cool Channel");
    expect(out[0]!.videoUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(out[0]!.createdAt).toBe("2023-10-27T10:00:00.000Z"); // normalized UTC ISO
    expect(out[0]!.id).toBe(""); // importer assigns the real id
    // No watch-time / verdict / kind in Takeout.
    expect(out[0]!.watchedSeconds).toBeUndefined();
    expect(out[0]!.userRating).toBeUndefined();
    expect(out[0]!.isShort).toBeUndefined();
  });

  it("normalizes a non-UTC time to UTC ISO", () => {
    const out = parseTakeoutHistory([
      { title: "Watched X", titleUrl: "https://www.youtube.com/watch?v=tz", time: "2023-01-01T00:00:00+02:00" },
    ]);
    expect(out[0]!.createdAt).toBe("2022-12-31T22:00:00.000Z");
  });

  it("skips ad records — both the title form and the 'From Google Ads' details form", () => {
    const out = parseTakeoutHistory([
      { title: "Viewed Ads On YouTube Homepage", titleUrl: "https://www.youtube.com/watch?v=ad1", time: "2023-10-27T10:00:00Z" },
      {
        title: "Watched Sponsored Thing",
        titleUrl: "https://www.youtube.com/watch?v=ad2",
        time: "2023-10-27T10:00:00Z",
        details: [{ name: "From Google Ads" }],
      },
      { title: "Watched Real", titleUrl: "https://www.youtube.com/watch?v=ok", time: "2023-10-27T10:00:00Z" },
    ]);
    expect(out.map((e) => e.videoUrl)).toEqual(["https://www.youtube.com/watch?v=ok"]);
  });

  it("skips removed/deleted/private videos (no titleUrl)", () => {
    const out = parseTakeoutHistory([
      { title: "Watched a removed video", time: "2023-10-27T10:00:00Z" },
    ]);
    expect(out).toEqual([]);
  });

  it("skips YouTube Music entries", () => {
    const out = parseTakeoutHistory([
      { title: "Watched A Song", titleUrl: "https://music.youtube.com/watch?v=song", time: "2023-10-27T10:00:00Z" },
    ]);
    expect(out).toEqual([]);
  });

  it("skips community post urls (/post/ yields no video id)", () => {
    const out = parseTakeoutHistory([
      { title: "Viewed a post", titleUrl: "https://www.youtube.com/post/UgkxABC", time: "2023-10-27T10:00:00Z" },
    ]);
    expect(out).toEqual([]);
  });

  it("skips records with an invalid or missing time", () => {
    const out = parseTakeoutHistory([
      { title: "Watched A", titleUrl: "https://www.youtube.com/watch?v=a", time: "not-a-date" },
      { title: "Watched B", titleUrl: "https://www.youtube.com/watch?v=b" }, // no time
    ]);
    expect(out).toEqual([]);
  });

  it("uses the raw title when it has no 'Watched ' prefix", () => {
    const out = parseTakeoutHistory([
      { title: "Some Other Title", titleUrl: "https://www.youtube.com/watch?v=raw", time: "2023-10-27T10:00:00Z" },
    ]);
    expect(out[0]!.videoTitle).toBe("Some Other Title");
  });

  it("throws on a non-array input", () => {
    expect(() => parseTakeoutHistory({ entries: [] })).toThrow(/Google Takeout/i);
    expect(() => parseTakeoutHistory(null)).toThrow(/Google Takeout/i);
  });
});

describe("looksLikeTakeout", () => {
  it("is true for a Takeout-shaped array (titleUrl + time)", () => {
    expect(
      looksLikeTakeout([
        { title: "Watched X", titleUrl: "https://www.youtube.com/watch?v=a", time: "2023-10-27T10:00:00Z" },
      ]),
    ).toBe(true);
  });

  it("is false for the { entries: [...] } wrapper", () => {
    expect(looksLikeTakeout({ entries: [{ titleUrl: "x", time: "y" }] })).toBe(false);
  });

  it("is false for a WDIW entries array (videoUrl/createdAt, not titleUrl/time)", () => {
    expect(
      looksLikeTakeout([
        { videoUrl: "https://youtube.com/watch?v=a", createdAt: "2026-06-01T10:00:00Z", channel: "A" },
      ]),
    ).toBe(false);
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
