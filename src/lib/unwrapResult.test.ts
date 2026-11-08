import { describe, expect, it } from "vitest";
import { unwrapResult } from "@/lib/unwrapResult";

describe("unwrapResult", () => {
  it("returns the data of a successful result", () => {
    expect(unwrapResult({ status: "ok", data: { id: 1 } })).toEqual({ id: 1 });
  });

  it("throws the error payload of a failed result", () => {
    const payload = { code: "NOT_FOUND", message: "task not found" };

    expect(() => unwrapResult({ status: "error", error: payload })).toThrow();

    try {
      unwrapResult({ status: "error", error: payload });
    } catch (thrown) {
      expect(thrown).toBe(payload);
    }
  });
});
