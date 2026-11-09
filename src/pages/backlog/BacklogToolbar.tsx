import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import SearchIcon from "@/assets/icons/linha/busca.svg?react";
import type { Project, Tag } from "@/bindings";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import {
  type BacklogFilters,
  type BacklogSearch,
  backlogPriorities,
  backlogSorts,
} from "@/pages/backlog/backlogSearch";

type BacklogToolbarProps = {
  filters: BacklogFilters;
  projects: Project[];
  tags: Tag[];
  onChange: (patch: BacklogSearch) => void;
};

type GroupMode = "flat" | "grouped";

function emptyToUndefined(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export function BacklogToolbar({ filters, projects, tags, onChange }: BacklogToolbarProps) {
  const { t } = useTranslation();

  const groupOptions = [
    { value: "flat", label: t("backlog.group.flat") },
    { value: "grouped", label: t("backlog.group.grouped") },
  ] as const;
  const groupMode: GroupMode = filters.grouped ? "grouped" : "flat";

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    onChange({ q: emptyToUndefined(event.target.value) });
  }

  function handleProjectChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ project: emptyToUndefined(event.target.value) });
  }

  function handlePriorityChange(event: ChangeEvent<HTMLSelectElement>) {
    const priority = backlogPriorities.find((option) => option === event.target.value);
    onChange({ priority });
  }

  function handleTagChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange({ tag: emptyToUndefined(event.target.value) });
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    const sort = backlogSorts.find((option) => option === event.target.value);
    const hasSort = sort !== undefined;
    if (hasSort) {
      onChange({ sort });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="w-full md:w-70">
        <Input
          size="compact"
          icon={SearchIcon}
          type="search"
          aria-label={t("backlog.searchLabel")}
          placeholder={t("backlog.searchPlaceholder")}
          value={filters.q}
          onChange={handleQueryChange}
        />
      </div>
      <Select
        size="compact"
        aria-label={t("backlog.projectLabel")}
        value={filters.project}
        onChange={handleProjectChange}
      >
        <option value="">{t("backlog.allProjects")}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
      <Select
        size="compact"
        aria-label={t("backlog.priorityLabel")}
        value={filters.priority}
        onChange={handlePriorityChange}
      >
        <option value="">{t("backlog.allPriorities")}</option>
        {backlogPriorities.map((priority) => (
          <option key={priority} value={priority}>
            {t(`tasks.priority.${priority}`)}
          </option>
        ))}
      </Select>
      <Select
        size="compact"
        aria-label={t("backlog.tagLabel")}
        value={filters.tag}
        onChange={handleTagChange}
      >
        <option value="">{t("backlog.allTags")}</option>
        {tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </Select>
      <span className="hidden flex-1 lg:block" />
      <Select
        size="compact"
        aria-label={t("backlog.sortLabel")}
        value={filters.sort}
        onChange={handleSortChange}
      >
        {backlogSorts.map((sort) => (
          <option key={sort} value={sort}>
            {t(`backlog.sort.${sort}`)}
          </option>
        ))}
      </Select>
      <SegmentedControl
        label={t("backlog.groupLabel")}
        options={[...groupOptions]}
        value={groupMode}
        onChange={(mode) => onChange({ grouped: mode === "grouped" ? true : undefined })}
      />
    </div>
  );
}
