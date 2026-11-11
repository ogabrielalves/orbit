import { describe, expect, it } from "vitest";
import type { SearchHit } from "@/bindings";
import { groupSearchResults, hitText } from "@/modules/search/results";

function hit(entityId: string): SearchHit {
  return {
    entityId,
    title: [{ text: entityId, isMatch: false }],
    snippet: [],
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
  };
}

describe("search results", () => {
  it("returns no groups before the first response", () => {
    expect(groupSearchResults(undefined)).toEqual([]);
  });

  it("keeps the category order and drops empty categories", () => {
    const groups = groupSearchResults({
      projects: [],
      boards: [hit("b1")],
      tasks: [hit("t1")],
      notes: [],
      folders: [hit("f1")],
    });

    expect(groups.map((group) => group.category)).toEqual(["boards", "tasks", "folders"]);
    expect(groups[0]?.hits).toEqual([hit("b1")]);
  });

  it("joins text parts into plain text", () => {
    expect(
      hitText([
        { text: "Weekly ", isMatch: false },
        { text: "plan", isMatch: true },
      ]),
    ).toBe("Weekly plan");
  });
});
