import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/molecules/EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No tasks here" />);

    expect(screen.getByRole("heading", { name: "No tasks here" })).toBeInTheDocument();
  });

  it("renders the description and actions when provided", () => {
    render(
      <EmptyState
        title="No tasks here"
        description="Create the first task"
        actions={<button type="button">Create task</button>}
      />,
    );

    expect(screen.getByText("Create the first task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create task" })).toBeInTheDocument();
  });

  it("renders no description or actions by default", () => {
    render(<EmptyState title="No tasks here" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
