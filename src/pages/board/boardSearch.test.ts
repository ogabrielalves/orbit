import { describe, expect, it } from "vitest";
import { parseBoardSearch } from "@/pages/board/boardSearch";

describe("parseBoardSearch", () => {
  it("keeps the task id", () => {
    expect(parseBoardSearch({ task: "t1" })).toEqual({ task: "t1" });
  });

  it("drops a missing, empty or non text task", () => {
    expect(parseBoardSearch({})).toEqual({ task: undefined });
    expect(parseBoardSearch({ task: "" })).toEqual({ task: undefined });
    expect(parseBoardSearch({ task: 42 })).toEqual({ task: undefined });
  });
});
