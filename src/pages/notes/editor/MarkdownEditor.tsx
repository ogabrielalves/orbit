import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { NoteSummary } from "@/bindings";
import { EditorToolbar } from "@/pages/notes/editor/EditorToolbar";
import { imageOptionsCtx, imagePlugins } from "@/pages/notes/editor/imagePlugin";
import { wikiLinkHandlersCtx, wikiLinkPlugins } from "@/pages/notes/editor/wikiLinkPlugin";
import { useWikiLinkSuggest } from "@/pages/notes/links/useWikiLinkSuggest";
import { WikiLinkSuggest } from "@/pages/notes/links/WikiLinkSuggest";
import "@/pages/notes/editor/editor.css";

const NO_NOTES: NoteSummary[] = [];

type MarkdownEditorProps = {
  initialValue: string;
  onChange: (markdown: string) => void;
  notes?: NoteSummary[];
  onNavigateLink?: (target: string) => void;
  onSaveImage?: (data: number[]) => Promise<string | null>;
};

export function MarkdownEditor({
  initialValue,
  onChange,
  notes = NO_NOTES,
  onNavigateLink,
  onSaveImage,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const onNavigateLinkRef = useRef(onNavigateLink);
  const onSaveImageRef = useRef(onSaveImage);
  const unavailableLabel = t("notes.images.unavailable");
  const { suggest, items, activeIndex, onSuggest, onKeyDown } = useWikiLinkSuggest(notes);

  useEffect(() => {
    onChangeRef.current = onChange;
    onNavigateLinkRef.current = onNavigateLink;
    onSaveImageRef.current = onSaveImage;
  }, [onChange, onNavigateLink, onSaveImage]);

  useEffect(() => {
    const root = containerRef.current;
    const hasRoot = root !== null;
    if (!hasRoot) {
      return;
    }

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialValue);
        ctx.set(wikiLinkHandlersCtx.key, {
          onNavigate: (target) => onNavigateLinkRef.current?.(target),
          onSuggest,
          onKeyDown,
        });
        ctx.set(imageOptionsCtx.key, {
          saveImage: async (data) => (await onSaveImageRef.current?.(data)) ?? null,
          unavailableLabel,
        });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
          const hasChanged = markdown !== previousMarkdown;
          if (hasChanged) {
            onChangeRef.current(markdown);
          }
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(wikiLinkPlugins)
      .use(imagePlugins)
      .use(history)
      .use(listener)
      .use(clipboard);

    const creation = editor.create().then(() => {
      editorRef.current = editor;
    });

    return () => {
      editorRef.current = null;
      void creation.then(() => editor.destroy());
    };
  }, [initialValue, onSuggest, onKeyDown, unavailableLabel]);

  return (
    <section
      aria-label={t("notes.editor.contentLabel")}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <EditorToolbar editorRef={editorRef} />
      <div ref={containerRef} className="orbit-editor min-h-60 flex-1" />
      {suggest !== null && (
        <WikiLinkSuggest
          items={items}
          activeIndex={activeIndex}
          left={suggest.left}
          bottom={suggest.bottom}
          onSelect={suggest.apply}
        />
      )}
    </section>
  );
}
