import { describe, expect, it, vi } from "vitest";
import { flushCloseGuards, hasPendingCloseGuards, registerCloseGuard } from "@/lib/closeGuards";

describe("closeGuards", () => {
  it("allows closing when nothing is registered", async () => {
    expect(hasPendingCloseGuards()).toBe(false);
    await expect(flushCloseGuards()).resolves.toBe(true);
  });

  it("does not flush guards that have nothing pending", async () => {
    const flush = vi.fn().mockResolvedValue(true);
    const unregister = registerCloseGuard({ hasPending: () => false, flush });

    await expect(flushCloseGuards()).resolves.toBe(true);

    expect(flush).not.toHaveBeenCalled();
    unregister();
  });

  it("flushes pending guards and reports success when all of them save", async () => {
    const first = vi.fn().mockResolvedValue(true);
    const second = vi.fn().mockResolvedValue(true);
    const unregisterFirst = registerCloseGuard({ hasPending: () => true, flush: first });
    const unregisterSecond = registerCloseGuard({ hasPending: () => true, flush: second });

    expect(hasPendingCloseGuards()).toBe(true);
    await expect(flushCloseGuards()).resolves.toBe(true);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unregisterFirst();
    unregisterSecond();
  });

  it("reports failure when a guard cannot save or throws", async () => {
    const unregisterFailing = registerCloseGuard({
      hasPending: () => true,
      flush: async () => false,
    });
    await expect(flushCloseGuards()).resolves.toBe(false);
    unregisterFailing();

    const unregisterThrowing = registerCloseGuard({
      hasPending: () => true,
      flush: async () => {
        throw new Error("boom");
      },
    });
    await expect(flushCloseGuards()).resolves.toBe(false);
    unregisterThrowing();
  });

  it("stops tracking a guard once it is unregistered", () => {
    const unregister = registerCloseGuard({ hasPending: () => true, flush: async () => true });
    unregister();

    expect(hasPendingCloseGuards()).toBe(false);
  });
});
