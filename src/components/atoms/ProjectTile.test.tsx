import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectTile } from "@/components/atoms/ProjectTile";

describe("ProjectTile", () => {
  it("shows the uppercase initial of the project name", () => {
    render(<ProjectTile name="website 2.0" color="var(--color-project-orbit)" />);

    expect(screen.getByText("W")).toBeInTheDocument();
  });

  it("ignores leading whitespace when picking the initial", () => {
    render(<ProjectTile name="   app" color="var(--color-project-orbit)" />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("is decorative for assistive technology", () => {
    render(<ProjectTile name="App" color="var(--color-project-orbit)" />);

    expect(screen.getByText("A")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the project color for the letter and a tint of it for the background", () => {
    render(<ProjectTile name="App" color="var(--color-project-ember)" />);

    const tile = screen.getByText("A");

    expect(tile.style.color).toBe("var(--color-project-ember)");
    expect(tile.style.backgroundColor).toContain("var(--color-project-ember)");
  });

  it.each([
    ["sm", "size-6"],
    ["md", "size-10"],
    ["lg", "size-14"],
  ] as const)("supports the %s size", (size, expectedClass) => {
    render(<ProjectTile name="App" color="var(--color-project-orbit)" size={size} />);

    expect(screen.getByText("A")).toHaveClass(expectedClass);
  });
});
