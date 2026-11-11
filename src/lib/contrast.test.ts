import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for the same color", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("does not depend on the order of the colors", () => {
    expect(contrastRatio("#3b4fe4", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#3b4fe4"),
      10,
    );
  });

  it("matches known WCAG values", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#3b4fe4", "#ffffff")).toBeCloseTo(6.13, 2);
  });
});
