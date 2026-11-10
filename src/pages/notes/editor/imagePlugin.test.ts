import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { getMarkdown } from "@milkdown/kit/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ImageOptions, imageOptionsCtx, imagePlugins } from "@/pages/notes/editor/imagePlugin";

const fetchVaultImage = vi.hoisted(() => vi.fn());

vi.mock("@/modules/notes/imageApi", () => ({ fetchVaultImage }));

const editors: Editor[] = [];

async function createEditor(markdown: string, options?: Partial<ImageOptions>) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      ctx.set(imageOptionsCtx.key, {
        saveImage: async () => null,
        unavailableLabel: "Image unavailable",
        ...options,
      });
    })
    .use(commonmark)
    .use(imagePlugins);
  await editor.create();
  editors.push(editor);
  return { editor, root };
}

async function destroyAll() {
  for (const editor of editors.splice(0)) {
    await editor.destroy();
  }
  document.body.innerHTML = "";
}

function pasteEvent(files: File[]) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { files, getData: () => "", types: ["Files"], items: [] },
  });
  return event;
}

describe("image plugin", () => {
  const createObjectUrl = vi.fn();
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    fetchVaultImage.mockReset();
    createObjectUrl.mockReset().mockReturnValue("blob:orbit-1");
    revokeObjectUrl.mockReset();
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
  });

  afterEach(destroyAll);

  it("shows vault images through an object URL built from the bytes", async () => {
    fetchVaultImage.mockResolvedValue({ mimeType: "image/png", data: [1, 2, 3] });

    const { root } = await createEditor("![logo](../attachments/pasted-1.png)");

    await vi.waitFor(() =>
      expect(root.querySelector("img.orbit-image")?.getAttribute("src")).toBe("blob:orbit-1"),
    );
    expect(fetchVaultImage).toHaveBeenCalledWith("attachments/pasted-1.png");
    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
    expect(root.querySelector("img.orbit-image")?.getAttribute("alt")).toBe("logo");
  });

  it("revokes the object URL when the editor is destroyed", async () => {
    fetchVaultImage.mockResolvedValue({ mimeType: "image/png", data: [1] });
    const { root } = await createEditor("![](attachments/pasted-1.png)");
    await vi.waitFor(() =>
      expect(root.querySelector("img.orbit-image")?.getAttribute("src")).toBe("blob:orbit-1"),
    );

    await destroyAll();

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:orbit-1");
  });

  it("uses external sources directly without reading the vault", async () => {
    const { root } = await createEditor("![](https://example.com/a.png)");

    expect(root.querySelector("img.orbit-image")?.getAttribute("src")).toBe(
      "https://example.com/a.png",
    );
    expect(fetchVaultImage).not.toHaveBeenCalled();
  });

  it("marks the image as unavailable when the vault read fails", async () => {
    fetchVaultImage.mockRejectedValue({ code: "not_found" });

    const { root } = await createEditor("![](attachments/missing.png)");

    await vi.waitFor(() =>
      expect(
        root.querySelector("img.orbit-image")?.classList.contains("orbit-image-unavailable"),
      ).toBe(true),
    );
    expect(root.querySelector("img.orbit-image")?.getAttribute("title")).toBe("Image unavailable");
  });

  it("keeps the markdown of the image when serializing", async () => {
    fetchVaultImage.mockResolvedValue({ mimeType: "image/png", data: [1] });

    const { editor } = await createEditor("![logo](../attachments/pasted-1.png)");

    expect(editor.action(getMarkdown()).trim()).toBe("![logo](../attachments/pasted-1.png)");
  });

  it("saves a pasted image and inserts the markdown it returns", async () => {
    fetchVaultImage.mockResolvedValue({ mimeType: "image/png", data: [1] });
    const saveImage = vi.fn().mockResolvedValue("![](attachments/pasted-9.png)");
    const { editor, root } = await createEditor("text", { saveImage });
    const file = new File([new Uint8Array([9, 8, 7])], "shot.png", { type: "image/png" });

    root.querySelector(".ProseMirror")?.dispatchEvent(pasteEvent([file]));

    await vi.waitFor(() => expect(saveImage).toHaveBeenCalledWith([9, 8, 7]));
    await vi.waitFor(() =>
      expect(editor.action(getMarkdown())).toContain("![](attachments/pasted-9.png)"),
    );
  });

  it("ignores pasted files that are not images", async () => {
    const saveImage = vi.fn();
    const { root } = await createEditor("text", { saveImage });
    const file = new File(["x"], "notes.txt", { type: "text/plain" });

    root.querySelector(".ProseMirror")?.dispatchEvent(pasteEvent([file]));
    await Promise.resolve();

    expect(saveImage).not.toHaveBeenCalled();
  });

  it("inserts nothing when saving the image fails", async () => {
    const saveImage = vi.fn().mockResolvedValue(null);
    const { editor, root } = await createEditor("text", { saveImage });
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });

    root.querySelector(".ProseMirror")?.dispatchEvent(pasteEvent([file]));

    await vi.waitFor(() => expect(saveImage).toHaveBeenCalled());
    expect(editor.action(getMarkdown()).trim()).toBe("text");
  });
});
