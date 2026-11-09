import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "@/components/organisms/Drawer";

function renderDrawer(props: Partial<ComponentProps<typeof Drawer>> = {}) {
  const onClose = vi.fn();
  render(
    <Drawer isOpen onClose={onClose} title="Task details" closeLabel="Close" {...props}>
      <p>Body content</p>
    </Drawer>,
  );
  return { onClose };
}

describe("Drawer", () => {
  it("renders nothing while closed", () => {
    render(
      <Drawer isOpen={false} onClose={() => undefined} title="Task details" closeLabel="Close">
        <p>Body content</p>
      </Drawer>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders an accessible dialog named by its title with the content inside", () => {
    renderDrawer();

    expect(screen.getByRole("dialog", { name: "Task details" })).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("shows the header actions next to the close button", () => {
    renderDrawer({ headerActions: <button type="button">Actions</button> });

    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("asks to close from the close button", async () => {
    const { onClose } = renderDrawer();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks to close with Escape", async () => {
    const { onClose } = renderDrawer();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to an inline editor marked with data-escape-scope", async () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Task details" closeLabel="Close">
        <input aria-label="Inline editor" data-escape-scope="" />
      </Drawer>,
    );

    await userEvent.click(screen.getByRole("textbox", { name: "Inline editor" }));
    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Close" }).focus();
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the focus inside while open", async () => {
    renderDrawer();

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });
});
