import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GridIcon from "@/assets/icons/linha/grade.svg?react";
import ListIcon from "@/assets/icons/linha/lista.svg?react";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
] as const;

describe("SegmentedControl", () => {
  it("renders a labelled radio group with one radio per option", () => {
    render(
      <SegmentedControl
        label="Filter by status"
        options={[...statusOptions]}
        value="all"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("checks only the selected option", () => {
    render(
      <SegmentedControl
        label="Filter by status"
        options={[...statusOptions]}
        value="active"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("radio", { name: "Active" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "All" })).not.toBeChecked();
  });

  it("calls onChange with the clicked value", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Filter by status"
        options={[...statusOptions]}
        value="all"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("radio", { name: "Paused" }));

    expect(onChange).toHaveBeenCalledWith("paused");
  });

  it("does not call onChange when the selected option is clicked again", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Filter by status"
        options={[...statusOptions]}
        value="all"
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("radio", { name: "All" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the selection with the arrow keys", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Filter by status"
        options={[...statusOptions]}
        value="all"
        onChange={onChange}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("active");
  });

  it("keeps an accessible name for icon-only options", () => {
    render(
      <SegmentedControl
        label="View mode"
        variant="bordered"
        isIconOnly
        options={[
          { value: "grid", label: "Grid view", icon: GridIcon },
          { value: "list", label: "List view", icon: ListIcon },
        ]}
        value="grid"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("radio", { name: "Grid view" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "List view" })).toBeInTheDocument();
  });

  it("gives separate groups independent selections", () => {
    render(
      <>
        <SegmentedControl
          label="First"
          options={[...statusOptions]}
          value="all"
          onChange={() => undefined}
        />
        <SegmentedControl
          label="Second"
          options={[...statusOptions]}
          value="paused"
          onChange={() => undefined}
        />
      </>,
    );

    const checked = screen
      .getAllByRole("radio")
      .filter((radio) => (radio as HTMLInputElement).checked);

    expect(checked).toHaveLength(2);
  });
});
