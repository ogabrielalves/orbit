import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { getMarkdown } from "@milkdown/kit/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type WikiLinkHandlers,
  wikiLinkHandlersCtx,
  wikiLinkPlugins,
} from "@/pages/notes/editor/wikiLinkPlugin";

const editors: Editor[] = [];

async function createEditor(markdown: string, handlers?: Partial<WikiLinkHandlers>) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
      if (handlers) {
        ctx.set(wikiLinkHandlersCtx.key, {
          onNavigate: () => undefined,
          onSuggest: () => undefined,
          onKeyDown: () => false,
          ...handlers,
        });
      }
    })
    .use(commonmark)
    .use(wikiLinkPlugins);
  await editor.create();
  editors.push(editor);
  return { editor, root };
}

describe("wiki link plugin", () => {
  afterEach(async () => {
    for (const editor of editors.splice(0)) {
      await editor.destroy();
    }
    document.body.innerHTML = "";
  });

  it("renders [[links]] as link elements", async () => {
    const { root } = await createEditor("See [[Plan]] and [[Ideas|alias]] now");

    const links = root.querySelectorAll("[data-wiki-link]");

    expect([...links].map((link) => link.getAttribute("data-wiki-link"))).toEqual([
      "Plan",
      "Ideas|alias",
    ]);
  });

  it("serializes links back without escaping the brackets", async () => {
    const { editor } = await createEditor("See [[Plan]] and [[Ideas|alias]] now");

    expect(editor.action(getMarkdown()).trim()).toBe("See [[Plan]] and [[Ideas|alias]] now");
  });

  it("keeps brackets inside code untouched", async () => {
    const { editor, root } = await createEditor("Use `[[Plan]]` here");

    expect(root.querySelector("[data-wiki-link]")).toBeNull();
    expect(editor.action(getMarkdown()).trim()).toBe("Use `[[Plan]]` here");
  });

  it("navigates to the link target when a link is clicked", async () => {
    const onNavigate = vi.fn();
    const { root } = await createEditor("See [[Plan#Goals]] now", { onNavigate });

    root
      .querySelector("[data-wiki-link]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onNavigate).toHaveBeenCalledWith("Plan");
  });
});
