import { formatHotkey } from "@/lib/formatHotkey";

export const creationShortcuts = {
  newProject: "mod+shift+p",
  newTask: "mod+shift+t",
  newBoard: "mod+shift+b",
  newNote: "mod+shift+n",
} as const;

export function isMacPlatform(): boolean {
  return /mac/i.test(navigator.platform);
}

export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

export function formatShortcut(combo: string): string {
  const isMac = isMacPlatform();
  const keys = formatHotkey(combo, isMac);
  return keys.join(isMac ? "" : "+");
}
