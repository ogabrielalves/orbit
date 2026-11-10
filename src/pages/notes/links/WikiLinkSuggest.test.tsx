import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteSummary } from "@/bindings";
import { i18next } from "@/i18n";
import { useWikiLinkSuggest } from "@/pages/notes/links/useWikiLinkSuggest";
import { WikiLinkSuggest } from "@/pages/notes/links/WikiLinkSuggest";

function note(title: string): NoteSummary {
  return {
    id: title,
    path: `${title}.md`,
    title,
    createdAt: "2026-11-08T10:00:00Z",
    modifiedAt: "2026-11-08T10:00:00Z",
  };
}

const notes = [note("Plan A"), note("Plan B"), note("Ideas")];

function key(name: string) {
  return new KeyboardEvent("keydown", { key: name });
}

describe("WikiLinkSuggest", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("lists the suggestions and selects one on click", async () => {
    const onSelect = vi.fn();
    render(
      <WikiLinkSuggest items={notes} activeIndex={1} left={10} bottom={20} onSelect={onSelect} />,
    );

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Plan B/ })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("option", { name: /Ideas/ }));

    expect(onSelect).toHaveBeenCalledWith("Ideas");
  });

  it("shows an empty message when nothing matches", () => {
    render(<WikiLinkSuggest items={[]} activeIndex={0} left={0} bottom={0} onSelect={vi.fn()} />);

    expect(screen.getByText("No notes found")).toBeInTheDocument();
  });
});

describe("useWikiLinkSuggest", () => {
  it("filters by the query and ignores keys while closed", () => {
    const { result } = renderHook(() => useWikiLinkSuggest(notes));

    expect(result.current.onKeyDown(key("Enter"))).toBe(false);

    act(() => result.current.onSuggest({ query: "plan", left: 0, bottom: 0, apply: vi.fn() }));

    expect(result.current.items.map((item) => item.title)).toEqual(["Plan A", "Plan B"]);
  });

  it("moves with the arrow keys and applies the active suggestion on Enter", () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useWikiLinkSuggest(notes));
    act(() => result.current.onSuggest({ query: "plan", left: 0, bottom: 0, apply }));

    act(() => {
      expect(result.current.onKeyDown(key("ArrowDown"))).toBe(true);
    });
    expect(result.current.activeIndex).toBe(1);

    act(() => {
      expect(result.current.onKeyDown(key("ArrowDown"))).toBe(true);
    });
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      expect(result.current.onKeyDown(key("ArrowUp"))).toBe(true);
    });
    act(() => {
      expect(result.current.onKeyDown(key("Enter"))).toBe(true);
    });

    expect(apply).toHaveBeenCalledWith("Plan B");
  });

  it("closes on Escape and lets Enter through when nothing matches", () => {
    const { result } = renderHook(() => useWikiLinkSuggest(notes));
    act(() => result.current.onSuggest({ query: "zzz", left: 0, bottom: 0, apply: vi.fn() }));

    expect(result.current.onKeyDown(key("Enter"))).toBe(false);

    act(() => {
      expect(result.current.onKeyDown(key("Escape"))).toBe(true);
    });
    expect(result.current.suggest).toBeNull();
  });
});
