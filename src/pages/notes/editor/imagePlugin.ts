import { imageSchema } from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $ctx, $prose, $view, insert } from "@milkdown/kit/utils";
import { fetchVaultImage } from "@/modules/notes/imageApi";
import { toVaultImagePath } from "@/pages/notes/images/vaultImagePath";

const IMAGE_MIME_PREFIX = "image/";

export type ImageOptions = {
  saveImage: (data: number[]) => Promise<string | null>;
  unavailableLabel: string;
};

export const imageOptionsCtx = $ctx<ImageOptions, "imageOptions">(
  { saveImage: async () => null, unavailableLabel: "" },
  "imageOptions",
);

function createImageElement(unavailableLabel: string) {
  const image = document.createElement("img");
  image.className = "orbit-image";
  image.addEventListener("error", () => {
    image.classList.add("orbit-image-unavailable");
    image.title = unavailableLabel;
  });
  return image;
}

export const imageView = $view(imageSchema.node, (ctx) => (initialNode) => {
  const { unavailableLabel } = ctx.get(imageOptionsCtx.key);
  const dom = createImageElement(unavailableLabel);
  let objectUrl: string | null = null;
  let loadId = 0;

  function releaseObjectUrl() {
    const previousUrl = objectUrl;
    objectUrl = null;
    const hasPreviousUrl = previousUrl !== null;
    if (hasPreviousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  }

  async function load(source: string) {
    loadId += 1;
    const currentLoad = loadId;
    dom.classList.remove("orbit-image-unavailable");
    dom.removeAttribute("title");
    const vaultPath = toVaultImagePath(source);
    const isVaultImage = vaultPath !== null;
    if (!isVaultImage) {
      releaseObjectUrl();
      dom.src = source;
      return;
    }

    try {
      const image = await fetchVaultImage(vaultPath);
      const isStale = currentLoad !== loadId;
      if (isStale) {
        return;
      }
      releaseObjectUrl();
      const blob = new Blob([new Uint8Array(image.data)], { type: image.mimeType });
      objectUrl = URL.createObjectURL(blob);
      dom.src = objectUrl;
    } catch {
      const isStale = currentLoad !== loadId;
      if (!isStale) {
        dom.classList.add("orbit-image-unavailable");
        dom.title = unavailableLabel;
      }
    }
  }

  function applyNode(node: typeof initialNode) {
    dom.alt = (node.attrs.alt as string) ?? "";
    void load(node.attrs.src as string);
  }

  applyNode(initialNode);
  let currentSource = initialNode.attrs.src as string;

  return {
    dom,
    update: (node) => {
      const isImage = node.type === initialNode.type;
      if (!isImage) {
        return false;
      }
      const nextSource = node.attrs.src as string;
      const hasSourceChanged = nextSource !== currentSource;
      dom.alt = (node.attrs.alt as string) ?? "";
      if (hasSourceChanged) {
        currentSource = nextSource;
        void load(nextSource);
      }
      return true;
    },
    destroy: () => {
      loadId += 1;
      releaseObjectUrl();
    },
  };
});

function pickImageFiles(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith(IMAGE_MIME_PREFIX));
}

export const imageProse = $prose((ctx) => {
  async function insertFiles(view: EditorView, files: File[]) {
    const { saveImage } = ctx.get(imageOptionsCtx.key);
    for (const file of files) {
      const data = Array.from(new Uint8Array(await file.arrayBuffer()));
      const markdown = await saveImage(data);
      const hasMarkdown = markdown !== null;
      if (hasMarkdown && view.dom.isConnected) {
        insert(markdown, true)(ctx);
      }
    }
  }

  return new Plugin({
    key: new PluginKey("orbit-image-upload"),
    props: {
      handlePaste: (view, event) => {
        const files = pickImageFiles(event.clipboardData?.files);
        const hasImages = files.length > 0;
        if (!hasImages) {
          return false;
        }
        event.preventDefault();
        void insertFiles(view, files);
        return true;
      },
      handleDrop: (view, event, _slice, isMoved) => {
        const files = pickImageFiles(event.dataTransfer?.files);
        const hasImages = files.length > 0 && !isMoved;
        if (!hasImages) {
          return false;
        }
        event.preventDefault();
        const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const hasTarget = target !== null;
        if (hasTarget) {
          const selection = TextSelection.near(view.state.doc.resolve(target.pos));
          view.dispatch(view.state.tr.setSelection(selection));
        }
        void insertFiles(view, files);
        return true;
      },
    },
  });
});

export const imagePlugins = [imageOptionsCtx, imageView, imageProse].flat();
