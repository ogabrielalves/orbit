import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Kbd } from "@/components/atoms/Kbd";

describe("Kbd", () => {
  it("renders the key inside a kbd element", () => {
    render(<Kbd>Ctrl</Kbd>);

    expect(screen.getByText("Ctrl").tagName).toBe("KBD");
  });

  it("is a bordered chip by default", () => {
    render(<Kbd>K</Kbd>);

    const key = screen.getByText("K");
    expect(key).toHaveClass("border");
    expect(key).toHaveClass("bg-surface-muted");
    expect(key).toHaveClass("text-micro");
  });

  it("has a stronger variant for lists of shortcuts", () => {
    render(<Kbd variant="strong">K</Kbd>);

    const key = screen.getByText("K");
    expect(key).toHaveClass("border-border-strong");
    expect(key).toHaveClass("text-caption");
  });

  it("has an inverse variant for dark surfaces without a chip", () => {
    render(<Kbd variant="inverse">K</Kbd>);

    const key = screen.getByText("K");
    expect(key).toHaveClass("text-fg-on-inverse-muted");
    expect(key).not.toHaveClass("border");
  });

  it("has a plain variant for menus without a chip", () => {
    render(<Kbd variant="plain">F2</Kbd>);

    const key = screen.getByText("F2");
    expect(key).toHaveClass("text-fg-muted");
    expect(key).not.toHaveClass("border");
  });

  it("passes other attributes through, such as aria-hidden", () => {
    render(<Kbd aria-hidden="true">K</Kbd>);

    expect(screen.getByText("K")).toHaveAttribute("aria-hidden", "true");
  });

  it("can be filled by its parent, as Trans does with its components", () => {
    render(<p>Press {<Kbd />}</p>);

    expect(document.querySelector("kbd")).toBeInTheDocument();
  });
});
