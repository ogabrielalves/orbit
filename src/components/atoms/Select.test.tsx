import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Select } from "@/components/atoms/Select";

function renderSelect(props: { onChange?: () => void; disabled?: boolean } = {}) {
  return render(
    <Select aria-label="Sort by" defaultValue="updated" {...props}>
      <option value="updated">Recently updated</option>
      <option value="name">Name</option>
    </Select>,
  );
}

describe("Select", () => {
  it("renders the options with the default selected", () => {
    renderSelect();

    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("updated");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("calls onChange when another option is chosen", async () => {
    const onChange = vi.fn();
    renderSelect({ onChange });

    await userEvent.selectOptions(screen.getByRole("combobox"), "name");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox")).toHaveValue("name");
  });

  it("cannot be changed when disabled", () => {
    renderSelect({ disabled: true });

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
