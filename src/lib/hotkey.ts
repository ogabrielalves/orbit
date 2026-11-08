type KeyboardEventLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

export function matchesHotkey(combo: string, event: KeyboardEventLike): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];

  const needsModifier = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  const hasModifier = event.ctrlKey || event.metaKey;
  const isKeyMatch = event.key.toLowerCase() === key;
  const isModifierMatch = needsModifier === hasModifier;
  const isShiftMatch = needsShift === event.shiftKey;
  const isAltMatch = needsAlt === event.altKey;

  return isKeyMatch && isModifierMatch && isShiftMatch && isAltMatch;
}
