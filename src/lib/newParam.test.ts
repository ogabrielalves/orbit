import { describe, expect, it } from "vitest";
import { parseNewParam } from "@/lib/newParam";

describe("parseNewParam", () => {
  it("accepts the number and the string 1", () => {
    expect(parseNewParam(1)).toBe(1);
    expect(parseNewParam("1")).toBe(1);
  });

  it("ignores anything else", () => {
    expect(parseNewParam(undefined)).toBeUndefined();
    expect(parseNewParam(0)).toBeUndefined();
    expect(parseNewParam("true")).toBeUndefined();
    expect(parseNewParam(true)).toBeUndefined();
  });
});
