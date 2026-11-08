import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "@/components/atoms/Skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts custom sizing classes", () => {
    const { container } = render(<Skeleton className="h-8 w-8" />);

    expect(container.firstElementChild).toHaveClass("h-8", "w-8");
  });
});
