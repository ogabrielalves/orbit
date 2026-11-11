export type WikiLink = {
  target: string;
  heading: string | null;
  alias: string | null;
  start: number;
  end: number;
};

export function titleKey(title: string): string {
  return title.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

function togglesFence(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}

function splitInclusive(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function levelOneHeading(line: string): string | null {
  const indent = line.length - line.replace(/^ +/, "").length;
  if (indent >= 4) {
    return null;
  }
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("#")) {
    return null;
  }
  const rest = trimmed.slice(1);
  if (!rest.startsWith(" ") && !rest.startsWith("\t")) {
    return null;
  }
  const text = rest.trim().replace(/#+$/, "").trim();
  return text === "" ? null : text;
}

export function titleOf(body: string, fallback: string): string {
  let inFence = false;
  for (const rawLine of splitInclusive(body)) {
    const line = rawLine.replace(/\r?\n$/, "");
    if (togglesFence(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const heading = levelOneHeading(line);
    if (heading !== null) {
      return heading;
    }
  }
  return fallback.trim();
}

export function replaceTitle(body: string, oldTitle: string, newTitle: string): string | null {
  let inFence = false;
  let offset = 0;
  for (const line of splitInclusive(body)) {
    const lineStart = offset;
    offset += line.length;
    if (togglesFence(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const content = line.replace(/[\r\n]+$/, "");
    const heading = levelOneHeading(content);
    if (heading === null) {
      continue;
    }
    if (heading !== oldTitle) {
      return null;
    }
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);
    const terminator = line.slice(content.length);
    return `${body.slice(0, lineStart)}${indent}# ${newTitle}${terminator}${body.slice(offset)}`;
  }
  return null;
}

function parseInner(inner: string, start: number, end: number): WikiLink | null {
  const pipe = inner.indexOf("|");
  const targetPart = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim();
  const hash = targetPart.indexOf("#");
  const target = (hash === -1 ? targetPart : targetPart.slice(0, hash)).trim();
  const heading = hash === -1 ? null : targetPart.slice(hash + 1).trim();
  if (target === "") {
    return null;
  }
  return {
    target,
    heading: heading === "" ? null : heading,
    alias: alias === "" ? null : alias,
    start,
    end,
  };
}

function scanLine(line: string, lineStart: number, links: WikiLink[]): void {
  let index = 0;
  let inCode = false;
  while (index < line.length) {
    const character = line[index];
    if (character === "`") {
      inCode = !inCode;
      index += 1;
      continue;
    }
    const opensLink = !inCode && character === "[" && line[index + 1] === "[";
    if (!opensLink) {
      index += 1;
      continue;
    }
    const isEmbed = index > 0 && line[index - 1] === "!";
    const close = line.indexOf("]]", index + 2);
    if (close === -1) {
      return;
    }
    const inner = line.slice(index + 2, close);
    const end = close + 2;
    if (isEmbed || inner.includes("[[")) {
      index += 2;
      continue;
    }
    const link = parseInner(inner, lineStart + index, lineStart + end);
    if (link !== null) {
      links.push(link);
    }
    index = end;
  }
}

export function extractLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  let inFence = false;
  let lineStart = 0;
  for (const line of splitInclusive(text)) {
    if (togglesFence(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      scanLine(line, lineStart, links);
    }
    lineStart += line.length;
  }
  return links;
}

export function renderLink(target: string, heading: string | null, alias: string | null): string {
  const headingPart = heading === null ? "" : `#${heading}`;
  const aliasPart = alias === null ? "" : `|${alias}`;
  return `[[${target}${headingPart}${aliasPart}]]`;
}

export function retarget(text: string, oldTitle: string, newTitle: string): [string, number] {
  const wanted = titleKey(oldTitle);
  let output = "";
  let cursor = 0;
  let changed = 0;
  for (const link of extractLinks(text)) {
    if (titleKey(link.target) !== wanted) {
      continue;
    }
    output += text.slice(cursor, link.start);
    output += renderLink(newTitle, link.heading, link.alias);
    cursor = link.end;
    changed += 1;
  }
  return [output + text.slice(cursor), changed];
}

export type LinkRecord = { targetKey: string; targetTitle: string; linkCount: number };

export function linkRecords(body: string): LinkRecord[] {
  const grouped = new Map<string, LinkRecord>();
  for (const link of extractLinks(body)) {
    const key = titleKey(link.target);
    const known = grouped.get(key);
    if (known === undefined) {
      grouped.set(key, { targetKey: key, targetTitle: link.target, linkCount: 1 });
    } else {
      known.linkCount += 1;
    }
  }
  return [...grouped.values()].sort((a, b) => (a.targetKey < b.targetKey ? -1 : 1));
}
