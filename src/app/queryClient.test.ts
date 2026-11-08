import { MutationObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/app/queryClient";
import { i18next } from "@/i18n";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: toastError } }));

async function runFailingMutation(error: unknown) {
  const queryClient = createQueryClient();
  const observer = new MutationObserver(queryClient, {
    mutationFn: () => Promise.reject(error),
  });
  await observer.mutate().catch(() => undefined);
}

describe("createQueryClient", () => {
  beforeEach(async () => {
    toastError.mockClear();
    await i18next.changeLanguage("en");
  });

  it("shows a translated toast when a mutation fails with an AppError", async () => {
    await runFailingMutation({ code: "NOT_FOUND", message: "task not found" });
    expect(toastError).toHaveBeenCalledWith("The item was not found. It may have been removed.");
  });

  it("follows the active language", async () => {
    await i18next.changeLanguage("pt-BR");
    await runFailingMutation({ code: "CONFLICT", message: "changed" });
    expect(toastError).toHaveBeenCalledWith(
      "O item foi alterado em outro lugar. Recarregue e tente novamente.",
    );
  });

  it("shows a translated toast for an internal error without leaking its details", async () => {
    await runFailingMutation({ code: "INTERNAL", message: "stack trace here" });

    expect(toastError).toHaveBeenCalledWith("An internal error occurred. Please try again.");
  });

  it("translates the internal error in Portuguese", async () => {
    await i18next.changeLanguage("pt-BR");
    await runFailingMutation({ code: "INTERNAL", message: "x" });

    expect(toastError).toHaveBeenCalledWith("Ocorreu um erro interno. Tente novamente.");
  });

  it("shows the generic message for unknown failures", async () => {
    await runFailingMutation(new Error("boom"));
    expect(toastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });

  it("limits query retries to one", () => {
    const options = createQueryClient().getDefaultOptions().queries;
    expect(options?.retry).toBe(1);
  });
});
