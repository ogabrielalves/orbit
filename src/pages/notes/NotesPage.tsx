import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { getErrorMessageKey } from "@/lib/appError";
import { useVaultStatus } from "@/modules/notes/queries";
import { VaultSetup } from "@/pages/notes/VaultSetup";

export function NotesPage() {
  const { t } = useTranslation();
  const statusQuery = useVaultStatus();

  const status = statusQuery.data;
  const isLoading = statusQuery.isPending;
  const hasFailed = statusQuery.isError;
  const hasStatus = status !== undefined;
  const isReady = hasStatus && status.path !== null && status.isAccessible;
  const needsSetup = hasStatus && !isReady;

  return (
    <>
      <PageHeader title={t("nav.notes")} />
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("notes.vault.loadError")}
          description={t(getErrorMessageKey(statusQuery.error))}
          onRetry={() => void statusQuery.refetch()}
        />
      )}
      {needsSetup && <VaultSetup status={status} />}
    </>
  );
}
