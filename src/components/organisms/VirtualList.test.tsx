import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIST_PRIMARY_ATTRIBUTE, VirtualList } from "@/components/organisms/VirtualList";
import { setVirtualLayout } from "@/test/virtualLayout";

type Row = { id: string };

const ITEM_HEIGHT = 50;
const VIEWPORT_HEIGHT = 200;
const rows: Row[] = Array.from({ length: 300 }, (_, index) => ({ id: `r${index}` }));
const primaryProps = { [LIST_PRIMARY_ATTRIBUTE]: "" };

function scrollerOf(): HTMLElement {
  const scroller = document.querySelector<HTMLElement>("[data-virtual-scroll]");
  if (scroller === null) {
    throw new Error("scroller not found");
  }
  return scroller;
}

function scrollTo(offset: number) {
  const scroller = scrollerOf();
  scroller.scrollTop = offset;
  act(() => {
    fireEvent.scroll(scroller);
  });
}

function renderedIds(): string[] {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

function renderList(props: { pinnedKey?: string | null; scrollToKey?: string | null } = {}) {
  return render(
    <VirtualList
      items={rows}
      getKey={(row) => row.id}
      estimateSize={ITEM_HEIGHT}
      label="Rows"
      scrollClassName="overflow-y-auto"
      renderItem={(row) => (
        <button type="button" {...primaryProps}>
          {row.id}
        </button>
      )}
      {...props}
    />,
  );
}

describe("VirtualList", () => {
  beforeEach(() => {
    setVirtualLayout({ viewportHeight: VIEWPORT_HEIGHT, itemHeight: ITEM_HEIGHT });
    Element.prototype.scrollTo = function scrollToElement(
      this: Element,
      options?: ScrollToOptions | number,
    ) {
      const top = typeof options === "number" ? options : (options?.top ?? 0);
      this.scrollTop = top;
      fireEvent.scroll(this);
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollTo");
  });

  it("renders only the rows around the viewport", () => {
    renderList();

    const ids = renderedIds();

    expect(ids[0]).toBe("r0");
    expect(ids.length).toBeLessThan(30);
    expect(ids).not.toContain("r150");
  });

  it("reserves the room of every row so the scrollbar keeps its size", () => {
    renderList();

    expect(screen.getByRole("list", { name: "Rows" })).toHaveStyle({
      height: `${rows.length * ITEM_HEIGHT}px`,
    });
  });

  it("tells assistive technology the real size and position of each row", () => {
    renderList();

    const first = screen.getAllByRole("listitem")[0];

    expect(first).toHaveAttribute("aria-setsize", "300");
    expect(first).toHaveAttribute("aria-posinset", "1");
  });

  it("renders the next rows when the list scrolls", () => {
    renderList();

    scrollTo(100 * ITEM_HEIGHT);

    const ids = renderedIds();
    expect(ids).toContain("r100");
    expect(ids).not.toContain("r0");
  });

  it("keeps the pinned row mounted while it is far out of the window", () => {
    renderList({ pinnedKey: "r2" });

    scrollTo(200 * ITEM_HEIGHT);

    const ids = renderedIds();
    expect(ids).toContain("r2");
    expect(ids).toContain("r200");
  });

  it("scrolls the requested row into view", async () => {
    renderList({ scrollToKey: "r150" });

    await waitFor(() => expect(renderedIds()).toContain("r150"));
  });

  it("moves the focus with the arrow keys", async () => {
    renderList();
    const list = within(screen.getByRole("list", { name: "Rows" }));
    list.getByRole("button", { name: "r0" }).focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "r1" })).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "r0" })).toHaveFocus();
  });

  it("does not move past the first and last rows", async () => {
    renderList();
    screen.getByRole("button", { name: "r0" }).focus();

    await userEvent.keyboard("{ArrowUp}");

    expect(screen.getByRole("button", { name: "r0" })).toHaveFocus();
  });

  it("jumps to the last row with End and back with Home, rendering rows that were unmounted", async () => {
    renderList();
    screen.getByRole("button", { name: "r0" }).focus();

    await userEvent.keyboard("{End}");
    expect(await screen.findByRole("button", { name: "r299" })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(await screen.findByRole("button", { name: "r0" })).toHaveFocus();
  });

  it("ignores the arrow keys when the focus is not on a row's primary control", async () => {
    render(
      <VirtualList
        items={rows}
        getKey={(row) => row.id}
        estimateSize={ITEM_HEIGHT}
        label="Rows"
        scrollClassName="overflow-y-auto"
        renderItem={(row) => <button type="button">{row.id}</button>}
      />,
    );
    screen.getByRole("button", { name: "r0" }).focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("button", { name: "r0" })).toHaveFocus();
  });

  it("renders nothing for an empty list without failing", () => {
    render(
      <VirtualList
        items={[]}
        getKey={(row: Row) => row.id}
        estimateSize={ITEM_HEIGHT}
        label="Rows"
        scrollClassName="overflow-y-auto"
        renderItem={(row) => <span>{row.id}</span>}
      />,
    );

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
