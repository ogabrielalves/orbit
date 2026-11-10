import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorToolbar } from "@/pages/notes/editor/EditorToolbar";
import "@/pages/notes/editor/editor.css";

type MarkdownEditorProps = {
  initialValue: string;
  onChange: (markdown: string) => void;
};

export function MarkdownEditor({ initialValue, onChange }: MarkdownEditorProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
          const hasChanged = markdown !== previousMarkdown;
          if (hasChanged) {
            onChangeRef.current(markdown);
          }
        });
      })
      .use(commonmark)
      .use(gfm)
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
  }, [initialValue]);

  return (
    <section
      aria-label={t("notes.editor.contentLabel")}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <EditorToolbar editorRef={editorRef} />
      <div ref={containerRef} className="orbit-editor min-h-60 flex-1" />
    </section>
  );
}
