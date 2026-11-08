import { describe, expect, it } from "vitest";
import { resolveLanguage } from "@/i18n/resolveLanguage";

describe("resolveLanguage", () => {
  it.each([
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["pt", "pt-BR"],
    ["PT-br", "pt-BR"],
    ["en-US", "en"],
    ["en", "en"],
    ["fr-FR", "en"],
    ["", "en"],
  ] as const)("maps %s to %s", (tag, expected) => {
    expect(resolveLanguage(tag)).toBe(expected);
  });
});
