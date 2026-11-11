import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

describe("backlog cards", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    vi.mocked(commands.listProjects).mockResolvedValue({ status: "ok", data: [] });
    vi.mocked(commands.listBacklog).mockResolvedValue({
      status: "ok",
      data: [
        {
          task: createTaskFixture({
            id: "t1",
            title: "Plan the trip",
            boardId: null,
            columnId: null,
          }),
          projectName: "Life",
          tags: [],
          subtaskCount: 0,
          subtasksDone: 0,
          checklistCount: 0,
          checklistDone: 0,
        },
      ],
    });
  });

  it("lets the browser skip the layout of cards that are far off screen", async () => {
    renderApp("/backlog");

    const card = (await screen.findByRole("button", { name: "Plan the trip" })).closest("li");

    expect(card).toHaveClass("[content-visibility:auto]");
    expect(card?.className).toContain("[contain-intrinsic-size:auto_");
  });
});
