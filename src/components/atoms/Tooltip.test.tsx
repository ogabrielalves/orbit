import * as RadixTooltip from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip } from "@/components/atoms/Tooltip";

function renderTooltip(props: { isDisabled?: boolean; shortcut?: string } = {}) {
  return render(
    <RadixTooltip.Provider delayDuration={0}>
      <Tooltip label="Collapse menu" {...props}>
        <button type="button">Trigger</button>
      </Tooltip>
    </RadixTooltip.Provider>,
  );
}

describe("Tooltip", () => {
  it("shows the label when the trigger is hovered", async () => {
    renderTooltip();

    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Collapse menu");
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
