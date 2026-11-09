import { beforeEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { buildBoardTemplates } from "@/modules/boards/templates";

function columnsOf(id: string, language: string) {
  const template = buildBoardTemplates(i18next.getFixedT(language)).find((item) => item.id === id);
  return template?.columns;
}

describe("buildBoardTemplates", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("offers sprint first, then personal and blank", () => {
    const ids = buildBoardTemplates(i18next.t).map((template) => template.id);

    expect(ids).toEqual(["sprint", "personal", "blank"]);
  });

  it("gives the sprint template the five canvas columns", () => {
    expect(columnsOf("sprint", "pt-BR")).toEqual([
      { name: "Backlog", kind: "todo" },
      { name: "A fazer", kind: "todo" },
      { name: "Em progresso", kind: "in_progress" },
      { name: "Em revisão", kind: "in_progress" },
      { name: "Concluído", kind: "done" },
    ]);
  });

  it("translates the column names", () => {
    expect(columnsOf("sprint", "en")?.map((column) => column.name)).toEqual([
      "Backlog",
      "To do",
      "In progress",
      "In review",
      "Done",
    ]);
  });

  it("keeps the personal template short and the blank one empty", () => {
    expect(columnsOf("personal", "en")?.map((column) => column.kind)).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
    expect(columnsOf("blank", "en")).toEqual([]);
  });
});
