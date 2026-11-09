import { describe, expect, it } from "vitest";
import { formatFileSize } from "@/lib/format";

describe("formatFileSize", () => {
  it("shows plain bytes without decimals", () => {
    expect(formatFileSize(0, "en")).toBe("0 B");
    expect(formatFileSize(512, "en")).toBe("512 B");
    expect(formatFileSize(1023, "en")).toBe("1,023 B");
  });

  it("scales to KB, MB and GB with one decimal at most", () => {
    expect(formatFileSize(1024, "en")).toBe("1 KB");
    expect(formatFileSize(1536, "en")).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024, "en")).toBe("5 MB");
    expect(formatFileSize(3.25 * 1024 * 1024 * 1024, "en")).toBe("3.3 GB");
  });

  it("does not go past GB", () => {
    expect(formatFileSize(2048 * 1024 * 1024 * 1024, "en")).toBe("2,048 GB");
  });

  it("uses the decimal separator of the locale", () => {
    expect(formatFileSize(1536, "pt-BR")).toBe("1,5 KB");
  });
});
