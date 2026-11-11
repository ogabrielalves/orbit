import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import AnnotationsIcon from "@/assets/icons/linha/anotacoes.svg?react";
import SearchIcon from "@/assets/icons/linha/busca.svg?react";
import CheckIcon from "@/assets/icons/linha/check.svg?react";
import GridIcon from "@/assets/icons/linha/grade.svg?react";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import FolderIcon from "@/assets/icons/linha/nova-pasta.svg?react";
import type { Project, SearchHit } from "@/bindings";
import { Input } from "@/components/atoms/Input";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { Spinner } from "@/components/atoms/Spinner";
import { HighlightedText } from "@/components/molecules/HighlightedText";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getErrorMessageKey } from "@/lib/appError";
import { formatHotkey } from "@/lib/formatHotkey";
import { creationShortcuts, isMacPlatform } from "@/lib/shortcuts";
import { resolveProjectColor } from "@/modules/projects/colors";
import { useProjects } from "@/modules/projects/queries";
import { useSearchResults } from "@/modules/search/queries";
import { groupSearchResults, hitText, type SearchCategory } from "@/modules/search/results";
import { useOpenSearchHit } from "@/modules/search/useOpenSearchHit";
import { TASK_TITLE_MAX_LENGTH } from "@/modules/tasks/limits";
import { useCreateTask } from "@/modules/tasks/queries";
import { optionDomId, PaletteList } from "@/pages/search/PaletteList";
import {
  clampIndex,
  flattenGroups,
  type PaletteGroup,
  type PaletteItem,
  stepIndex,
} from "@/pages/search/paletteModel";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 200;

export type ProjectAction = "board" | "task";

type Step =
  | { kind: "search" }
  | { kind: "project"; action: ProjectAction }
  | { kind: "title"; project: Project };

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const categoryIcons: Record<SearchCategory, IconComponent> = {
  projects: SearchIcon,
  boards: GridIcon,
  tasks: CheckIcon,
  notes: AnnotationsIcon,
  folders: FolderIcon,
};

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
  initialAction?: ProjectAction;
};

type IconRowProps = {
  icon: IconComponent;
  hint?: string[];
  children: ReactNode;
};

function IconRow({ icon: Icon, hint, children }: IconRowProps) {
  const hasHint = hint !== undefined;

  return (
    <>
      <Icon aria-hidden="true" className="size-4.5 shrink-0 text-fg-muted" />
      <span className="min-w-0 flex-1 truncate text-body text-fg">{children}</span>
      {hasHint && (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          {hint.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      )}
    </>
  );
}

function HitRow({ category, hit }: { category: SearchCategory; hit: SearchHit }) {
  const Icon = categoryIcons[category];
  const hasSnippet = hitText(hit.snippet) !== "";
  const hasContext = hit.context !== null;

  return (
    <>
      <Icon aria-hidden="true" className="size-4.5 shrink-0 text-fg-muted" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-fg">
          <HighlightedText parts={hit.title} />
        </span>
        {hasSnippet && (
          <span className="truncate text-caption text-fg-muted">
            <HighlightedText parts={hit.snippet} />
          </span>
        )}
      </span>
      {hasContext && (
        <span className="max-w-40 shrink-0 truncate text-caption text-fg-muted">{hit.context}</span>
      )}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-xs border border-border bg-surface-muted px-1.5 py-px font-sans text-micro text-fg-secondary">
      {children}
    </kbd>
  );
}

function PaletteDialog({
  onClose,
  initialAction,
}: {
  onClose: () => void;
  initialAction: ProjectAction | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openHit = useOpenSearchHit();
  const listboxId = useId();
  const createTask = useCreateTask();
  const [step, setStep] = useState<Step>(
    initialAction === undefined ? { kind: "search" } : { kind: "project", action: initialAction },
  );
  const [query, setQuery] = useState("");
  const [rawActiveIndex, setRawActiveIndex] = useState(0);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery !== "";
  const isSearchStep = step.kind === "search";
  const isProjectStep = step.kind === "project";
  const isTitleStep = step.kind === "title";
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const searchQuery = useSearchResults(debouncedQuery, isSearchStep);
  const projectsQuery = useProjects({ scope: "active", status: null, search: null });

  function goTo(nextStep: Step) {
    setStep(nextStep);
    setQuery("");
    setRawActiveIndex(0);
  }

  function goBack() {
    if (step.kind === "title") {
      goTo({ kind: "project", action: "task" });
      return;
    }
    goTo({ kind: "search" });
  }

  function runAndClose(action: () => void) {
    action();
    onClose();
  }

  const isMac = isMacPlatform();
  const quickActions: { id: string; label: string; combo: string; run: () => void }[] = [
    {
      id: "new-task",
      label: t("search.actions.newTask"),
      combo: creationShortcuts.newTask,
      run: () => goTo({ kind: "project", action: "task" }),
    },
    {
      id: "new-project",
      label: t("search.actions.newProject"),
      combo: creationShortcuts.newProject,
      run: () => runAndClose(() => void navigate({ to: "/projects", search: { new: 1 } })),
    },
    {
      id: "new-board",
      label: t("search.actions.newBoard"),
      combo: creationShortcuts.newBoard,
      run: () => goTo({ kind: "project", action: "board" }),
    },
    {
      id: "new-note",
      label: t("search.actions.newNote"),
      combo: creationShortcuts.newNote,
      run: () => runAndClose(() => void navigate({ to: "/notes", search: { new: 1 } })),
    },
  ];

  function buildSearchGroups(): PaletteGroup[] {
    const loweredQuery = trimmedQuery.toLowerCase();
    const matchingActions = quickActions.filter(
      (action) => !hasQuery || action.label.toLowerCase().includes(loweredQuery),
    );
    const actionGroup: PaletteGroup = {
      id: "actions",
      label: t("search.actions.title"),
      items: matchingActions.map((action) => ({
        id: action.id,
        content: (
          <IconRow icon={PlusIcon} hint={formatHotkey(action.combo, isMac)}>
            {action.label}
          </IconRow>
        ),
        onSelect: action.run,
      })),
    };
    const resultGroups: PaletteGroup[] = hasQuery
      ? groupSearchResults(searchQuery.data).map((group) => ({
          id: group.category,
          label: t(`search.categories.${group.category}`),
          items: group.hits.map((hit) => ({
            id: `${group.category}-${hit.entityId}`,
            content: <HitRow category={group.category} hit={hit} />,
            onSelect: () => runAndClose(() => openHit(group.category, hit)),
          })),
        }))
      : [];
    const hasActions = actionGroup.items.length > 0;
    return hasActions ? [actionGroup, ...resultGroups] : resultGroups;
  }

  function buildProjectGroups(action: ProjectAction): PaletteGroup[] {
    const loweredQuery = trimmedQuery.toLowerCase();
    const projects = (projectsQuery.data ?? []).filter((project) =>
      project.name.toLowerCase().includes(loweredQuery),
    );
    const items: PaletteItem[] = projects.map((project) => ({
      id: project.id,
      content: (
        <>
          <ProjectTile name={project.name} color={resolveProjectColor(project.color)} size="sm" />
          <span className="min-w-0 flex-1 truncate text-body text-fg">{project.name}</span>
        </>
      ),
      onSelect: () => {
        if (action === "task") {
          goTo({ kind: "title", project });
          return;
        }
        runAndClose(
          () =>
            void navigate({
              to: "/projects/$projectId",
              params: { projectId: project.id },
              search: { new: 1 },
            }),
        );
      },
    }));
    const hasItems = items.length > 0;
    return hasItems ? [{ id: "projects", label: t("search.pickProject.title"), items }] : [];
  }

  const groups = isSearchStep
    ? buildSearchGroups()
    : isProjectStep
      ? buildProjectGroups(step.action)
      : [];
  const items = flattenGroups(groups);
  const activeIndex = clampIndex(rawActiveIndex, items.length);
  const activeItem = items[activeIndex];
  const activeItemId = activeItem?.id;
  const hasItems = items.length > 0;
  const activeOptionDomId =
    activeItemId === undefined ? undefined : optionDomId(listboxId, activeItemId);

  const isDebouncing = debouncedQuery.trim() !== trimmedQuery;
  const isSearching = isSearchStep && hasQuery && (isDebouncing || searchQuery.isFetching);
  const hasSearchFailed = isSearchStep && hasQuery && searchQuery.isError && !isSearching;
  const hasNoResults =
    isSearchStep && hasQuery && !isSearching && searchQuery.isSuccess && !hasItems;
  const hasNoProjects = isProjectStep && projectsQuery.isSuccess && !hasItems;
  const isTitleBlank = trimmedQuery === "";

  function handleQueryChange(value: string) {
    setQuery(value);
    setRawActiveIndex(0);
  }

  function submitTitle() {
    if (step.kind !== "title" || isTitleBlank || createTask.isPending) {
      return;
    }
    const projectName = step.project.name;
    createTask.mutate(
      { projectId: step.project.id, title: trimmedQuery },
      {
        onSuccess: () => {
          toast.success(t("search.toast.taskCreated", { project: projectName }));
          onClose();
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setRawActiveIndex(stepIndex(activeIndex, delta, items.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (isTitleStep) {
        submitTitle();
        return;
      }
      activeItem?.onSelect();
      return;
    }
    const isBackspaceOnEmpty = event.key === "Backspace" && query === "" && !isSearchStep;
    if (isBackspaceOnEmpty) {
      event.preventDefault();
      goBack();
    }
  }

  function handleEscapeKeyDown(event: Event) {
    if (!isSearchStep) {
      event.preventDefault();
      goBack();
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
    }
  }

  const placeholder = isSearchStep
    ? t("search.placeholder")
    : isProjectStep
      ? t("search.pickProject.placeholder")
      : t("search.taskTitle.placeholder");
  const inputLabel = isTitleStep ? t("search.taskTitle.label") : t("search.inputLabel");
  const comboboxProps = isTitleStep
    ? {}
    : {
        role: "combobox",
        "aria-expanded": true,
        "aria-controls": listboxId,
        "aria-activedescendant": activeOptionDomId,
        "aria-autocomplete": "list" as const,
      };
  const stepPrompt =
    step.kind === "project"
      ? t(step.action === "task" ? "search.pickProject.forTask" : "search.pickProject.forBoard")
      : step.kind === "title"
        ? t("search.taskTitle.project", { name: step.project.name })
        : null;
  const hasStepPrompt = stepPrompt !== null;

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={handleEscapeKeyDown}
          className="fixed top-18 left-1/2 z-50 flex max-h-[calc(100vh-9rem)] w-[calc(100%-2rem)] max-w-150 -translate-x-1/2 animate-pop-in flex-col overflow-hidden rounded-3xl bg-surface shadow-lg motion-reduce:animate-none"
        >
          <Dialog.Title className="sr-only">{t("search.title")}</Dialog.Title>
          <div className="flex flex-col gap-2 border-b border-border p-4">
            <Input
              icon={SearchIcon}
              value={query}
              maxLength={isTitleStep ? TASK_TITLE_MAX_LENGTH : undefined}
              placeholder={placeholder}
              aria-label={inputLabel}
              autoComplete="off"
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              {...comboboxProps}
            />
            {hasStepPrompt && <p className="px-1 text-caption text-fg-muted">{stepPrompt}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!isTitleStep && (
              <PaletteList
                listboxId={listboxId}
                label={t("search.resultsLabel")}
                groups={groups}
                activeItemId={activeItemId}
                onActivate={(itemId) =>
                  setRawActiveIndex(items.findIndex((item) => item.id === itemId))
                }
              />
            )}
            {isSearching && (
              <p
                role="status"
                className="flex items-center gap-2 px-5 py-4 text-small text-fg-muted"
              >
                <Spinner />
                {t("search.loading")}
              </p>
            )}
            {hasSearchFailed && (
              <p role="alert" className="px-5 py-4 text-small text-danger-fg">
                {t(getErrorMessageKey(searchQuery.error))}
              </p>
            )}
            {hasNoResults && (
              <p className="px-5 py-6 text-center text-small text-fg-muted">
                {t("search.empty", { query: trimmedQuery })}
              </p>
            )}
            {hasNoProjects && (
              <p className="px-5 py-6 text-center text-small text-fg-muted">
                {t("search.pickProject.empty")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 border-t border-border px-5 py-3 text-caption text-fg-muted">
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd>
              {t("search.hints.navigate")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Enter</Kbd>
              {isTitleStep ? t("search.hints.create") : t("search.hints.open")}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              {isSearchStep ? t("search.hints.close") : t("search.hints.back")}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CommandPalette({ isOpen, onClose, initialAction }: CommandPaletteProps) {
  if (!isOpen) {
    return null;
  }

  return <PaletteDialog onClose={onClose} initialAction={initialAction} />;
}
