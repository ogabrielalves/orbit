export type BoardSearch = {
  task?: string;
};

export function parseBoardSearch(raw: Record<string, unknown>): BoardSearch {
  const isText = typeof raw.task === "string";
  const hasTask = isText && raw.task !== "";
  return { task: hasTask ? (raw.task as string) : undefined };
}
