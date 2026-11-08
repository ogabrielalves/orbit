import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "@/components/molecules/ErrorState";
import { i18next } from "@/i18n";

describe("ErrorState", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("announces the error to assistive technology", () => {
    render(<ErrorState title="Could not load the board" description="Check your files" />);

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Could not load the board");
    expect(alert).toHaveTextContent("Check your files");
  });

  it("offers a translated retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Could not load the board" onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("follows the active language", async () => {
    await i18next.changeLanguage("pt-BR");
    render(<ErrorState title="Erro" onRetry={() => undefined} />);

    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("has no retry button without onRetry", () => {
    render(<ErrorState title="Could not load the board" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
