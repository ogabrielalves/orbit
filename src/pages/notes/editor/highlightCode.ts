import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

const MARKUP_PATTERN = /<span class="([^"]+)">|<\/span>|([^<]+)/g;
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, definition);
}

export type HighlightRange = {
  from: number;
  to: number;
  className: string;
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:lt|gt|amp|quot|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
}

export function highlightCode(code: string, language: string | null | undefined): HighlightRange[] {
  const name = (language ?? "").trim().toLowerCase();
  const isKnownLanguage = name !== "" && hljs.getLanguage(name) !== undefined;
  if (!isKnownLanguage) {
    return [];
  }

  const { value } = hljs.highlight(code, { language: name, ignoreIllegals: true });
  const ranges: HighlightRange[] = [];
  const open: { from: number; className: string }[] = [];
  let offset = 0;

  for (const match of value.matchAll(MARKUP_PATTERN)) {
    const [, className, text] = match;
    const isOpening = className !== undefined;
    const isText = text !== undefined;

    if (isOpening) {
      open.push({ from: offset, className });
    } else if (isText) {
      offset += decodeEntities(text).length;
    } else {
      const span = open.pop();
      const hasContent = span !== undefined && offset > span.from;
      if (hasContent) {
        ranges.push({ from: span.from, to: offset, className: span.className });
      }
    }
  }

  return ranges;
}
