import { describe, expect, it } from "vitest";
import { getProfessorRatingTier, professorRatingTones } from "@/lib/professorRating";

describe("getProfessorRatingTier", () => {
  it("buckets scores by their displayed value", () => {
    expect(getProfessorRatingTier(4.9)).toBe("high");
    expect(getProfessorRatingTier(3.96)).toBe("high");
    expect(getProfessorRatingTier(3.5)).toBe("mid");
    expect(getProfessorRatingTier(3.0)).toBe("mid");
    expect(getProfessorRatingTier(2.94)).toBe("low");
    expect(getProfessorRatingTier(1.2)).toBe("low");
  });

  it("uses a distinct hue for each tier", () => {
    const hues = Object.values(professorRatingTones).map((tone) => tone.icon.match(/text-(\w+)-/)?.[1]);
    expect(new Set(hues).size).toBe(3);
  });
});
