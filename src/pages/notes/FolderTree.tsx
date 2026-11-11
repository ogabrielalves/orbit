import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ChevronIcon from "@/assets/icons/linha/chevron-baixo.svg?react";
import TrashIcon from "@/assets/icons/linha/lixeira.svg?react";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import NewFolderIcon from "@/assets/icons/linha/nova-pasta.svg?react";
import { IconButton } from "@/components/atoms/IconButton";
import { Tooltip } from "@/components/atoms/Tooltip";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { useIsFavorite, useToggleFavorite } from "@/modules/favorites/queries";
import { DragHandle } from "@/pages/notes/DragHandle";
import type { FolderNode } from "@/pages/notes/folderModel";
import { getAncestorPaths } from "@/pages/notes/folderModel";
import {
  type DragSource,
  FOLDER_DRAG_PREFIX,
  FOLDER_DROP_PREFIX,
  resolveMove,
} from "@/pages/notes/noteMove";

type FolderTreeProps = {
  roots: FolderNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  onNewFolder: (parentPath: string | null) => void;
  onNewNote: (folderPath: string) => void;
  onRename: (node: FolderNode) => void;
  onDelete: (node: FolderNode) => void;
};

type FolderRowProps = Omit<FolderTreeProps, "roots"> & {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
};

const INDENT_IN_PIXELS = 14;

function useFolderDropState(path: string, name: string) {
  const { active } = useDndContext();
  const droppable = useDroppable({
    id: `${FOLDER_DROP_PREFIX}${path}`,
    data: { path, name },
  });

  const source = active?.data.current as DragSource | undefined;
  const hasSource = source !== undefined;
  const canDrop = hasSource && resolveMove(source, path) !== null;
  const isDropTarget = droppable.isOver && canDrop;
  return { setNodeRef: droppable.setNodeRef, isDropTarget };
}

function FolderRow({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
  onNewFolder,
  onNewNote,
  onRename,
  onDelete,
}: FolderRowProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { path, name, noteCount } = node.entry;
  const favoriteReference = { entityType: "folder" as const, entityId: path };
  const isFavorite = useIsFavorite(favoriteReference);
  const toggleFavorite = useToggleFavorite();
  const drop = useFolderDropState(path, name);
  const drag = useDraggable({
    id: `${FOLDER_DRAG_PREFIX}${path}`,
    data: { kind: "folder", path, name } satisfies DragSource,
  });
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(path);
  const isSelected = selectedPath === path;
  const selectedClass = isSelected
    ? "bg-primary-soft text-primary-fg"
    : "text-fg hover:bg-surface-muted";
  const dropClass = drop.isDropTarget ? "ring-2 ring-primary" : "";
  const dragClass = drag.isDragging ? "opacity-50" : "";
  const rowClass = `${selectedClass} ${dropClass} ${dragClass}`;
  const chevronClass = isExpanded ? "" : "-rotate-90";
  const toggleLabel = t(isExpanded ? "notes.folders.collapse" : "notes.folders.expand", { name });

  const sections = [
    [
      {
        id: "new-note",
        label: t("notes.folders.menu.newNote"),
        icon: PlusIcon,
        onSelect: () => onNewNote(path),
      },
      {
        id: "new-folder",
        label: t("notes.folders.menu.newSubfolder"),
        icon: NewFolderIcon,
        onSelect: () => onNewFolder(path),
      },
    ],
    [
      {
        id: "favorite",
        label: t(isFavorite ? "favorites.toggle.remove" : "favorites.toggle.add"),
        onSelect: () => toggleFavorite.mutate(favoriteReference),
      },
      {
        id: "rename",
        label: t("notes.folders.menu.rename"),
        onSelect: () => onRename(node),
      },
      {
        id: "delete",
        label: t("notes.folders.menu.delete"),
        icon: TrashIcon,
        isDanger: true,
        onSelect: () => onDelete(node),
      },
    ],
  ];

  return (
    <li>
      <div
        ref={(element) => {
          drop.setNodeRef(element);
          drag.setNodeRef(element);
        }}
        style={{ paddingLeft: depth * INDENT_IN_PIXELS }}
        className={`group flex items-center gap-0.5 rounded-md pr-1 ${rowClass}`}
      >
        {hasChildren ? (
          <Tooltip label={toggleLabel} labelsTrigger>
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={toggleLabel}
              onClick={() => onToggle(path)}
              className="flex size-6 shrink-0 items-center justify-center text-fg-muted"
            >
              <ChevronIcon
                aria-hidden="true"
                className={`size-3.5 transition-transform ${chevronClass}`}
              />
            </button>
          </Tooltip>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <button
          type="button"
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onSelect(path)}
          onContextMenu={(event) => {
            event.preventDefault();
            setIsMenuOpen(true);
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 text-left text-small"
        >
          <span className="truncate">{name}</span>
          <span className="text-caption text-fg-muted">{noteCount}</span>
        </button>
        <DragHandle
          label={t("notes.move.handle", { name })}
          attributes={drag.attributes}
          listeners={drag.listeners}
          setActivatorNodeRef={drag.setActivatorNodeRef}
        />
        <DropdownMenu
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          trigger={
            <IconButton icon={MoreIcon} size="sm" label={t("notes.folders.actions", { name })} />
          }
          sections={sections}
        />
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.entry.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              onNewFolder={onNewFolder}
              onNewNote={onNewNote}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({
  roots,
  selectedPath,
  onSelect,
  onNewFolder,
  onNewNote,
  onRename,
  onDelete,
}: FolderTreeProps) {
  const { t } = useTranslation();
  const [expandedByUser, setExpandedByUser] = useState<Set<string>>(new Set());

  const expanded = new Set([...expandedByUser, ...getAncestorPaths(selectedPath)]);
  const allDrop = useFolderDropState("", t("notes.move.rootName"));
  const isAllSelected = selectedPath === "";
  const allSelectedClass = isAllSelected
    ? "bg-primary-soft text-primary-fg"
    : "text-fg hover:bg-surface-muted";
  const allClass = `${allSelectedClass} ${allDrop.isDropTarget ? "ring-2 ring-primary" : ""}`;

  function handleToggle(path: string) {
    setExpandedByUser((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <nav aria-label={t("notes.folders.title")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {t("notes.folders.title")}
        </h2>
        <IconButton
          icon={NewFolderIcon}
          size="sm"
          label={t("notes.folders.newFolder")}
          onClick={() => onNewFolder(null)}
        />
      </div>
      <ul className="flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            ref={allDrop.setNodeRef}
            aria-current={isAllSelected ? "true" : undefined}
            onClick={() => onSelect("")}
            className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-small ${allClass}`}
          >
            {t("notes.folders.all")}
          </button>
        </li>
        {roots.map((node) => (
          <FolderRow
            key={node.entry.path}
            node={node}
            depth={0}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={handleToggle}
            onSelect={onSelect}
            onNewFolder={onNewFolder}
            onNewNote={onNewNote}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </nav>
  );
}
