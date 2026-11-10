import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { getMarkdown } from "@milkdown/kit/utils";
import { afterEach, describe, expect, it } from "vitest";
import { codeHighlightProse } from "@/pages/notes/editor/codeHighlightPlugin";

const editors: Editor[] = [];

async function createEditor(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, markdown);
    })
    .use(commonmark)
    .use(codeHighlightProse);
  await editor.create();
  editors.push(editor);
  return { editor, root };
}

function tokenTexts(root: HTMLElement, className: string) {
  return [...root.querySelectorAll(`pre .${className}`)].map((element) => element.textContent);
}

describe("code highlight plugin", () => {
  afterEach(async () => {
    for (const editor of editors.splice(0)) {
      await editor.destroy();
    }
    document.body.innerHTML = "";
  });

  it("highlights code blocks that declare a language", async () => {
    const { root } = await createEditor('```js\nconst a = "x";\n```');

    expect(tokenTexts(root, "hljs-keyword")).toEqual(["const"]);
    expect(tokenTexts(root, "hljs-string")).toEqual(['"x"']);
  });

  it("leaves blocks without a language and inline code alone", async () => {
    const { root } = await createEditor("```\nconst a = 1;\n```\n\nUse `const` here");

    expect(root.querySelector('[class*="hljs-"]')).toBeNull();
  });

  it("does not change the markdown", async () => {
    const { editor } = await createEditor('```js\nconst a = "x";\n```');

    expect(editor.action(getMarkdown()).trim()).toBe('```js\nconst a = "x";\n```');
  });
});
