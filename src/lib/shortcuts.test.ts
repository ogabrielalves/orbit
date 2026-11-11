import { afterEach, describe, expect, it } from "vitest";
import { creationShortcuts, formatShortcut, isDialogOpen } from "@/lib/shortcuts";

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
}

describe("shortcuts", () => {
  afterEach(() => {
    setPlatform("Win32");
    document.body.innerHTML = "";
  });

  it("joins the keys with plus signs outside the Mac", () => {
    setPlatform("Win32");

    expect(formatShortcut("mod+k")).toBe("Ctrl+K");
    expect(formatShortcut(creationShortcuts.newTask)).toBe("Ctrl+Shift+T");
    expect(formatShortcut("mod+\\")).toBe("Ctrl+\\");
  });

  it("uses the Mac symbols without separators", () => {
    setPlatform("MacIntel");

    expect(formatShortcut("mod+k")).toBe("⌘K");
    expect(formatShortcut("mod+alt+p")).toBe("⌘⌥P");
  });

  it("knows when a dialog is open", () => {
    expect(isDialogOpen()).toBe(false);

    document.body.innerHTML = '<div role="dialog"></div>';
    expect(isDialogOpen()).toBe(true);

    document.body.innerHTML = '<div role="alertdialog"></div>';
    expect(isDialogOpen()).toBe(true);
  });
});
