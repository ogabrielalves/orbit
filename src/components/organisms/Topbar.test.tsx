import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Topbar } from "@/components/organisms/Topbar";

describe("Topbar", () => {
  it("marks the last breadcrumb item as the current page", () => {
    render(<Topbar breadcrumb={["Projects", "Website"]} />);

    expect(screen.getByText("Website")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Projects")).not.toHaveAttribute("aria-current");
  });

  it("renders actions when provided", () => {
    render(<Topbar breadcrumb={["Backlog"]} actions={<button type="button">Create</button>} />);

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("renders no actions area by default", () => {
    render(<Topbar breadcrumb={["Backlog"]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
