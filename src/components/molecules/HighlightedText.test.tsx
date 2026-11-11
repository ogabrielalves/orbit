import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "@/components/molecules/HighlightedText";

describe("HighlightedText", () => {
  it("marks only the matching parts", () => {
    render(
      <p>
        <HighlightedText
          parts={[
            { text: "Weekly ", isMatch: false },
            { text: "plan", isMatch: true },
            { text: " review", isMatch: false },
          ]}
        />
      </p>,
    );

    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("plan");
    expect(screen.getByRole("paragraph")).toHaveTextContent("Weekly plan review");
  });

  it("renders markup inside the text as plain text", () => {
    const { container } = render(
      <p>
        <HighlightedText
          parts={[
            { text: "<img src=x onerror=alert(1)>", isMatch: false },
            { text: "<b>bold</b>", isMatch: true },
          ]}
        />
      </p>,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)><b>bold</b>");
    expect(container.querySelector("mark")).toHaveTextContent("<b>bold</b>");
  });
});
