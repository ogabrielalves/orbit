import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/molecules/PageHeader";

describe("PageHeader", () => {
  it("renders the title as the page heading", () => {
    render(<PageHeader title="Backlog" />);

    expect(screen.getByRole("heading", { level: 1, name: "Backlog" })).toBeInTheDocument();
  });

  it("renders the subtitle and actions when provided", () => {
    render(
      <PageHeader
        title="Backlog"
        subtitle="18 items"
        actions={<button type="button">New</button>}
      />,
    );

    expect(screen.getByText("18 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("uses the heading size by default", () => {
    render(<PageHeader title="Backlog" />);

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveClass("text-heading-1");
    expect(heading).not.toHaveClass("text-title");
  });

  it("uses the larger title size and wider gap in the display variant", () => {
    render(<PageHeader variant="display" title="Good morning" subtitle="Sunday" />);

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveClass("text-title");
    expect(heading).not.toHaveClass("text-heading-1");
    expect(heading.parentElement).toHaveClass("gap-1.5");
  });
});
