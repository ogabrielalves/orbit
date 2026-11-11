import { boardSeed, projectFixture } from "./seeds";
import type { Seed } from "./state";

export const favoritesSeed: Seed = {
  ...boardSeed,
  projects: [
    projectFixture({ id: "seed-p1", name: "Website 2.0" }),
    projectFixture({
      id: "seed-p2",
      name: "Thesis",
      description: "Writing the thesis",
      updatedAt: "2026-11-01T09:00:00.000Z",
    }),
  ],
  folders: ["Ideas", "Work"],
  notes: [
    {
      id: "seed-alpha",
      path: "Alpha.md",
      body: "\n# Alpha\n\nSee [[Beta]] and [[Ghost note]].\n",
      createdAt: "2026-11-02T10:00:00.000Z",
    },
    {
      id: "seed-beta",
      path: "Ideas/Beta.md",
      body: "\n# Beta\n\nBack to [[Alpha]].\n",
      createdAt: "2026-11-02T10:01:00.000Z",
    },
  ],
};

export const graphSeed: Seed = {
  ...favoritesSeed,
  folders: [],
  notes: [
    {
      id: "seed-alpha",
      path: "Alpha.md",
      body: "\n# Alpha\n\nSee [[Beta]] and [[Ghost note]].\n",
      createdAt: "2026-11-02T10:00:00.000Z",
    },
    {
      id: "seed-beta",
      path: "Beta.md",
      body: "\n# Beta\n\nBack to [[Alpha]].\n",
      createdAt: "2026-11-02T10:01:00.000Z",
    },
    {
      id: "seed-gamma",
      path: "Gamma.md",
      body: "\n# Gamma\n\nStandalone.\n",
      createdAt: "2026-11-02T10:02:00.000Z",
    },
    {
      id: "seed-delta",
      path: "Delta.md",
      body: "\n# Delta\n\nMentions [[Beta]].\n",
      createdAt: "2026-11-02T10:03:00.000Z",
    },
  ],
};
