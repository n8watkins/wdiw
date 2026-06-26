import { describe, expect, it } from "vitest";
import { fmtDuration, fmtDurationFine } from "./format";

describe("fmtDuration (coarse)", () => {
  it("formats hours/minutes and the small/zero cases", () => {
    expect(fmtDuration(0)).toBe("0m");
    expect(fmtDuration(-5)).toBe("0m");
    expect(fmtDuration(45)).toBe("<1m");
    expect(fmtDuration(60)).toBe("1m");
    expect(fmtDuration(47 * 60)).toBe("47m");
    expect(fmtDuration(3600)).toBe("1h");
    expect(fmtDuration(2 * 3600 + 15 * 60)).toBe("2h 15m");
  });
});

describe("fmtDurationFine (precise)", () => {
  it("keeps seconds for short durations", () => {
    expect(fmtDurationFine(0)).toBe("0s");
    expect(fmtDurationFine(45)).toBe("45s");
    expect(fmtDurationFine(12 * 60 + 30)).toBe("12m 30s");
    expect(fmtDurationFine(3600 + 4 * 60)).toBe("1h 4m");
  });
});
