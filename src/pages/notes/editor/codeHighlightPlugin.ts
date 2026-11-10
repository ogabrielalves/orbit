import type { Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { highlightCode } from "@/pages/notes/editor/highlightCode";

const CODE_BLOCK_NAME = "code_block";

function buildDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    const isCodeBlock = node.type.name === CODE_BLOCK_NAME;
    if (!isCodeBlock) {
      return true;
    }

    const contentStart = position + 1;
    for (const range of highlightCode(node.textContent, node.attrs.language as string)) {
      decorations.push(
        Decoration.inline(contentStart + range.from, contentStart + range.to, {
          class: range.className,
        }),
      );
    }
    return false;
  });

  return DecorationSet.create(doc, decorations);
}

export const codeHighlightProse = $prose(() => {
  const key = new PluginKey<DecorationSet>("orbit-code-highlight");

  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => buildDecorations(state.doc),
      apply: (transaction, previous) =>
        transaction.docChanged ? buildDecorations(transaction.doc) : previous,
    },
    props: {
      decorations: (state) => key.getState(state),
    },
  });
});
