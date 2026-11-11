import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import GridIcon from "@/assets/icons/linha/grade.svg?react";
import ListIcon from "@/assets/icons/linha/lista.svg?react";
import { FavoriteButton } from "@/components/molecules/FavoriteButton";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import { TagChip } from "@/components/molecules/TagChip";
import { Sidebar } from "@/components/organisms/Sidebar";
import { i18next } from "@/i18n";
import { EditorToolbar } from "@/pages/notes/editor/EditorToolbar";
import { renderWithRouter } from "@/test/renderWithRouter";
import { findTooltipText } from "@/test/tooltip";

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, "platform", { value: platform, configurable: true });
}

describe("tooltips on icon-only controls", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    setPlatform("Win32");
  });

  it("explains the favorite star and keeps one accessible name", async () => {
    render(
      <FavoriteButton isFavorite={false} label="Add to favorites" onToggle={() => undefined} />,
    );
    const button = screen.getByRole("button", { name: "Add to favorites" });

    await userEvent.hover(button);

    expect(await findTooltipText()).toContain("Add to favorites");
    expect(button).not.toHaveAttribute("title");
    expect(button).toHaveAccessibleDescription("");
  });

  it("explains the icon-only options of a segmented control", async () => {
    render(
      <SegmentedControl
        label="View mode"
        isIconOnly
        value="grid"
        onChange={() => undefined}
        options={[
          { value: "grid", label: "Grid view", icon: GridIcon },
          { value: "list", label: "List view", icon: ListIcon },
        ]}
      />,
    );

    await userEvent.hover(
      screen.getByRole("radio", { name: "List view" }).closest("label") as HTMLElement,
    );

    expect(await findTooltipText()).toContain("List view");
    expect(screen.getByRole("radio", { name: "List view" })).toBeInTheDocument();
  });

  it("does not add tooltips to segmented controls that show their text", async () => {
    render(
      <SegmentedControl
        label="Depth"
        value="1"
        onChange={() => undefined}
        options={[
          { value: "1", label: "1 level" },
          { value: "2", label: "2 levels" },
        ]}
      />,
    );

    await userEvent.hover(screen.getByText("2 levels"));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("explains the remove button of a tag", async () => {
    render(
      <TagChip
        name="Urgent"
        color={null}
        removeLabel="Remove tag Urgent"
        onRemove={() => undefined}
      />,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Remove tag Urgent" }));

    expect(await findTooltipText()).toContain("Remove tag Urgent");
  });

  it("shows the sidebar toggle shortcut", async () => {
    renderWithRouter(
      <Sidebar isCollapsed={false} canToggle onToggle={() => undefined} favorites={[]} />,
    );

    await userEvent.hover(await screen.findByRole("button", { name: "Collapse menu" }));

    expect(await findTooltipText()).toContain("Ctrl+\\");
  });

  it("shows the sidebar toggle shortcut the Mac way", async () => {
    setPlatform("MacIntel");
    renderWithRouter(
      <Sidebar isCollapsed={false} canToggle onToggle={() => undefined} favorites={[]} />,
    );

    await userEvent.hover(await screen.findByRole("button", { name: "Collapse menu" }));

    expect(await findTooltipText()).toContain("⌘\\");
  });

  it("names the logo in a tooltip only when the sidebar is collapsed", async () => {
    renderWithRouter(<Sidebar isCollapsed canToggle onToggle={() => undefined} favorites={[]} />);

    await userEvent.hover(await screen.findByRole("link", { name: "ORBIT" }));

    expect(await findTooltipText()).toContain("ORBIT");
  });

  it("shows the formatting shortcuts in the editor toolbar", async () => {
    render(<EditorToolbar editorRef={{ current: null }} />);

    await userEvent.hover(screen.getByRole("button", { name: "Bold" }));
    expect(await findTooltipText()).toContain("Ctrl+B");
  });

  it("explains toolbar buttons without a shortcut too", async () => {
    render(<EditorToolbar editorRef={{ current: null }} />);

    await userEvent.hover(screen.getByRole("button", { name: "Divider" }));

    const text = await findTooltipText();
    expect(text).toContain("Divider");
    expect(text).not.toContain("Ctrl");
  });
});
