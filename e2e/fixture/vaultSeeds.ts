import { onboardedSeed } from "./seeds";
import type { Seed } from "./state";

export const emptyVaultSeed: Seed = { ...onboardedSeed };

export const notesSeed: Seed = {
  ...onboardedSeed,
  folders: ["Ideas", "Work", "Work/Plans"],
  notes: [
    { id: "seed-n1", path: "Welcome.md", body: "\n# Welcome\n\nA first note.\n" },
    { id: "seed-n2", path: "Ideas/Brainstorm.md", body: "\n# Brainstorm\n\nIdeas go here.\n" },
    { id: "seed-n3", path: "Work/Roadmap.md", body: "\n# Roadmap\n\nThe plan for Q4.\n" },
    { id: "seed-n4", path: "Work/Plans/Budget.md", body: "\n# Budget\n\nNumbers.\n" },
  ],
};

export const wikilinkSeed: Seed = {
  ...onboardedSeed,
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
      body: "\n# Delta\n\nMentions [[beta]] in lower case.\n",
      createdAt: "2026-11-02T10:03:00.000Z",
    },
  ],
};
