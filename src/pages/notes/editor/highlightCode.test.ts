import { describe, expect, it } from "vitest";
import { highlightCode } from "@/pages/notes/editor/highlightCode";

function slices(code: string, language: string) {
  return highlightCode(code, language).map((range) => ({
    text: code.slice(range.from, range.to),
    className: range.className,
  }));
}

describe("highlightCode", () => {
  it("marks keywords, strings and numbers with their token classes", () => {
    const tokens = slices('const answer = "yes"; let n = 42;', "javascript");

    expect(tokens).toContainEqual({ text: "const", className: "hljs-keyword" });
    expect(tokens).toContainEqual({ text: '"yes"', className: "hljs-string" });
    expect(tokens).toContainEqual({ text: "42", className: "hljs-number" });
  });

  it("keeps offsets aligned when the code has characters that HTML escapes", () => {
    const tokens = slices('if (a < b && c > d) { return "x&y"; }', "javascript");

    expect(tokens).toContainEqual({ text: "return", className: "hljs-keyword" });
    expect(tokens).toContainEqual({ text: '"x&y"', className: "hljs-string" });
  });

  it("resolves common aliases", () => {
    expect(slices("const a = 1", "js").length).toBeGreaterThan(0);
    expect(slices("const a: number = 1", "ts").length).toBeGreaterThan(0);
    expect(slices("echo hi # note", "sh").length).toBeGreaterThan(0);
    expect(slices("def f(): pass", "py").length).toBeGreaterThan(0);
  });

  it("is case-insensitive about the language name", () => {
    expect(slices("const a = 1", "JavaScript").length).toBeGreaterThan(0);
  });

  it("returns nothing for blocks without a known language", () => {
    expect(highlightCode("const a = 1", "")).toEqual([]);
    expect(highlightCode("const a = 1", null)).toEqual([]);
    expect(highlightCode("const a = 1", undefined)).toEqual([]);
    expect(highlightCode("const a = 1", "klingon")).toEqual([]);
  });

  it("handles multi-line code and comments", () => {
    const code = "// first\nfn main() {}\n";

    expect(slices(code, "rust")).toContainEqual({ text: "// first", className: "hljs-comment" });
  });
});
