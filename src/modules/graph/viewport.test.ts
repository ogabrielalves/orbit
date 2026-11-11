import { describe, expect, it } from "vitest";
import {
  fitViewport,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toGraphPoint,
  zoomAt,
} from "@/modules/graph/viewport";

describe("graph viewport", () => {
  it("zooms around the anchor keeping the point under it", () => {
    const viewport = { x: 10, y: 20, scale: 1 };
    const anchor = { x: 200, y: 100 };
    const before = toGraphPoint(viewport, anchor);

    const zoomed = zoomAt(viewport, 2, anchor);

    expect(zoomed.scale).toBe(2);
    const after = toGraphPoint(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps the zoom", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 3 }, 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 0.2 }, 0.01, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it("pans by a delta", () => {
    expect(panBy({ x: 1, y: 2, scale: 1.5 }, 10, -4)).toEqual({ x: 11, y: -2, scale: 1.5 });
  });

  it("converts a view point to a graph point", () => {
    expect(toGraphPoint({ x: 100, y: 50, scale: 2 }, { x: 140, y: 90 })).toEqual({
      x: 20,
      y: 20,
    });
  });

  it("fits the points in the size, centered", () => {
    const viewport = fitViewport(
      [
        { x: -100, y: -50 },
        { x: 100, y: 50 },
      ],
      { width: 400, height: 300 },
      20,
    );

    expect(viewport.scale).toBeCloseTo(1.5);
    expect(viewport.x).toBeCloseTo(200);
    expect(viewport.y).toBeCloseTo(150);
  });

  it("shrinks to fit large content", () => {
    const viewport = fitViewport(
      [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
      ],
      { width: 400, height: 300 },
      20,
    );

    expect(viewport.scale).toBeCloseTo(0.18);
  });

  it("centers on the origin when there is nothing to fit", () => {
    expect(fitViewport([], { width: 400, height: 300 }, 20)).toEqual({
      x: 200,
      y: 150,
      scale: 1,
    });
  });
});
