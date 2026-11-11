import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryStatus } from "@/components/molecules/QueryStatus";
import { i18next } from "@/i18n";

type Props = Partial<Parameters<typeof QueryStatus>[0]>;

function renderStatus(props: Props = {}) {
  const onRetry = vi.fn();
  render(
    <I18nextProvider i18n={i18next}>
      <QueryStatus
        isPending={false}
        isError={false}
        errorTitle="Could not load"
        onRetry={onRetry}
        {...props}
      />
    </I18nextProvider>,
  );
  return onRetry;
}

describe("QueryStatus", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("renders nothing once the data is ready", () => {
    const { container } = render(<div />);
    renderStatus();

    expect(container.firstChild).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces the loading state with skeleton rows", () => {
    renderStatus({ isPending: true, rows: 2 });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelectorAll("[aria-hidden='true']")).toHaveLength(2);
  });

  it("uses a single skeleton row by default", () => {
    renderStatus({ isPending: true });

    expect(screen.getByRole("status").querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
  });

  it("shows a short message with a retry button", async () => {
    const onRetry = renderStatus({ isError: true });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("prefers the error over the loading state", () => {
    renderStatus({ isPending: true, isError: true });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
