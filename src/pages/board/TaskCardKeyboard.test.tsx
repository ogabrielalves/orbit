import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { TaskCard } from "@/pages/board/TaskCard";
import { createTaskFixture } from "@/test/taskFixture";

function renderCard(
  props: { onOpen?: () => void; isDragging?: boolean; onDragKeyDown?: () => void } = {},
) {
  const { onDragKeyDown, ...cardProps } = props;
  render(
    <ul>
      <TaskCard
        task={createTaskFixture({ title: "Write the spec" })}
        dragProps={onDragKeyDown === undefined ? undefined : { onKeyDown: onDragKeyDown }}
        {...cardProps}
      />
    </ul>,
  );
  return screen.getByRole("listitem");
}

describe("TaskCard keyboard", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("opens the task with Enter and cancels the default action of the key", () => {
    const onOpen = vi.fn();
    const card = renderCard({ onOpen });

    const wasNotPrevented = fireEvent.keyDown(card, { key: "Enter" });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(wasNotPrevented).toBe(false);
  });

  it("does not open the task with other keys and leaves them alone", () => {
    const onOpen = vi.fn();
    const card = renderCard({ onOpen });

    const spaceWasNotPrevented = fireEvent.keyDown(card, { key: " " });
    const tabWasNotPrevented = fireEvent.keyDown(card, { key: "Tab" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(spaceWasNotPrevented).toBe(true);
    expect(tabWasNotPrevented).toBe(true);
  });

  it("ignores an Enter that comes from a child element", () => {
    const onOpen = vi.fn();
    const card = renderCard({ onOpen });
    const child = card.querySelector("span") as HTMLElement;

    const wasNotPrevented = fireEvent.keyDown(child, { key: "Enter" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(wasNotPrevented).toBe(true);
  });

  it("does not open the task while it is being dragged", () => {
    const onOpen = vi.fn();
    const card = renderCard({ onOpen, isDragging: true });

    const wasNotPrevented = fireEvent.keyDown(card, { key: "Enter" });

    expect(onOpen).not.toHaveBeenCalled();
    expect(wasNotPrevented).toBe(true);
  });

  it("does nothing when the card cannot be opened", () => {
    const card = renderCard();

    const wasNotPrevented = fireEvent.keyDown(card, { key: "Enter" });

    expect(wasNotPrevented).toBe(true);
  });

  it("still forwards every key to the drag handler first", () => {
    const onDragKeyDown = vi.fn();
    const onOpen = vi.fn();
    const card = renderCard({ onOpen, onDragKeyDown });

    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "Enter" });

    expect(onDragKeyDown).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the task with a click as before", () => {
    const onOpen = vi.fn();
    const card = renderCard({ onOpen });

    fireEvent.click(card);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
