import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { MarkdownEditor } from "@/pages/notes/editor/MarkdownEditor";

describe("MarkdownEditor", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders the Markdown as formatted content", async () => {
    render(<MarkdownEditor initialValue={"# Hello\n\nSome **bold** text"} onChange={vi.fn()} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("offers the formatting toolbar", async () => {
    render(<MarkdownEditor initialValue="text" onChange={vi.fn()} />);

    const toolbar = await screen.findByRole("toolbar", { name: "Formatting" });

    for (const name of ["Heading 1", "Bold", "Italic", "Strikethrough", "Bulleted list", "Table"]) {
      expect(toolbar).toContainElement(screen.getByRole("button", { name }));
    }
  });

  it("renders GFM tables and task lists", async () => {
    render(
      <MarkdownEditor
        initialValue={"| a | b |\n| - | - |\n| 1 | 2 |\n\n- [ ] todo\n"}
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
  });
});
