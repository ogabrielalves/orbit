export type NotesSearch = {
  folder?: string;
};

export function parseNotesSearch(raw: Record<string, unknown>): NotesSearch {
  const isText = typeof raw.folder === "string";
  const hasFolder = isText && raw.folder !== "";
  return { folder: hasFolder ? (raw.folder as string) : undefined };
}
