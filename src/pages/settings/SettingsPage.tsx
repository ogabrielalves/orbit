import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { getErrorMessageKey } from "@/lib/appError";
import { useSettings } from "@/modules/settings/queries";
import { BackupSection } from "@/pages/settings/BackupSection";
import { DatabaseSection } from "@/pages/settings/DatabaseSection";
import { LanguageSection } from "@/pages/settings/LanguageSection";
import { ProfileSection } from "@/pages/settings/ProfileSection";
import { ShortcutsSection } from "@/pages/settings/ShortcutsSection";
import { VaultSection } from "@/pages/settings/VaultSection";

const placeholderIds = ["a", "b", "c"];

export function SettingsPage() {
  const { t } = useTranslation();
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;

  const isLoading = settingsQuery.isPending;
  const hasFailed = settingsQuery.isError;

  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <div className="flex max-w-170 flex-col gap-6">
        {isLoading && (
          <div role="status" aria-busy="true" className="flex flex-col gap-6">
            <span className="sr-only">{t("common.loading")}</span>
            {placeholderIds.map((id) => (
              <Skeleton key={id} className="h-32 w-full rounded-2xl" />
            ))}
          </div>
        )}
        {hasFailed && (
          <ErrorState
            title={t("settings.loadError")}
            description={t(getErrorMessageKey(settingsQuery.error))}
            onRetry={() => void settingsQuery.refetch()}
          />
        )}
        {settings !== undefined && (
          <>
            <LanguageSection settings={settings} />
            <ProfileSection key={settings.userName ?? ""} settings={settings} />
            <VaultSection settings={settings} />
            <BackupSection />
            <DatabaseSection />
            <ShortcutsSection />
          </>
        )}
      </div>
    </>
  );
}
