import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

const tokens = new Map<string, string>(
  [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((match) => [
    match[1] ?? "",
    match[2] ?? "",
  ]),
);

function tokenRatio(foreground: string, background: string): number {
  const foregroundHex = tokens.get(foreground);
  const backgroundHex = tokens.get(background);
  if (foregroundHex === undefined || backgroundHex === undefined) {
    throw new Error(`unknown token in ${foreground} on ${background}`);
  }
  return contrastRatio(foregroundHex, backgroundHex);
}

const TEXT_MINIMUM = 4.5;
const NON_TEXT_MINIMUM = 3;

const textPairs: [string, string][] = [
  ...["surface", "canvas", "surface-muted", "surface-column", "primary-soft"].flatMap(
    (background): [string, string][] => [
      ["fg", background],
      ["fg-secondary", background],
      ["fg-muted", background],
    ],
  ),
  ["primary-fg", "primary-soft"],
  ["primary-fg", "surface"],
  ["fg-on-primary", "primary"],
  ["fg-on-primary", "primary-hover"],
  ["fg-on-primary", "danger-solid"],
  ["success-fg", "success-soft"],
  ["success-fg", "surface"],
  ["warning-fg", "warning-soft"],
  ["danger-fg", "danger-soft"],
  ["danger-fg", "surface"],
  ["info-fg", "info-soft"],
  ["accent-fg", "accent-soft"],
  ["fg-on-inverse", "surface-inverse"],
  ["fg-on-inverse-muted", "surface-inverse"],
];

const nonTextPairs: [string, string][] = [
  ["primary", "surface"],
  ["primary", "primary-soft"],
];

describe("token contrast", () => {
  it("reads the colors from tokens.css", () => {
    expect(tokens.get("fg")).toBe("#12141c");
    expect(tokens.size).toBeGreaterThan(30);
  });

  it.each(textPairs)("keeps %s readable on %s (AA text, 4.5:1)", (foreground, background) => {
    expect(tokenRatio(foreground, background)).toBeGreaterThanOrEqual(TEXT_MINIMUM);
  });

  it.each(nonTextPairs)("keeps %s visible on %s (3:1)", (foreground, background) => {
    expect(tokenRatio(foreground, background)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM);
  });
});
