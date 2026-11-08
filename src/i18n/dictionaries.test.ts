import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { ptBR } from "@/i18n/pt-BR";

function flattenKeys(node: object, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    const isNested = typeof value === "object" && value !== null;
    return isNested ? flattenKeys(value, path) : [path];
  });
}

function flattenValues(node: object): string[] {
  return Object.values(node).flatMap((value) => {
    const isNested = typeof value === "object" && value !== null;
    return isNested ? flattenValues(value) : [String(value)];
  });
}

describe("dictionaries", () => {
  it("expose the same keys in pt-BR and en", () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(ptBR).sort());
  });

  it.each([
    ["pt-BR", ptBR],
    ["en", en],
  ] as const)("has no empty text in %s", (_name, dictionary) => {
    const hasEmptyText = flattenValues(dictionary).some((text) => text.trim() === "");
    expect(hasEmptyText).toBe(false);
  });
});
