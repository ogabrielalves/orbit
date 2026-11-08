import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/atoms/Badge";

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge>High</Badge>);

    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it.each([
    ["danger", "bg-danger-soft"],
    ["accent", "bg-accent-soft"],
    ["primary", "bg-primary-soft"],
    ["neutral", "bg-surface-muted"],
    ["success", "bg-success-soft"],
    ["warning", "bg-warning-soft"],
    ["info", "bg-info-soft"],
  ] as const)("uses the %s colors", (tone, expectedClass) => {
    render(<Badge tone={tone}>Label</Badge>);

    expect(screen.getByText("Label")).toHaveClass(expectedClass);
  });

  it("draws a border instead of a fill for the outline tone", () => {
    render(<Badge tone="outline">#frontend</Badge>);

    const badge = screen.getByText("#frontend");

    expect(badge).toHaveClass("border");
    expect(badge).not.toHaveClass("bg-surface-muted");
  });

  it("is square by default and fully rounded as a pill", () => {
    const { rerender } = render(<Badge>Label</Badge>);
    expect(screen.getByText("Label")).toHaveClass("rounded-xs");

    rerender(<Badge shape="pill">Label</Badge>);
    expect(screen.getByText("Label")).toHaveClass("rounded-full");
  });

  it("shows a decorative dot only when asked", () => {
    const { container, rerender } = render(<Badge>Label</Badge>);
    expect(container.querySelector("[aria-hidden='true']")).not.toBeInTheDocument();

    rerender(<Badge hasDot>Label</Badge>);
    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });
});
