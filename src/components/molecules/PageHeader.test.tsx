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
});
