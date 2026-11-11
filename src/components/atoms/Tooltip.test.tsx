import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/atoms/Tooltip";

function renderTooltip(
  props: { isDisabled?: boolean; shortcut?: string; labelsTrigger?: boolean } = {},
) {
  return render(
    <Tooltip label="Collapse menu" {...props}>
      <button type="button">Trigger</button>
    </Tooltip>,
  );
}

describe("Tooltip", () => {
  it("shows the label when the trigger is hovered", async () => {
    renderTooltip();

    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Collapse menu");
  });

  it("shows the label when the trigger gets the keyboard focus", async () => {
    renderTooltip();

    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Trigger" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Collapse menu");
  });

  it("does not open on a focus that did not come from the Tab key", async () => {
    renderTooltip();

    screen.getByRole("button", { name: "Trigger" }).focus();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open when the pointer press gave it the focus", async () => {
    renderTooltip();

    await userEvent.keyboard("{Tab}");
    await userEvent.click(screen.getByRole("button", { name: "Trigger" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("goes away with Escape", async () => {
    renderTooltip();
    await userEvent.tab();
    await screen.findByRole("tooltip");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("goes away when the trigger is pressed", async () => {
    renderTooltip();
    const trigger = screen.getByRole("button", { name: "Trigger" });
    await userEvent.hover(trigger);
    await screen.findByRole("tooltip");

    await userEvent.click(trigger);

    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("works without an outer provider", async () => {
    renderTooltip();

    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
  });

  it("describes the trigger by default", async () => {
    renderTooltip();

    await userEvent.tab();

    const tooltip = await screen.findByRole("tooltip");
    expect(screen.getByRole("button", { name: "Trigger" })).toHaveAttribute(
      "aria-describedby",
      tooltip.id,
    );
  });

  it("does not repeat the name as a description when the label already names the trigger", async () => {
    renderTooltip({ labelsTrigger: true });

    await userEvent.tab();

    await screen.findByRole("tooltip");
    const trigger = screen.getByRole("button", { name: "Trigger" });
    expect(trigger).toHaveAccessibleDescription("");
  });

  it("describes the trigger by its shortcut only when the label already names it", async () => {
    renderTooltip({ labelsTrigger: true, shortcut: "Ctrl+K" });

    await userEvent.tab();

    await screen.findByRole("tooltip");
    expect(screen.getByRole("button", { name: "Trigger" })).toHaveAccessibleDescription("Ctrl+K");
  });

  it("shows the shortcut next to the label", async () => {
    renderTooltip({ shortcut: "Ctrl+K" });

    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ctrl+K");
  });

  it("renders only the child when disabled", async () => {
    renderTooltip({ isDisabled: true });

    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
