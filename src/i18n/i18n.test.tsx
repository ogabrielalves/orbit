import { render, screen } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";

function Greeting() {
  const { t } = useTranslation();
  return <p>{t("greeting.morning")}</p>;
}

describe("i18n", () => {
  afterEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders the text of the active language", async () => {
    await i18next.changeLanguage("pt-BR");
    render(
      <I18nextProvider i18n={i18next}>
        <Greeting />
      </I18nextProvider>,
    );
    expect(screen.getByText("Bom dia")).toBeInTheDocument();
  });

  it("switches language at runtime", async () => {
    await i18next.changeLanguage("en");
    render(
      <I18nextProvider i18n={i18next}>
        <Greeting />
      </I18nextProvider>,
    );
    expect(screen.getByText("Good morning")).toBeInTheDocument();
  });
});
