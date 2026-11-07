import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasPreviewMotionOverride,
  PREVIEW_MOTION_KEY,
  shouldReduceScheduleMotion,
} from "@/lib/scheduleMotion";

afterEach(() => {
  localStorage.removeItem(PREVIEW_MOTION_KEY);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function reducedMotion() {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
}

describe("schedule motion preferences", () => {
  it("respects reduced motion by default", () => {
    reducedMotion();
    expect(shouldReduceScheduleMotion()).toBe(true);
  });

  it("keeps an explicit local preview opt-in until it is removed", () => {
    reducedMotion();
    vi.stubEnv("DEV", true);
    localStorage.setItem(PREVIEW_MOTION_KEY, "full");
    expect(hasPreviewMotionOverride()).toBe(true);
    expect(shouldReduceScheduleMotion()).toBe(false);
    localStorage.removeItem(PREVIEW_MOTION_KEY);
    expect(shouldReduceScheduleMotion()).toBe(true);
  });

  it("never overrides accessibility preferences in production", () => {
    reducedMotion();
    localStorage.setItem(PREVIEW_MOTION_KEY, "full");
    vi.stubEnv("DEV", false);
    expect(hasPreviewMotionOverride()).toBe(false);
    expect(shouldReduceScheduleMotion()).toBe(true);
  });
});
