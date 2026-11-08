import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useHotkey } from "@/hooks/useHotkey";

describe("useHotkey", () => {
  it("calls the handler when the combo is pressed", async () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+\\", handler));

    await userEvent.keyboard("{Control>}\\{/Control}");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", async () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+\\", handler));

    await userEvent.keyboard("a");

    expect(handler).not.toHaveBeenCalled();
  });

  it("uses the latest handler without resubscribing", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ handler }) => useHotkey("mod+k", handler), {
      initialProps: { handler: first },
    });

    rerender({ handler: second });
    await userEvent.keyboard("{Control>}k{/Control}");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount", async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey("mod+k", handler));

    unmount();
    await userEvent.keyboard("{Control>}k{/Control}");

    expect(handler).not.toHaveBeenCalled();
  });
});
