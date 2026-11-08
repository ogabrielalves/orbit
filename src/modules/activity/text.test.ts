import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityAction, ActivityEntry, EntityType } from "@/bindings";
import { i18next } from "@/i18n";
import { formatActivityMessage, getActivityName, getActivityTarget } from "@/modules/activity/text";

function createEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "a1",
    entityType: "project",
    entityId: "p1",
    action: "created",
    changes: null,
    createdAt: "2026-11-08T10:00:00Z",
    ...overrides,
  };
}

function message(entry: ActivityEntry): string {
  return formatActivityMessage(i18next.t, entry);
}

describe("getActivityName", () => {
  it("reads the name a created project was given", () => {
    const entry = createEntry({ changes: { name: { from: null, to: "ORBIT" } } });

    expect(getActivityName(entry)).toBe("ORBIT");
  });

  it("reads the name a deleted project had", () => {
    const entry = createEntry({
      action: "deleted",
      changes: { name: { from: "ORBIT", to: null } },
    });

    expect(getActivityName(entry)).toBe("ORBIT");
  });

  it("prefers the new name when a rename is logged", () => {
    const entry = createEntry({
      action: "updated",
      changes: { name: { from: "Old", to: "New" } },
    });

    expect(getActivityName(entry)).toBe("New");
  });

  it.each([
    ["has no changes", null],
    ["changed other fields only", { status: { from: "active", to: "paused" } }],
    ["has an empty name", { name: { from: null, to: "   " } }],
    ["has no name on either side", { name: { from: null, to: null } }],
  ])("is null when the entry %s", (_label, changes) => {
    expect(getActivityName(createEntry({ changes }))).toBeNull();
  });
});

describe("getActivityTarget", () => {
  it("points to the project of a project entry", () => {
    expect(getActivityTarget(createEntry({ entityId: "p9", action: "updated" }))).toEqual({
      kind: "project",
      projectId: "p9",
    });
  });

  it("does not point to a project that was deleted", () => {
    expect(getActivityTarget(createEntry({ action: "deleted" }))).toBeNull();
  });

  it.each(["board", "column", "task", "note", "folder"] as const)(
    "has no destination yet for a %s",
    (entityType) => {
      expect(getActivityTarget(createEntry({ entityType }))).toBeNull();
    },
  );
});

describe("formatActivityMessage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("names the project when the name is known", () => {
    const entry = createEntry({ changes: { name: { from: null, to: "ORBIT" } } });

    expect(message(entry)).toBe("Project “ORBIT” created");
  });

  it("omits the name when it is not known", () => {
    expect(message(createEntry({ action: "archived" }))).toBe("Project archived");
  });

  it("does not describe who did it, since there is a single user", () => {
    expect(message(createEntry())).not.toMatch(/you|by /i);
  });

  it("describes every action in English", () => {
    const actions: ActivityAction[] = [
      "created",
      "updated",
      "deleted",
      "archived",
      "restored",
      "moved",
      "completed",
      "reopened",
      "duplicated",
    ];

    expect(actions.map((action) => message(createEntry({ action, entityType: "task" })))).toEqual([
      "Task created",
      "Task updated",
      "Task deleted",
      "Task archived",
      "Task restored",
      "Task moved",
      "Task completed",
      "Task reopened",
      "Task duplicated",
    ]);
  });

  describe("in Portuguese", () => {
    beforeEach(async () => {
      await i18next.changeLanguage("pt-BR");
    });

    it("agrees the action with a masculine entity", () => {
      const entry = createEntry({ changes: { name: { from: null, to: "ORBIT" } } });

      expect(message(entry)).toBe("Projeto “ORBIT” criado");
    });

    it("agrees the action with a feminine entity", () => {
      expect(message(createEntry({ entityType: "task", action: "completed" }))).toBe(
        "Tarefa concluída",
      );
    });

    it.each([
      ["project", "Projeto excluído"],
      ["board", "Quadro excluído"],
      ["column", "Coluna excluída"],
      ["task", "Tarefa excluída"],
      ["checklist_item", "Item do checklist excluído"],
      ["comment", "Comentário excluído"],
      ["tag", "Tag excluída"],
      ["attachment", "Anexo excluído"],
      ["note", "Anotação excluída"],
      ["folder", "Pasta excluída"],
    ] as [EntityType, string][])("describes a deleted %s as %s", (entityType, expected) => {
      expect(message(createEntry({ entityType, action: "deleted" }))).toBe(expected);
    });
  });
});
