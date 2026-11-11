import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createHandlers } from "../fixture/handlers";
import { pendingCommands } from "../fixture/pendingCommands";
import { createInitialState } from "../fixture/state";

const bindingsPath = fileURLToPath(new URL("../../src/bindings.ts", import.meta.url));

function bindingCommands(): string[] {
  const source = readFileSync(bindingsPath, "utf8");
  return [...source.matchAll(/^\t(\w+): .*__TAURI_INVOKE\("/gm)].map((match) => match[1] as string);
}

function implementedCommands(): string[] {
  const clock = { nextId: (prefix: string) => `${prefix}0`, now: () => "2026-11-11T00:00:00.000Z" };
  return Object.keys(createHandlers(createInitialState({}), clock));
}

test.describe("in-memory backend coverage of the bindings", () => {
  test("finds the commands declared in bindings.ts", () => {
    expect(bindingCommands().length).toBeGreaterThan(50);
  });

  test("classifies every command as implemented or pending", () => {
    const implemented = new Set(implementedCommands());
    const pending = new Set<string>(pendingCommands);

    const unclassified = bindingCommands().filter(
      (name) => !implemented.has(name) && !pending.has(name),
    );

    expect(unclassified, "new commands: implement them or add them to pendingCommands").toEqual([]);
  });

  test("never lists a command as both implemented and pending", () => {
    const implemented = new Set(implementedCommands());

    const both = pendingCommands.filter((name) => implemented.has(name));

    expect(both, "implemented commands must leave pendingCommands").toEqual([]);
  });

  test("never references a command that no longer exists in the bindings", () => {
    const known = new Set(bindingCommands());

    const stale = [...implementedCommands(), ...pendingCommands].filter((name) => !known.has(name));

    expect(stale, "removed commands: drop them from the fixture").toEqual([]);
  });

  test("lists each pending command once", () => {
    expect(new Set(pendingCommands).size).toBe(pendingCommands.length);
  });
});
