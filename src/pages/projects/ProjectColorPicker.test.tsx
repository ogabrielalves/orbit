import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { projectColorKeys } from "@/modules/projects/colors";
import { ProjectColorPicker } from "@/pages/projects/ProjectColorPicker";

describe("ProjectColorPicker", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("offers every palette color in a labelled group", () => {
    render(<ProjectColorPicker label="Color" value="orbit" onChange={() => undefined} />);

    expect(screen.getByRole("radiogroup", { name: "Color" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(projectColorKeys.length);
  });

  it("names each color for assistive technology", () => {
    render(<ProjectColorPicker label="Color" value="orbit" onChange={() => undefined} />);

    expect(screen.getByRole("radio", { name: "Lagoon" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Graphite" })).toBeInTheDocument();
  });

  it("checks only the selected color", () => {
    render(<ProjectColorPicker label="Color" value="violet" onChange={() => undefined} />);

    expect(screen.getByRole("radio", { name: "Violet" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Orbit" })).not.toBeChecked();
  });

  it("calls onChange with the palette key of the clicked color", async () => {
    const onChange = vi.fn();
    render(<ProjectColorPicker label="Color" value="orbit" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: "Ember" }));

    expect(onChange).toHaveBeenCalledWith("ember");
  });

  it("paints each swatch with its design token", () => {
    render(<ProjectColorPicker label="Color" value="orbit" onChange={() => undefined} />);

    const swatch = screen.getByTitle("Moss");

    expect(swatch.style.backgroundColor).toBe("var(--color-project-moss)");
  });

  it("follows the active language for the color names", async () => {
    await i18next.changeLanguage("pt-BR");
    render(<ProjectColorPicker label="Cor" value="orbit" onChange={() => undefined} />);

    expect(screen.getByRole("radio", { name: "Lagoa" })).toBeInTheDocument();
  });
});
