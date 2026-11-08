import { describe, expect, it } from "vitest";
import {
  defaultProjectColorKey,
  projectColorKeys,
  resolveProjectColor,
} from "@/modules/projects/colors";

describe("resolveProjectColor", () => {
  it.each(projectColorKeys)("maps the %s palette key to its design token", (key) => {
    expect(resolveProjectColor(key)).toBe(`var(--color-project-${key})`);
  });

  it("uses the default color when the project has none", () => {
    expect(resolveProjectColor(null)).toBe(`var(--color-project-${defaultProjectColorKey})`);
  });

  it("keeps a hex color stored by an older version", () => {
    expect(resolveProjectColor("#123456")).toBe("#123456");
  });

  it("falls back to the default for an unknown value", () => {
    expect(resolveProjectColor("magenta-ish")).toBe(
      `var(--color-project-${defaultProjectColorKey})`,
    );
  });

  it("does not let arbitrary text become a css value", () => {
    expect(resolveProjectColor("red; background: url(x)")).toBe(
      `var(--color-project-${defaultProjectColorKey})`,
    );
  });

  it("offers eight palette colors with the default among them", () => {
    expect(projectColorKeys).toHaveLength(8);
    expect(projectColorKeys).toContain(defaultProjectColorKey);
  });
});
