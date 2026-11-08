import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@/hooks/useUiStore";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({ isSidebarCollapsed: false });
  });

  it("starts with the sidebar expanded", () => {
    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
  });

  it("toggles the sidebar back and forth", () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);

    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
  });
});
