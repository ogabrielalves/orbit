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
