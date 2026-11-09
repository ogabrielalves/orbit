import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { TaskCard } from "@/pages/board/TaskCard";
import { createTaskFixture } from "@/test/taskFixture";

function renderCard(overrides: Parameters<typeof createTaskFixture>[0] = {}) {
  render(
    <ul>
      <TaskCard task={createTaskFixture(overrides)} />
    </ul>,
  );
}

describe("TaskCard", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 8, 10, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the title and the priority", () => {
    renderCard({ title: "Write the spec", priority: "urgent" });

    expect(screen.getByRole("listitem")).toHaveTextContent("Write the spec");
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("shows the priority in the current language", async () => {
    await i18next.changeLanguage("pt-BR");
    renderCard({ priority: "high" });

    expect(screen.getByText("Alta")).toBeInTheDocument();
  });

  it("omits the due date when the task has none", () => {
    renderCard({ dueDate: null });

    expect(screen.queryByText(/Due/)).not.toBeInTheDocument();
  });

  it("shows an upcoming due date without flagging it", () => {
    renderCard({ dueDate: "2026-11-09" });

    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText("Tomorrow").parentElement).not.toHaveClass("text-danger-fg");
  });

  it("flags an overdue task that is still open", () => {
    renderCard({ dueDate: "2026-11-05" });

    const due = screen.getByText(/Thu, Nov 5/);

    expect(due).toHaveClass("text-danger-fg");
    expect(due).toHaveTextContent("overdue");
  });

  it("does not flag a task due today as overdue", () => {
    renderCard({ dueDate: "2026-11-08" });

    expect(screen.getByText("Today").parentElement).not.toHaveClass("text-danger-fg");
  });

  it("does not flag a completed task as overdue", () => {
    renderCard({ dueDate: "2026-11-05", completedAt: "2026-11-04T10:00:00Z" });

    expect(screen.getByText(/Thu, Nov 5/)).not.toHaveClass("text-danger-fg");
  });
});
