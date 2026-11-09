import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagChip } from "@/components/molecules/TagChip";

describe("TagChip", () => {
  it("shows the name", () => {
    render(<TagChip name="Bug" color="ember" />);

    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("has no remove button without a handler", () => {
    render(<TagChip name="Bug" color={null} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("needs both a label and a handler to offer removal", () => {
    render(<TagChip name="Bug" color={null} onRemove={() => undefined} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("removes through a named button", async () => {
    const onRemove = vi.fn();
    render(<TagChip name="Bug" color="lagoon" removeLabel="Remove tag Bug" onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove tag Bug" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("paints the dot with the project color and falls back to the default", () => {
    const { container, rerender } = render(<TagChip name="Bug" color="ember" />);
    const dot = () => container.querySelector("[aria-hidden='true']") as HTMLElement;

    expect(dot().style.backgroundColor).toBe("var(--color-project-ember)");

    rerender(<TagChip name="Bug" color={null} />);

    expect(dot().style.backgroundColor).toBe("var(--color-project-orbit)");
  });
});
