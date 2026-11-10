import { describe, expect, it } from "vitest";
import type { NoteSummary } from "@/bindings";
import {
  buildWikiLink,
  extractWikiLinkTarget,
  filterNoteSuggestions,
  findWikiLinkAt,
  findWikiLinkTrigger,
} from "@/pages/notes/links/wikiLink";

function note(title: string): NoteSummary {
  return {
    id: title,
    path: `${title}.md`,
    title,
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
  };
}

describe("findWikiLinkTrigger", () => {
  it("detects an open link and returns its query and range", () => {
    expect(findWikiLinkTrigger("see [[Pla")).toEqual({ query: "Pla", from: 4, to: 9 });
  });

  it("detects an empty query right after the brackets", () => {
    expect(findWikiLinkTrigger("[[")).toEqual({ query: "", from: 0, to: 2 });
  });

  it("ignores text without an open link", () => {
    expect(findWikiLinkTrigger("plain text")).toBeNull();
  });

  it("ignores links that were already closed", () => {
    expect(findWikiLinkTrigger("[[Plan]] and more")).toBeNull();
  });

  it("ignores a query that spans lines", () => {
    expect(findWikiLinkTrigger("[[Pla\nn")).toBeNull();
  });
});

describe("filterNoteSuggestions", () => {
  const notes = [note("Roadmap"), note("Plan B"), note("Master plan"), note("Ideas")];

  it("returns everything for an empty query", () => {
    expect(filterNoteSuggestions(notes, "")).toHaveLength(4);
  });

  it("matches case-insensitively and ranks prefix matches first", () => {
    expect(filterNoteSuggestions(notes, "PLAN").map((item) => item.title)).toEqual([
      "Plan B",
      "Master plan",
    ]);
  });

  it("returns nothing when no title matches", () => {
    expect(filterNoteSuggestions(notes, "zzz")).toEqual([]);
  });

  it("caps the number of suggestions", () => {
    const many = Array.from({ length: 20 }, (_, index) => note(`Note ${index}`));

    expect(filterNoteSuggestions(many, "note")).toHaveLength(8);
  });
});

describe("buildWikiLink", () => {
  it("wraps a title in double brackets", () => {
    expect(buildWikiLink("Plan")).toBe("[[Plan]]");
  });
});

describe("extractWikiLinkTarget", () => {
  it("reads the target of a wrapped link", () => {
    expect(extractWikiLinkTarget("[[Plan]]")).toBe("Plan");
  });

  it("drops alias and heading parts", () => {
    expect(extractWikiLinkTarget("[[Plan|alias]]")).toBe("Plan");
    expect(extractWikiLinkTarget("[[Plan#Goals]]")).toBe("Plan");
  });

  it("rejects text that is not a link or has no target", () => {
    expect(extractWikiLinkTarget("Plan")).toBeNull();
    expect(extractWikiLinkTarget("[[ ]]")).toBeNull();
  });
});

describe("findWikiLinkAt", () => {
  const text = "go to [[Plan]] then [[Ideas]] ok";

  it("finds the link under the offset", () => {
    expect(findWikiLinkAt(text, 9)).toBe("Plan");
    expect(findWikiLinkAt(text, 24)).toBe("Ideas");
  });

  it("returns null outside any link", () => {
    expect(findWikiLinkAt(text, 2)).toBeNull();
    expect(findWikiLinkAt(text, 31)).toBeNull();
  });

  it("ignores an unclosed link", () => {
    expect(findWikiLinkAt("a [[Plan", 5)).toBeNull();
  });
});
