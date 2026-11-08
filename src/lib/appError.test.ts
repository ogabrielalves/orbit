import { describe, expect, it } from "vitest";
import { getErrorMessageKey, isAppError } from "@/lib/appError";

describe("isAppError", () => {
  it("accepts an object with string code and message", () => {
    expect(isAppError({ code: "NOT_FOUND", message: "task not found" })).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    ["NOT_FOUND"],
    [42],
    [{}],
    [{ code: "IO" }],
    [{ code: 1, message: "x" }],
    [new Error("boom")],
  ])("rejects %j", (value) => {
    expect(isAppError(value)).toBe(false);
  });
});

describe("getErrorMessageKey", () => {
  it.each([
    ["NOT_FOUND", "errors.notFound"],
    ["VALIDATION", "errors.validation"],
    ["CONFLICT", "errors.conflict"],
    ["INVALID_MOVE", "errors.invalidMove"],
    ["IO", "errors.io"],
    ["DATABASE", "errors.database"],
  ] as const)("maps %s to %s", (code, expected) => {
    expect(getErrorMessageKey({ code, message: "details" })).toBe(expected);
  });

  it("falls back to unknown for an unrecognized code", () => {
    expect(getErrorMessageKey({ code: "SOMETHING_NEW", message: "x" })).toBe("errors.unknown");
  });

  it("falls back to unknown for a value that is not an AppError", () => {
    expect(getErrorMessageKey(new Error("boom"))).toBe("errors.unknown");
  });

  it("never exposes the raw backend message", () => {
    const key = getErrorMessageKey({ code: "DATABASE", message: "SELECT * FROM secrets" });
    expect(key).not.toContain("SELECT");
  });
});
