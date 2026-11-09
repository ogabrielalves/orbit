import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileDrop } from "@/modules/attachments/useFileDrop";

type DragHandler = (event: { payload: Record<string, unknown> }) => void;

const webview = vi.hoisted(() => ({
  handler: null as null | ((event: { payload: Record<string, unknown> }) => void),
  unlisten: vi.fn(),
  fails: false,
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => {
    if (webview.fails) {
      throw new Error("not running inside Tauri");
    }
    return {
      onDragDropEvent: (handler: DragHandler) => {
        webview.handler = handler;
        return Promise.resolve(webview.unlisten);
      },
    };
  },
}));

async function emit(payload: Record<string, unknown>) {
  await act(async () => {
    webview.handler?.({ payload });
  });
}

describe("useFileDrop", () => {
  beforeEach(() => {
    webview.handler = null;
    webview.fails = false;
    webview.unlisten.mockReset();
  });

  it("starts without files being dragged", () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));

    expect(result.current).toBe(false);
  });

  it("reports files hovering the window and stops when they leave", async () => {
    const { result } = renderHook(() => useFileDrop(() => undefined));

    await emit({ type: "enter", paths: ["a"], position: { x: 0, y: 0 } });
    expect(result.current).toBe(true);
    await emit({ type: "over", position: { x: 1, y: 1 } });
    expect(result.current).toBe(true);
    await emit({ type: "leave" });

    expect(result.current).toBe(false);
  });

  it("hands the dropped paths to the callback and stops reporting a drag", async () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop(onDrop));

    await emit({ type: "enter", paths: ["a"], position: { x: 0, y: 0 } });
    await emit({ type: "drop", paths: ["C:\\a.pdf", "C:\\b.png"], position: { x: 0, y: 0 } });

    expect(onDrop).toHaveBeenCalledWith(["C:\\a.pdf", "C:\\b.png"]);
    expect(result.current).toBe(false);
  });

  it("always calls the latest callback", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ onDrop }) => useFileDrop(onDrop), {
      initialProps: { onDrop: first },
    });

    rerender({ onDrop: second });
    await emit({ type: "drop", paths: ["a"], position: { x: 0, y: 0 } });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(["a"]);
  });

  it("stops listening when it unmounts", async () => {
    const { unmount } = renderHook(() => useFileDrop(() => undefined));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(webview.unlisten).toHaveBeenCalledTimes(1);
  });

  it("does not crash outside Tauri", () => {
    webview.fails = true;

    const { result } = renderHook(() => useFileDrop(() => undefined));

    expect(result.current).toBe(false);
  });
});
