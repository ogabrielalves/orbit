import type { NoteSummary } from "@/bindings";

const OPEN_TOKEN = "[[";
const CLOSE_TOKEN = "]]";
const FORBIDDEN_IN_QUERY = ["\n", "[", "]"];
const MAX_SUGGESTIONS = 8;

export type WikiLinkTrigger = {
  query: string;
  from: number;
  to: number;
};

export function findWikiLinkTrigger(textBefore: string): WikiLinkTrigger | null {
  const openIndex = textBefore.lastIndexOf(OPEN_TOKEN);
  const hasOpen = openIndex >= 0;
  if (!hasOpen) {
    return null;
  }

  const query = textBefore.slice(openIndex + OPEN_TOKEN.length);
  const hasForbidden = FORBIDDEN_IN_QUERY.some((token) => query.includes(token));
  if (hasForbidden) {
    return null;
  }

  return { query, from: openIndex, to: textBefore.length };
}

export function filterNoteSuggestions(notes: NoteSummary[], query: string): NoteSummary[] {
  const needle = query.trim().toLowerCase();
  const hasNeedle = needle.length > 0;
  const matches = hasNeedle
    ? notes.filter((note) => note.title.toLowerCase().includes(needle))
    : notes;

  return [...matches]
    .sort((a, b) => {
      const isAStart = a.title.toLowerCase().startsWith(needle);
      const isBStart = b.title.toLowerCase().startsWith(needle);
      const isSameRank = isAStart === isBStart;
      if (isSameRank) {
        return a.title.localeCompare(b.title);
      }
      return isAStart ? -1 : 1;
    })
    .slice(0, MAX_SUGGESTIONS);
}

export function buildWikiLink(title: string): string {
  return `${OPEN_TOKEN}${title}${CLOSE_TOKEN}`;
}

export function extractWikiLinkTarget(text: string): string | null {
  const isWrapped = text.startsWith(OPEN_TOKEN) && text.endsWith(CLOSE_TOKEN);
  if (!isWrapped) {
    return null;
  }

  const inner = text.slice(OPEN_TOKEN.length, text.length - CLOSE_TOKEN.length);
  const target = inner.split("|")[0]?.split("#")[0]?.trim() ?? "";
  const hasTarget = target.length > 0;
  return hasTarget ? target : null;
}

export function findWikiLinkAt(text: string, offset: number): string | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const start = text.indexOf(OPEN_TOKEN, searchFrom);
    const hasStart = start >= 0;
    if (!hasStart) {
      return null;
    }
    const closeIndex = text.indexOf(CLOSE_TOKEN, start + OPEN_TOKEN.length);
    const hasClose = closeIndex >= 0;
    if (!hasClose) {
      return null;
    }
    const end = closeIndex + CLOSE_TOKEN.length;
    const isInside = offset >= start && offset <= end;
    if (isInside) {
      return extractWikiLinkTarget(text.slice(start, end));
    }
    searchFrom = end;
  }
  return null;
}
