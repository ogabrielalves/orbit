import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker } from "@/components/molecules/ColorPicker";

const options = [
  { value: "red", label: "Red", color: "rgb(255, 0, 0)" },
  { value: "green", label: "Green", color: "rgb(0, 255, 0)" },
  { value: "blue", label: "Blue", color: "rgb(0, 0, 255)" },
] as const;

function renderPicker(props: { value?: string; onChange?: (value: string) => void } = {}) {
  return render(
    <ColorPicker
      label="Color"
      options={[...options]}
      value={props.value ?? "red"}
      onChange={props.onChange ?? (() => undefined)}
    />,
  );
}

describe("ColorPicker", () => {
  it("offers every option in a labelled group", () => {
    renderPicker();

    expect(screen.getByRole("radiogroup", { name: "Color" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("names each option for assistive technology", () => {
    renderPicker();

    expect(screen.getByRole("radio", { name: "Green" })).toBeInTheDocument();
  });

  it("checks only the selected option", () => {
    renderPicker({ value: "blue" });

    expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Red" })).not.toBeChecked();
  });

  it("calls onChange with the value of the clicked option", async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    await userEvent.click(screen.getByRole("radio", { name: "Green" }));

    expect(onChange).toHaveBeenCalledWith("green");
  });

  it("paints each swatch with its color", () => {
    renderPicker();

    expect(screen.getByTitle("Blue").style.backgroundColor).toBe("rgb(0, 0, 255)");
  });

  it("moves the selection with the arrow keys", async () => {
    const onChange = vi.fn();
    renderPicker({ onChange });

    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("green");
  });

  it("keeps separate groups independent", () => {
    render(
      <>
        <ColorPicker label="First" options={[...options]} value="red" onChange={() => undefined} />
        <ColorPicker
          label="Second"
          options={[...options]}
          value="blue"
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
