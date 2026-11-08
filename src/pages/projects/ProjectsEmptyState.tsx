import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import { Button } from "@/components/atoms/Button";
import { EmptyState } from "@/components/molecules/EmptyState";

type ProjectsEmptyStateProps = {
  hasFilters: boolean;
  isArchivedScope: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
};

export function ProjectsEmptyState({
  hasFilters,
  isArchivedScope,
  onClearFilters,
  onCreate,
}: ProjectsEmptyStateProps) {
  const { t } = useTranslation();

  if (hasFilters) {
    return (
      <EmptyState
        title={t("projects.noResults.title")}
        description={t("projects.noResults.description")}
        actions={
          <Button variant="secondary" size="sm" onClick={onClearFilters}>
            {t("projects.noResults.clearFilters")}
          </Button>
        }
      />
    );
  }

  if (isArchivedScope) {
    return (
      <EmptyState
        title={t("projects.emptyArchived.title")}
        description={t("projects.emptyArchived.description")}
      />
    );
  }

  return (
    <EmptyState
      title={t("projects.empty.title")}
      description={t("projects.empty.description")}
      actions={
        <Button size="sm" icon={PlusIcon} onClick={onCreate}>
          {t("projects.createFirst")}
        </Button>
      }
    />
  );
}
