import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchVaultImage, savePastedImage } from "@/modules/notes/imageApi";

const commands = vi.hoisted(() => ({
  savePastedImage: vi.fn(),
  readVaultImage: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

describe("notes image api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("saves a pasted image for a note and returns the markdown", async () => {
    const pasted = { path: "attachments/pasted-1.png", markdown: "![](attachments/pasted-1.png)" };
    commands.savePastedImage.mockResolvedValue({ status: "ok", data: pasted });

    await expect(savePastedImage("n1", [1, 2, 3])).resolves.toEqual(pasted);
    expect(commands.savePastedImage).toHaveBeenCalledWith({ noteId: "n1", data: [1, 2, 3] });
  });

  it("reads an image from the vault", async () => {
    const image = { mimeType: "image/png", data: [1, 2] };
    commands.readVaultImage.mockResolvedValue({ status: "ok", data: image });

    await expect(fetchVaultImage("attachments/a.png")).resolves.toEqual(image);
    expect(commands.readVaultImage).toHaveBeenCalledWith("attachments/a.png");
  });

  it("throws the command error", async () => {
    const error = { code: "validation", message: "too large" };
    commands.savePastedImage.mockResolvedValue({ status: "error", error });

    await expect(savePastedImage("n1", [1])).rejects.toEqual(error);
  });
});
