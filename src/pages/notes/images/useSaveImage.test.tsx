import { renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { useSaveImage } from "@/pages/notes/images/useSaveImage";

const savePastedImage = vi.hoisted(() => vi.fn());

vi.mock("@/modules/notes/imageApi", () => ({ savePastedImage }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("useSaveImage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    savePastedImage.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("returns the markdown the backend produced", async () => {
    savePastedImage.mockResolvedValue({
      path: "attachments/a.png",
      markdown: "![](attachments/a.png)",
    });
    const { result } = renderHook(() => useSaveImage("n1"));

    await expect(result.current([1, 2])).resolves.toBe("![](attachments/a.png)");
    expect(savePastedImage).toHaveBeenCalledWith("n1", [1, 2]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports the failure and returns null", async () => {
    savePastedImage.mockRejectedValue({ code: "validation", message: "too large" });
    const { result } = renderHook(() => useSaveImage("n1"));

    await expect(result.current([1])).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Could not insert the image", expect.any(Object));
  });
});
