import type { Editor } from "@milkdown/kit/core";
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { callCommand } from "@milkdown/kit/utils";
import type { ComponentType, RefObject, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import CodeBlockIcon from "@/assets/icons/editor/bloco-codigo.svg?react";
import QuoteIcon from "@/assets/icons/editor/citacao.svg?react";
import InlineCodeIcon from "@/assets/icons/editor/codigo-inline.svg?react";
import DividerIcon from "@/assets/icons/editor/divisor.svg?react";
import ItalicIcon from "@/assets/icons/editor/italico.svg?react";
import BulletListIcon from "@/assets/icons/editor/lista.svg?react";
import OrderedListIcon from "@/assets/icons/editor/lista-numerada.svg?react";
import BoldIcon from "@/assets/icons/editor/negrito.svg?react";
import TableIcon from "@/assets/icons/editor/tabela.svg?react";
import StrikeIcon from "@/assets/icons/editor/tachado.svg?react";
import Heading1Icon from "@/assets/icons/editor/titulo-1.svg?react";
import Heading2Icon from "@/assets/icons/editor/titulo-2.svg?react";
import Heading3Icon from "@/assets/icons/editor/titulo-3.svg?react";
import { Tooltip } from "@/components/atoms/Tooltip";
import { formatShortcut } from "@/lib/shortcuts";

type ToolbarActionId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "table"
  | "codeBlock"
  | "divider";

type ToolbarAction = {
  id: ToolbarActionId;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  run: (editor: Editor) => void;
};

type EditorToolbarProps = {
  editorRef: RefObject<Editor | null>;
};

const actionGroups: ToolbarAction[][] = [
  [
    {
      id: "heading1",
      icon: Heading1Icon,
      run: (editor) => editor.action(callCommand(wrapInHeadingCommand.key, 1)),
    },
    {
      id: "heading2",
      icon: Heading2Icon,
      run: (editor) => editor.action(callCommand(wrapInHeadingCommand.key, 2)),
    },
    {
      id: "heading3",
      icon: Heading3Icon,
      run: (editor) => editor.action(callCommand(wrapInHeadingCommand.key, 3)),
    },
  ],
  [
    {
      id: "bold",
      icon: BoldIcon,
      run: (editor) => editor.action(callCommand(toggleStrongCommand.key)),
    },
    {
      id: "italic",
      icon: ItalicIcon,
      run: (editor) => editor.action(callCommand(toggleEmphasisCommand.key)),
    },
    {
      id: "strikethrough",
      icon: StrikeIcon,
      run: (editor) => editor.action(callCommand(toggleStrikethroughCommand.key)),
    },
    {
      id: "code",
      icon: InlineCodeIcon,
      run: (editor) => editor.action(callCommand(toggleInlineCodeCommand.key)),
    },
  ],
  [
    {
      id: "bulletList",
      icon: BulletListIcon,
      run: (editor) => editor.action(callCommand(wrapInBulletListCommand.key)),
    },
    {
      id: "orderedList",
      icon: OrderedListIcon,
      run: (editor) => editor.action(callCommand(wrapInOrderedListCommand.key)),
    },
    {
      id: "quote",
      icon: QuoteIcon,
      run: (editor) => editor.action(callCommand(wrapInBlockquoteCommand.key)),
    },
  ],
  [
    {
      id: "table",
      icon: TableIcon,
      run: (editor) => editor.action(callCommand(insertTableCommand.key)),
    },
    {
      id: "codeBlock",
      icon: CodeBlockIcon,
      run: (editor) => editor.action(callCommand(createCodeBlockCommand.key)),
    },
    {
      id: "divider",
      icon: DividerIcon,
      run: (editor) => editor.action(callCommand(insertHrCommand.key)),
    },
  ],
];

const toolbarShortcuts: Partial<Record<ToolbarActionId, string>> = {
  bold: "mod+b",
  italic: "mod+i",
  code: "mod+e",
};

export function EditorToolbar({ editorRef }: EditorToolbarProps) {
  const { t } = useTranslation();

  function handleRun(action: ToolbarAction) {
    const editor = editorRef.current;
    const hasEditor = editor !== null;
    if (hasEditor) {
      action.run(editor);
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t("notes.editor.toolbar.label")}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-muted p-1"
    >
      {actionGroups.map((group, groupIndex) => (
        <div key={group.map((action) => action.id).join("|")} className="flex items-center gap-0.5">
          {groupIndex > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-strong" />}
          {group.map((action) => {
            const Icon = action.icon;
            const label = t(`notes.editor.toolbar.${action.id}`);
            const combo = toolbarShortcuts[action.id];
            const shortcut = combo === undefined ? undefined : formatShortcut(combo);

            return (
              <Tooltip key={action.id} label={label} shortcut={shortcut} labelsTrigger>
                <button
                  type="button"
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleRun(action)}
                  className="inline-flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface hover:text-fg"
                >
                  <Icon aria-hidden="true" className="size-4.5" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
