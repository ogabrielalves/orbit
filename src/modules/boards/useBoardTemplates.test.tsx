import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { useBoardTemplates } from "@/modules/boards/useBoardTemplates";

describe("useBoardTemplates", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("returns the templates in the current language and follows language changes", async () => {
    const { result } = renderHook(() => useBoardTemplates());
    expect(result.current[0]?.columns[1]?.name).toBe("To do");

    await act(() => i18next.changeLanguage("pt-BR"));

    expect(result.current[0]?.columns[1]?.name).toBe("A fazer");
  });
});
