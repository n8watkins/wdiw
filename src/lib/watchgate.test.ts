import { describe, expect, it } from "vitest";
import { countableSeconds, type TickInput } from "./watchgate";

/** A "normal playing tick" baseline the cases below tweak. */
function tick(over: Partial<TickInput> = {}): TickInput {
  return {
    delta: 1,
    wallElapsed: 1,
    rate: 1,
    hidden: false,
    paused: false,
    ended: false,
    adShowing: false,
    ...over,
  };
}

describe("countableSeconds — accuracy gates", () => {
  it("counts a normal forward tick", () => {
    expect(countableSeconds(tick({ delta: 1 }))).toBe(1);
  });

  it("does NOT count a hidden (background) tab", () => {
    expect(countableSeconds(tick({ hidden: true }))).toBe(0);
  });

  it("does NOT count while paused or ended", () => {
    expect(countableSeconds(tick({ paused: true }))).toBe(0);
    expect(countableSeconds(tick({ ended: true }))).toBe(0);
  });

  it("does NOT count ad playback", () => {
    expect(countableSeconds(tick({ adShowing: true }))).toBe(0);
  });
});

describe("countableSeconds — seek rejection + clamp", () => {
  it("rejects a forward seek (delta beyond the plausible window)", () => {
    // 1s wall × 1× rate + 1 = maxStep 2; a 30s jump is a seek.
    expect(countableSeconds(tick({ delta: 30, wallElapsed: 1, rate: 1 }))).toBe(0);
  });

  it("rejects backward motion (rewind)", () => {
    expect(countableSeconds(tick({ delta: -5 }))).toBe(0);
  });

  it("ignores a zero delta", () => {
    expect(countableSeconds(tick({ delta: 0 }))).toBe(0);
  });

  it("allows faster advance at higher playback rate", () => {
    // 2× rate: maxStep = 1×2 + 1 = 3, so a 2.5s advance is legit.
    expect(countableSeconds(tick({ delta: 2.5, wallElapsed: 1, rate: 2 }))).toBe(2.5);
    // …but a 4s advance in that same 1s window is a seek.
    expect(countableSeconds(tick({ delta: 4, wallElapsed: 1, rate: 2 }))).toBe(0);
  });

  it("clamps the gap so a long stall can't widen the seek window", () => {
    // wallElapsed 120s clamps to 4 → maxStep 5; a 60s jump is still a seek.
    expect(countableSeconds(tick({ delta: 60, wallElapsed: 120, rate: 1 }))).toBe(0);
    // a 3s advance after a throttled 120s gap is plausible playback.
    expect(countableSeconds(tick({ delta: 3, wallElapsed: 120, rate: 1 }))).toBe(3);
  });

  it("uses a 1s baseline on the first tick (no prior timestamp)", () => {
    // wallElapsed 0 → gap 1 → maxStep 2; a 1.5s first advance counts, 5s doesn't.
    expect(countableSeconds(tick({ delta: 1.5, wallElapsed: 0 }))).toBe(1.5);
    expect(countableSeconds(tick({ delta: 5, wallElapsed: 0 }))).toBe(0);
  });
});
