import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/bindings";
import {
  fetchAttachments,
  importAttachment,
  openAttachment,
  removeAttachment,
} from "@/modules/attachments/api";

const commands = vi.hoisted(() => ({
  listAttachments: vi.fn(),
  importAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  openAttachment: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const attachment: Attachment = {
  id: "f1",
  taskId: "t1",
  fileName: "spec.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  createdAt: "2026-11-08T10:00:00Z",
};

describe("attachments api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: attachment });
    }
  });

  it("lists the attachments of a task", async () => {
    commands.listAttachments.mockResolvedValue({ status: "ok", data: [attachment] });

    await expect(fetchAttachments("t1")).resolves.toEqual([attachment]);

    expect(commands.listAttachments).toHaveBeenCalledWith("t1");
  });

  it("imports a file by its path", async () => {
    await expect(importAttachment("t1", "C:\\docs\\spec.pdf")).resolves.toEqual(attachment);

    expect(commands.importAttachment).toHaveBeenCalledWith("t1", "C:\\docs\\spec.pdf");
  });

  it("removes and opens an attachment", async () => {
    commands.removeAttachment.mockResolvedValue({ status: "ok", data: null });
    commands.openAttachment.mockResolvedValue({ status: "ok", data: null });

    await expect(removeAttachment("f1")).resolves.toBeNull();
    await expect(openAttachment("f1")).resolves.toBeNull();

    expect(commands.removeAttachment).toHaveBeenCalledWith("f1");
    expect(commands.openAttachment).toHaveBeenCalledWith("f1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "VALIDATION", message: "file too large" };
    commands.importAttachment.mockResolvedValue({ status: "error", error: payload });

    await expect(importAttachment("t1", "x")).rejects.toBe(payload);
  });
});
