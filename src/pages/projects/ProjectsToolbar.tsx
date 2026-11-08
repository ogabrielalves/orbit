import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import SearchIcon from "@/assets/icons/linha/busca.svg?react";
import GridIcon from "@/assets/icons/linha/grade.svg?react";
import ListIcon from "@/assets/icons/linha/lista.svg?react";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { SegmentedControl } from "@/components/molecules/SegmentedControl";
import {
  type ProjectsFilters,
  type ProjectsSearch,
  projectScopes,
  projectSorts,
  projectStatusFilters,
} from "@/pages/projects/projectsSearch";

type ProjectsToolbarProps = {
  filters: ProjectsFilters;
  onChange: (patch: ProjectsSearch) => void;
};

export function ProjectsToolbar({ filters, onChange }: ProjectsToolbarProps) {
  const { t } = useTranslation();

  const scopeOptions = projectScopes.map((scope) => ({
    value: scope,
    label: t(`projects.scope.${scope}`),
  }));
  const statusOptions = projectStatusFilters.map((status) => ({
    value: status,
    label: t(`projects.status.${status}`),
  }));
  const viewOptions = [
    { value: "grid", label: t("projects.view.grid"), icon: GridIcon },
    { value: "list", label: t("projects.view.list"), icon: ListIcon },
  ] as const;

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    const query = event.target.value;
    const isEmpty = query === "";
    onChange({ q: isEmpty ? undefined : query });
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextSort = projectSorts.find((sort) => sort === event.target.value);
    const hasSort = nextSort !== undefined;
    if (hasSort) {
      onChange({ sort: nextSort });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="w-full md:w-70">
        <Input
          size="compact"
          icon={SearchIcon}
          type="search"
          aria-label={t("projects.searchLabel")}
          placeholder={t("projects.searchPlaceholder")}
          value={filters.q}
          onChange={handleQueryChange}
        />
      </div>
      <SegmentedControl
        label={t("projects.scopeLabel")}
        options={scopeOptions}
        value={filters.scope}
        onChange={(scope) => onChange({ scope })}
      />
      <SegmentedControl
        label={t("projects.statusLabel")}
        options={statusOptions}
        value={filters.status}
        onChange={(status) => onChange({ status })}
      />
      <span className="hidden flex-1 lg:block" />
      <Select
        size="compact"
        aria-label={t("projects.sortLabel")}
        value={filters.sort}
        onChange={handleSortChange}
      >
        {projectSorts.map((sort) => (
          <option key={sort} value={sort}>
            {t(`projects.sort.${sort}`)}
          </option>
        ))}
      </Select>
      <SegmentedControl
        label={t("projects.viewLabel")}
        variant="bordered"
        isIconOnly
        options={[...viewOptions]}
        value={filters.view}
        onChange={(view) => onChange({ view })}
      />
    </div>
  );
}
