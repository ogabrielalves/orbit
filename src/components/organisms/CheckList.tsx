import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DragIcon from "@/assets/icons/linha/arrastar.svg?react";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import { Button } from "@/components/atoms/Button";
import { IconButton } from "@/components/atoms/IconButton";
import { Input } from "@/components/atoms/Input";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { getReorder, type Reorder } from "@/lib/reorder";

export type CheckListEntry = {
  id: string;
  text: string;
  isDone: boolean;
};

type CheckListKind = "subtasks" | "checklist";

type CheckListProps = {
  kind: CheckListKind;
  entries: CheckListEntry[];
  maxLength: number;
  isAdding: boolean;
  onAdd: (text: string) => void;
  onToggle: (id: string, isDone: boolean) => void;
  onRename: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onMove: (reorder: Reorder) => void;
};

type CheckListRowProps = {
  kind: CheckListKind;
  entry: CheckListEntry;
  maxLength: number;
  onToggle: (id: string, isDone: boolean) => void;
  onRename: (id: string, text: string) => void;
  onDelete: (id: string) => void;
};

function CheckListRow({ kind, entry, maxLength, onToggle, onRename, onDelete }: CheckListRowProps) {
  const { t } = useTranslation();
  const renameRef = useRef<HTMLInputElement>(null);
  const isRenameRequested = useRef(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const isDraftBlank = draft.trim() === "";
  const textClass = entry.isDone ? "text-fg-muted line-through" : "text-fg";
  const draggingClass = isDragging ? "opacity-50" : "";

  useEffect(() => {
    if (isRenaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [isRenaming]);

  function keepFocusOnRenameField(event: Event) {
    if (isRenameRequested.current) {
      isRenameRequested.current = false;
      event.preventDefault();
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }

  function startRename() {
    isRenameRequested.current = true;
    setDraft(entry.text);
    setIsRenaming(true);
  }

  function saveRename() {
    const hasChange = draft.trim() !== entry.text;
    if (!isDraftBlank && hasChange) {
      onRename(entry.id, draft.trim());
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveRename();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      setIsRenaming(false);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md py-1 ${draggingClass}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t(`tasks.${kind}.reorder`, { text: entry.text })}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-subtle hover:text-fg-muted active:cursor-grabbing"
      >
        <DragIcon aria-hidden="true" className="size-4" />
      </button>
      {isRenaming ? (
        <Input
          ref={renameRef}
          size="compact"
          value={draft}
          maxLength={maxLength}
          aria-label={t(`tasks.${kind}.renameLabel`)}
          data-escape-scope=""
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={() => setIsRenaming(false)}
        />
      ) : (
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={entry.isDone}
            onChange={(event) => onToggle(entry.id, event.target.checked)}
            className="size-4 shrink-0 accent-primary"
          />
          <span className={`min-w-0 flex-1 text-body break-words ${textClass}`}>{entry.text}</span>
        </label>
      )}
      <DropdownMenu
        onCloseAutoFocus={keepFocusOnRenameField}
        trigger={
          <IconButton
            icon={MoreIcon}
            size="sm"
            label={t(`tasks.${kind}.actions`, { text: entry.text })}
          />
        }
        sections={[
          [{ id: "rename", label: t(`tasks.${kind}.rename`), onSelect: startRename }],
          [
            {
              id: "delete",
              label: t(`tasks.${kind}.delete`),
              isDanger: true,
              onSelect: () => onDelete(entry.id),
            },
          ],
        ]}
      />
    </li>
  );
}

export function CheckList({
  kind,
  entries,
  maxLength,
  isAdding,
  onAdd,
  onToggle,
  onRename,
  onDelete,
  onMove,
}: CheckListProps) {
  const { t } = useTranslation();
  const addRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const doneCount = entries.filter((entry) => entry.isDone).length;
  const hasEntries = entries.length > 0;
  const isTextBlank = text.trim() === "";

  function handleDragEnd({ active, over }: DragEndEvent) {
    const hasTarget = over !== null;
    if (!hasTarget) {
      return;
    }
    const reorder = getReorder(
      entries.map((entry) => entry.id),
      String(active.id),
      String(over.id),
    );
    const hasMove = reorder !== null;
    if (hasMove) {
      onMove(reorder);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTextBlank || isAdding) {
      return;
    }
    onAdd(text.trim());
    setText("");
    addRef.current?.focus();
  }

  return (
    <section aria-label={t(`tasks.${kind}.title`)} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-heading-3 font-semibold text-fg">
          {t(`tasks.${kind}.title`)}
        </h3>
        {hasEntries && (
          <span className="text-caption text-fg-muted">
            {t(`tasks.${kind}.progress`, { done: doneCount, total: entries.length })}
          </span>
        )}
      </div>
      {hasEntries && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={entries.map((entry) => entry.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul aria-label={t(`tasks.${kind}.list`)} className="flex flex-col">
              {entries.map((entry) => (
                <CheckListRow
                  key={entry.id}
                  kind={kind}
                  entry={entry}
                  maxLength={maxLength}
                  onToggle={onToggle}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={addRef}
            size="compact"
            value={text}
            maxLength={maxLength}
            aria-label={t(`tasks.${kind}.addLabel`)}
            placeholder={t(`tasks.${kind}.addPlaceholder`)}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={isTextBlank}
          isLoading={isAdding}
        >
          {t(`tasks.${kind}.add`)}
        </Button>
      </form>
    </section>
  );
}
