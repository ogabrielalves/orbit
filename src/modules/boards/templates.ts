import type { TFunction } from "i18next";
import type { NewColumn } from "@/bindings";

export type BoardTemplateId = "sprint" | "personal" | "blank";

export type BoardTemplate = {
  id: BoardTemplateId;
  label: string;
  description: string;
  columns: NewColumn[];
};

export const DEFAULT_BOARD_TEMPLATE_ID: BoardTemplateId = "sprint";

export function buildBoardTemplates(t: TFunction): BoardTemplate[] {
  return [
    {
      id: "sprint",
      label: t("boards.templates.sprint.label"),
      description: t("boards.templates.sprint.description"),
      columns: [
        { name: t("boards.templates.columns.backlog"), kind: "todo" },
        { name: t("boards.templates.columns.todo"), kind: "todo" },
        { name: t("boards.templates.columns.inProgress"), kind: "in_progress" },
        { name: t("boards.templates.columns.review"), kind: "in_progress" },
        { name: t("boards.templates.columns.done"), kind: "done" },
      ],
    },
    {
      id: "personal",
      label: t("boards.templates.personal.label"),
      description: t("boards.templates.personal.description"),
      columns: [
        { name: t("boards.templates.columns.todo"), kind: "todo" },
        { name: t("boards.templates.columns.inProgress"), kind: "in_progress" },
        { name: t("boards.templates.columns.done"), kind: "done" },
      ],
    },
    {
      id: "blank",
      label: t("boards.templates.blank.label"),
      description: t("boards.templates.blank.description"),
      columns: [],
    },
  ];
}
