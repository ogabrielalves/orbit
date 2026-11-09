import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { TagChip } from "@/components/molecules/TagChip";
import { projectColorKeys } from "@/modules/projects/colors";
import { TAG_NAME_MAX_LENGTH } from "@/modules/tags/limits";
import {
  useAssignTag,
  useCreateTag,
  useTags,
  useTaskTags,
  useUnassignTag,
} from "@/modules/tags/queries";

type TaskTagsProps = {
  taskId: string;
};

export function TaskTags({ taskId }: TaskTagsProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const tagsQuery = useTags();
  const taskTagsQuery = useTaskTags(taskId);
  const createTag = useCreateTag();
  const assignTag = useAssignTag();
  const unassignTag = useUnassignTag();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const allTags = tagsQuery.data ?? [];
  const assignedTags = taskTagsQuery.data ?? [];
  const assignedIds = new Set(assignedTags.map((tag) => tag.id));
  const typedName = search.trim();
  const lowerName = typedName.toLowerCase();
  const availableTags = allTags.filter(
    (tag) => !assignedIds.has(tag.id) && tag.name.toLowerCase().includes(lowerName),
  );
  const hasSameName = allTags.some((tag) => tag.name.toLowerCase() === lowerName);
  const canCreate = typedName !== "" && !hasSameName;
  const hasAssignedTags = assignedTags.length > 0;
  const hasAvailableTags = availableTags.length > 0;
  const isBusy = createTag.isPending || assignTag.isPending;
  const nextColor = projectColorKeys[allTags.length % projectColorKeys.length];

  useEffect(() => {
    if (isPickerOpen) {
      inputRef.current?.focus();
    }
  }, [isPickerOpen]);

  function closePicker() {
    setIsPickerOpen(false);
    setSearch("");
  }

  function assign(tagId: string) {
    assignTag.mutate({ taskId, tagId }, { onSuccess: () => setSearch("") });
  }

  function createAndAssign() {
    createTag.mutate({ name: typedName, color: nextColor }, { onSuccess: (tag) => assign(tag.id) });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const isEscape = event.key === "Escape";
    if (isEscape) {
      event.stopPropagation();
      closePicker();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) {
      return;
    }

    const firstAvailable = availableTags[0];
    if (canCreate) {
      createAndAssign();
      return;
    }
    if (firstAvailable !== undefined) {
      assign(firstAvailable.id);
    }
  }

  return (
    <section aria-label={t("tasks.tags.title")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-heading-3 font-semibold text-fg">
          {t("tasks.tags.title")}
        </h3>
        {!isPickerOpen && (
          <Button
            variant="secondary"
            size="sm"
            icon={PlusIcon}
            onClick={() => setIsPickerOpen(true)}
          >
            {t("tasks.tags.add")}
          </Button>
        )}
      </div>
      {hasAssignedTags ? (
        <ul aria-label={t("tasks.tags.list")} className="flex flex-wrap gap-1.5">
          {assignedTags.map((tag) => (
            <li key={tag.id} className="max-w-full">
              <TagChip
                name={tag.name}
                color={tag.color}
                removeLabel={t("tasks.tags.remove", { name: tag.name })}
                onRemove={() => unassignTag.mutate({ taskId, tagId: tag.id })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-fg-muted">{t("tasks.tags.empty")}</p>
      )}
      {isPickerOpen && (
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          aria-label={t("tasks.tags.picker")}
          data-escape-scope=""
          className="flex flex-col gap-2 rounded-lg border border-border p-3"
        >
          <Input
            ref={inputRef}
            size="compact"
            value={search}
            maxLength={TAG_NAME_MAX_LENGTH}
            aria-label={t("tasks.tags.searchLabel")}
            placeholder={t("tasks.tags.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
          {hasAvailableTags && (
            <ul aria-label={t("tasks.tags.available")} className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    aria-label={t("tasks.tags.assign", { name: tag.name })}
                    onClick={() => assign(tag.id)}
                    disabled={isBusy}
                    className="rounded-full focus-visible:shadow-focus disabled:opacity-60"
                  >
                    <TagChip name={tag.name} color={tag.color} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              icon={PlusIcon}
              onClick={createAndAssign}
              disabled={isBusy}
            >
              {t("tasks.tags.create", { name: typedName })}
            </Button>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={closePicker}>
              {t("tasks.tags.done")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
