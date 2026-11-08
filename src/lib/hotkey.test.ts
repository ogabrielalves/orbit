import { describe, expect, it } from "vitest";
import { matchesHotkey } from "@/lib/hotkey";

function keyEvent(key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

describe("matchesHotkey", () => {
  it("matches mod+key with ctrl", () => {
    expect(matchesHotkey("mod+\\", keyEvent("\\", { ctrlKey: true }))).toBe(true);
  });

  it("matches mod+key with meta", () => {
    expect(matchesHotkey("mod+\\", keyEvent("\\", { metaKey: true }))).toBe(true);
  });

  it("ignores the case of the key", () => {
    expect(matchesHotkey("mod+k", keyEvent("K", { ctrlKey: true }))).toBe(true);
  });

  it("rejects the key without the required modifier", () => {
    expect(matchesHotkey("mod+k", keyEvent("k"))).toBe(false);
  });

  it("rejects a modifier when the combo is a plain key", () => {
    expect(matchesHotkey("c", keyEvent("c", { ctrlKey: true }))).toBe(false);
  });

  it("matches a plain key", () => {
    expect(matchesHotkey("c", keyEvent("c"))).toBe(true);
  });

  it("rejects a different key", () => {
    expect(matchesHotkey("mod+k", keyEvent("j", { ctrlKey: true }))).toBe(false);
  });

  it("requires shift only when the combo asks for it", () => {
    expect(matchesHotkey("mod+shift+p", keyEvent("p", { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    );
    expect(matchesHotkey("mod+p", keyEvent("p", { ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
