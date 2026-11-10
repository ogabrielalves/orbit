import { describe, expect, it } from "vitest";
import { toVaultImagePath } from "@/pages/notes/images/vaultImagePath";

describe("toVaultImagePath", () => {
  it("keeps a vault-relative attachment path", () => {
    expect(toVaultImagePath("attachments/pasted-1.png")).toBe("attachments/pasted-1.png");
  });

  it("drops the relative climb written for notes inside folders", () => {
    expect(toVaultImagePath("../../attachments/pasted-1.png")).toBe("attachments/pasted-1.png");
    expect(toVaultImagePath("./attachments/pasted-1.png")).toBe("attachments/pasted-1.png");
  });

  it("decodes percent-encoded names", () => {
    expect(toVaultImagePath("attachments/my%20image.png")).toBe("attachments/my image.png");
  });

  it("returns null for external and data sources", () => {
    expect(toVaultImagePath("https://example.com/a.png")).toBeNull();
    expect(toVaultImagePath("//example.com/a.png")).toBeNull();
    expect(toVaultImagePath("data:image/png;base64,AAAA")).toBeNull();
  });

  it("returns null for paths outside the attachments folder", () => {
    expect(toVaultImagePath("images/a.png")).toBeNull();
    expect(toVaultImagePath("attachments/sub/a.png")).toBeNull();
    expect(toVaultImagePath("attachments")).toBeNull();
  });
});
