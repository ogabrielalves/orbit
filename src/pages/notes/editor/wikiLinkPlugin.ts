import type { NodeType } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $ctx, $node, $prose, $remark } from "@milkdown/kit/utils";
import { extractWikiLinkTarget, findWikiLinkTrigger } from "@/pages/notes/links/wikiLink";

const WIKI_LINK_PATTERN = /\[\[([^[\]\n]+)\]\]/g;
const LEAF_PLACEHOLDER = "￼";
const NAVIGATION_KEYS = ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"];

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

export type WikiLinkSuggestState = {
  query: string;
  left: number;
  bottom: number;
  apply: (title: string) => void;
};

export type WikiLinkHandlers = {
  onNavigate: (target: string) => void;
  onSuggest: (state: WikiLinkSuggestState | null) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const wikiLinkHandlersCtx = $ctx<WikiLinkHandlers, "wikiLinkHandlers">(
  { onNavigate: () => undefined, onSuggest: () => undefined, onKeyDown: () => false },
  "wikiLinkHandlers",
);

export const wikiLinkNode = $node("wikiLink", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { inner: { default: "" } },
  parseDOM: [
    {
      tag: "span[data-wiki-link]",
      getAttrs: (dom) => ({ inner: (dom as HTMLElement).getAttribute("data-wiki-link") ?? "" }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-wiki-link": node.attrs.inner as string, class: "orbit-wikilink" },
    node.attrs.inner as string,
  ],
  parseMarkdown: {
    match: (node) => node.type === "wikiLink",
    runner: (state, node, type) => {
      state.addNode(type, { inner: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "wikiLink",
    runner: (state, node) => {
      state.addNode("html", undefined, `[[${node.attrs.inner as string}]]`);
    },
  },
}));

function splitTextNode(node: MarkdownNode): MarkdownNode[] {
  const text = node.value ?? "";
  const pieces: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const start = match.index ?? 0;
    const hasLeadingText = start > cursor;
    if (hasLeadingText) {
      pieces.push({ type: "text", value: text.slice(cursor, start) });
    }
    pieces.push({ type: "wikiLink", value: match[1] });
    cursor = start + match[0].length;
  }

  const hasTrailingText = cursor < text.length;
  if (hasTrailingText) {
    pieces.push({ type: "text", value: text.slice(cursor) });
  }
  return pieces;
}

function transformChildren(parent: MarkdownNode) {
  const children = parent.children;
  const hasChildren = children !== undefined;
  const isLink = parent.type === "link" || parent.type === "linkReference";
  if (!hasChildren || isLink) {
    return;
  }

  parent.children = children.flatMap((child) => {
    const isText = child.type === "text";
    const hasWikiLink =
      isText && child.value !== undefined && /\[\[[^[\]\n]+\]\]/.test(child.value);
    if (hasWikiLink) {
      return splitTextNode(child);
    }
    transformChildren(child);
    return [child];
  });
}

export const wikiLinkRemark = $remark("wikiLinkRemark", () => () => (tree: MarkdownNode) => {
  transformChildren(tree);
});

function readSuggestState(view: EditorView, handlers: WikiLinkHandlers, linkType: NodeType) {
  const { selection } = view.state;
  const { $from } = selection;
  const isCollapsed = selection.empty;
  const isTextBlock = $from.parent.isTextblock;
  const isCodeBlock = $from.parent.type.spec.code === true;
  const canSuggest = isCollapsed && isTextBlock && !isCodeBlock;
  if (!canSuggest) {
    return null;
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, LEAF_PLACEHOLDER);
  const trigger = findWikiLinkTrigger(textBefore);
  const hasTrigger = trigger !== null;
  if (!hasTrigger) {
    return null;
  }

  const from = $from.start() + trigger.from;
  const to = $from.pos;
  const coords = view.coordsAtPos(to);

  function apply(title: string) {
    view.dispatch(view.state.tr.replaceWith(from, to, linkType.create({ inner: title })));
    view.focus();
  }

  const state: WikiLinkSuggestState = {
    query: trigger.query,
    left: coords.left,
    bottom: coords.bottom,
    apply,
  };
  handlers.onSuggest(state);
  return state;
}

export const wikiLinkProse = $prose((ctx) => {
  const handlers = ctx.get(wikiLinkHandlersCtx.key);
  const linkType = wikiLinkNode.type(ctx);
  let wasSuggesting = false;

  return new Plugin({
    key: new PluginKey("orbit-wiki-link"),
    view: () => ({
      update: (view) => {
        const state = readSuggestState(view, handlers, linkType);
        const isSuggesting = state !== null;
        const shouldClose = wasSuggesting && !isSuggesting;
        if (shouldClose) {
          handlers.onSuggest(null);
        }
        wasSuggesting = isSuggesting;
      },
      destroy: () => {
        if (wasSuggesting) {
          handlers.onSuggest(null);
        }
      },
    }),
    props: {
      handleKeyDown: (_view, event) => {
        const isNavigationKey = NAVIGATION_KEYS.includes(event.key);
        return isNavigationKey && handlers.onKeyDown(event);
      },
      handleDOMEvents: {
        click: (_view, event) => {
          const element = event.target as HTMLElement | null;
          const linkElement = element?.closest?.("[data-wiki-link]") ?? null;
          const hasLink = linkElement !== null;
          if (!hasLink) {
            return false;
          }

          const inner = linkElement.getAttribute("data-wiki-link") ?? "";
          const target = extractWikiLinkTarget(`[[${inner}]]`);
          const hasTarget = target !== null;
          if (hasTarget) {
            handlers.onNavigate(target);
          }
          return hasTarget;
        },
      },
    },
  });
});

export const wikiLinkPlugins = [
  wikiLinkHandlersCtx,
  wikiLinkNode,
  wikiLinkRemark,
  wikiLinkProse,
].flat();
