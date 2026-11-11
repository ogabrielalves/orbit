import { waitFor } from "@testing-library/react";

export async function findTooltipText(): Promise<string> {
  return waitFor(() => {
    const content = document.querySelector(".bg-surface-inverse");
    if (content === null) {
      throw new Error("no visible tooltip");
    }
    return content.textContent ?? "";
  });
}
