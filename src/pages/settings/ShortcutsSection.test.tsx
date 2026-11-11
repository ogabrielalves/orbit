import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { creationShortcuts } from "@/lib/shortcuts";
import { ShortcutsSection } from "@/pages/settings/ShortcutsSection";

function renderSection() {
  render(
    <I18nextProvider i18n={i18next}>
      <ShortcutsSection />
    </I18nextProvider>,
  );
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("ShortcutsSection", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the four creation shortcuts from the shared definition", () => {
    const items = renderSection().map((item) => item.textContent);

    expect(items).toContain("New projectCtrlShiftP");
    expect(items).toContain("New taskCtrlShiftT");
    expect(items).toContain("New boardCtrlShiftB");
    expect(items).toContain("New noteCtrlShiftN");
    expect(Object.keys(creationShortcuts)).toHaveLength(4);
  });

  it("shows the command key on macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");

    const items = renderSection().map((item) => item.textContent);

    expect(items).toContain("New project⌘ShiftP");
    expect(items).toContain("Open search⌘K");
  });

  it("translates the creation shortcuts to pt-BR", async () => {
    await i18next.changeLanguage("pt-BR");

    const items = renderSection().map((item) => item.textContent);

    expect(items).toContain("Novo projetoCtrlShiftP");
    expect(items).toContain("Nova tarefaCtrlShiftT");
    expect(items).toContain("Novo quadroCtrlShiftB");
    expect(items).toContain("Nova notaCtrlShiftN");
  });
});
