import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { mediaQueries } from "@/lib/breakpoints";
import { setViewportWidth } from "@/test/viewport";

describe("useMediaQuery", () => {
  it("reports whether the query currently matches", () => {
    setViewportWidth(1440);
    const { result } = renderHook(() => useMediaQuery(mediaQueries.desktop));
    expect(result.current).toBe(true);
  });

  it("reports false when the viewport is narrower than the query", () => {
    setViewportWidth(1000);
    const { result } = renderHook(() => useMediaQuery(mediaQueries.desktop));
    expect(result.current).toBe(false);
  });

  it("updates when the viewport changes", () => {
    setViewportWidth(1000);
    const { result } = renderHook(() => useMediaQuery(mediaQueries.desktop));

    act(() => setViewportWidth(1300));

    expect(result.current).toBe(true);
  });

  it("distinguishes tablet from desktop", () => {
    setViewportWidth(900);
    const tablet = renderHook(() => useMediaQuery(mediaQueries.tablet));
    const desktop = renderHook(() => useMediaQuery(mediaQueries.desktop));
    expect(tablet.result.current).toBe(true);
    expect(desktop.result.current).toBe(false);
  });
});
