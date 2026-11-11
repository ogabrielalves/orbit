import type { Project } from "@/bindings";
import type { Seed } from "./state";

export const onboardedSeed: Seed = {
  settings: { language: "en", vaultPath: "/home/me/orbit", userName: "Gabriel" },
};

export function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "seed-p1",
    name: "Website 2.0",
    description: "Redesign of the marketing site",
    icon: null,
    color: "orbit",
    status: "active",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}
