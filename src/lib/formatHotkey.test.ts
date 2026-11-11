import { describe, expect, it } from "vitest";
import { formatHotkey } from "@/lib/formatHotkey";

describe("formatHotkey", () => {
  it("turns mod into Ctrl outside macOS", () => {
    expect(formatHotkey("mod+k", false)).toEqual(["Ctrl", "K"]);
  });

  it("turns mod into the command key on macOS", () => {
    expect(formatHotkey("mod+k", true)).toEqual(["⌘", "K"]);
  });

  it("names special keys", () => {
    expect(formatHotkey("mod+enter", false)).toEqual(["Ctrl", "Enter"]);
    expect(formatHotkey("mod+\\", false)).toEqual(["Ctrl", "\\"]);
  });

  it("names shift and alt", () => {
    expect(formatHotkey("mod+shift+alt+p", false)).toEqual(["Ctrl", "Shift", "Alt", "P"]);
    expect(formatHotkey("alt+p", true)).toEqual(["⌥", "P"]);
  });
});
