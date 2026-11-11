const keyLabels: Record<string, string> = {
  enter: "Enter",
  "\\": "\\",
};

export function formatHotkey(combo: string, isMac: boolean): string[] {
  return combo
    .toLowerCase()
    .split("+")
    .map((part) => {
      if (part === "mod") {
        return isMac ? "⌘" : "Ctrl";
      }
      if (part === "shift") {
        return "Shift";
      }
      if (part === "alt") {
        return isMac ? "⌥" : "Alt";
      }
      return keyLabels[part] ?? part.toUpperCase();
    });
}
