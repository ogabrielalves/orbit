import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WindowCloseGuard } from "@/app/WindowCloseGuard";
import { i18next } from "@/i18n";
import { registerCloseGuard } from "@/lib/closeGuards";

type CloseEvent = { preventDefault: () => void };
type CloseHandler = (event: CloseEvent) => Promise<void>;

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(),
  handler: null as CloseHandler | null,
  unlisten: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauri.isTauri }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: CloseHandler) => {
      tauri.handler = handler;
      return tauri.unlisten;
    },
    destroy: tauri.destroy,
  }),
}));

async function requestClose() {
  const event = { preventDefault: vi.fn() };
  await act(async () => {
    await tauri.handler?.(event);
  });
  return event;
}

describe("WindowCloseGuard", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    tauri.isTauri.mockReset().mockReturnValue(true);
    tauri.unlisten.mockReset();
    tauri.destroy.mockReset().mockResolvedValue(undefined);
    tauri.handler = null;
  });

  it("does nothing outside the desktop app", () => {
    tauri.isTauri.mockReturnValue(false);

    render(<WindowCloseGuard />);

    expect(tauri.handler).toBeNull();
  });

  it("lets the window close when there is nothing pending", async () => {
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());

    const event = await requestClose();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("saves pending changes and lets the window close", async () => {
    const flush = vi.fn().mockResolvedValue(true);
    const unregister = registerCloseGuard({ hasPending: () => true, flush });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());

    const event = await requestClose();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    unregister();
  });

  it("keeps the window open and asks when saving fails", async () => {
    const unregister = registerCloseGuard({ hasPending: () => true, flush: async () => false });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());

    const event = await requestClose();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("alertdialog", { name: "Your changes were not saved" }),
    ).toBeInTheDocument();
    expect(tauri.destroy).not.toHaveBeenCalled();
    unregister();
  });

  it("closes without saving when the user chooses to", async () => {
    const unregister = registerCloseGuard({ hasPending: () => true, flush: async () => false });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());
    await requestClose();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close without saving" }));

    expect(tauri.destroy).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("stays open when the user cancels", async () => {
    const unregister = registerCloseGuard({ hasPending: () => true, flush: async () => false });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());
    await requestClose();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(tauri.destroy).not.toHaveBeenCalled();
    unregister();
  });

  it("retries saving and closes once it works", async () => {
    const flush = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const unregister = registerCloseGuard({ hasPending: () => true, flush });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());
    await requestClose();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Try saving again" }));

    await vi.waitFor(() => expect(tauri.destroy).toHaveBeenCalledTimes(1));
    expect(flush).toHaveBeenCalledTimes(2);
    unregister();
  });

  it("stays open when the retry fails too", async () => {
    const flush = vi.fn().mockResolvedValue(false);
    const unregister = registerCloseGuard({ hasPending: () => true, flush });
    render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());
    await requestClose();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Try saving again" }));

    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
    expect(tauri.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    unregister();
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = render(<WindowCloseGuard />);
    await vi.waitFor(() => expect(tauri.handler).not.toBeNull());

    unmount();

    await vi.waitFor(() => expect(tauri.unlisten).toHaveBeenCalledTimes(1));
  });
});
