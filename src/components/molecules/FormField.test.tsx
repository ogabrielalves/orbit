import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Input } from "@/components/atoms/Input";
import { Textarea } from "@/components/atoms/Textarea";
import { FormField } from "@/components/molecules/FormField";
import { i18next } from "@/i18n";

describe("FormField", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("associates the label with the control", () => {
    render(<FormField label="Project name">{(props) => <Input {...props} />}</FormField>);

    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("works with any control, such as a textarea", () => {
    render(<FormField label="Description">{(props) => <Textarea {...props} />}</FormField>);

    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
  });

  it("marks the control as optional with a translated hint", () => {
    render(
      <FormField label="Description" isOptional>
        {(props) => <Textarea {...props} />}
      </FormField>,
    );

    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("follows the active language for the optional hint", async () => {
    await i18next.changeLanguage("pt-BR");
    render(
      <FormField label="Descrição" isOptional>
        {(props) => <Textarea {...props} />}
      </FormField>,
    );

    expect(screen.getByText("(opcional)")).toBeInTheDocument();
  });

  it("shows the error, flags the control and describes it by the message", () => {
    render(
      <FormField label="Project name" error="The name needs at least 3 characters.">
        {(props) => <Input {...props} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Project name");
    const message = screen.getByText("The name needs at least 3 characters.");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("The name needs at least 3 characters.");
    expect(message).toHaveClass("text-danger-fg");
  });

  it("shows a hint without flagging an error", () => {
    render(
      <FormField label="Project name" hint="Shown in the sidebar">
        {(props) => <Input {...props} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Project name");

    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveAccessibleDescription("Shown in the sidebar");
  });

  it("prefers the error over the hint", () => {
    render(
      <FormField label="Project name" hint="Shown in the sidebar" error="Required">
        {(props) => <Input {...props} />}
      </FormField>,
    );

    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByText("Shown in the sidebar")).not.toBeInTheDocument();
  });

  it("has no description without an error or a hint", () => {
    render(<FormField label="Project name">{(props) => <Input {...props} />}</FormField>);

    expect(screen.getByLabelText("Project name")).not.toHaveAttribute("aria-describedby");
  });

  it("gives every field its own id", () => {
    render(
      <>
        <FormField label="First">{(props) => <Input {...props} />}</FormField>
        <FormField label="Second">{(props) => <Input {...props} />}</FormField>
      </>,
    );

    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });
});
