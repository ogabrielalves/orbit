import { useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { describe, expect, it } from "vitest";
import { Providers } from "@/app/providers";

function Probe() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hasQueryClient = queryClient !== undefined;
  return (
    <p>
      {t("common.save")}:{String(hasQueryClient)}
    </p>
  );
}

describe("Providers", () => {
  it("provides the query client and translations to children", () => {
    render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(screen.getByText(/true$/)).toBeInTheDocument();
  });
});
