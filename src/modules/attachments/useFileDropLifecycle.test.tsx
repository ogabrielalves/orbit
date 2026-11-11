import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileDrop } from "@/modules/attachments/useFileDrop";

const webview = vi.hoisted(() => ({
  onDragDropEvent: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: webview.onDragDropEvent }),
}));

describe("useFileDrop lifecycle", () => {
  beforeEach(() => {
    webview.onDragDropEvent.mockReset();
    webview.unlisten.mockReset();
  });

  it("releases the listener that resolves after the hook was unmounted", async () => {
    let resolveListen: (stop: () => void) => void = () => undefined;
    webview.onDragDropEvent.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );
    const { unmount } = renderHook(() => useFileDrop(() => undefined));

    unmount();
    resolveListen(webview.unlisten);
    await Promise.resolve();
    await Promise.resolve();

    expect(webview.unlisten).toHaveBeenCalledTimes(1);
  });

  it("does not crash when the listener cannot be registered", async () => {
    webview.onDragDropEvent.mockReturnValue(Promise.reject(new Error("denied")));

    const { result, unmount } = renderHook(() => useFileDrop(() => undefined));
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
    expect(webview.unlisten).not.toHaveBeenCalled();
  });
});
