import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/atoms/Button";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { toLocalIsoDate } from "@/lib/dates";
import { useExportDatabase, useImportDatabase } from "@/modules/backup/queries";
import { SettingsSection } from "@/pages/settings/SettingsSection";

const BACKUP_EXTENSION = "db";

export function BackupSection() {
  const { t } = useTranslation();
  const exportDatabase = useExportDatabase();
  const importDatabase = useImportDatabase();
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  const isBusy = exportDatabase.isPending || importDatabase.isPending;
  const isConfirmOpen = pendingSource !== null;
  const fileFilters = [{ name: t("settings.backup.fileFilter"), extensions: [BACKUP_EXTENSION] }];

  async function handleExport() {
    const destination = await save({
      title: t("settings.backup.exportDialogTitle"),
      defaultPath: `orbit-backup-${toLocalIsoDate(new Date())}.${BACKUP_EXTENSION}`,
      filters: fileFilters,
    });
    if (destination === null) {
      return;
    }
    exportDatabase.mutate(
      { destinationPath: destination, overwrite: true },
      { onSuccess: () => toast.success(t("settings.backup.exported")) },
    );
  }

  async function handlePickBackup() {
    const selected = await open({
      directory: false,
      multiple: false,
      title: t("settings.backup.importDialogTitle"),
      filters: fileFilters,
    });
    const hasSelection = typeof selected === "string";
    if (hasSelection) {
      setPendingSource(selected);
    }
  }

  function handleConfirmImport() {
    if (pendingSource === null) {
      return;
    }
    importDatabase.mutate(
      { sourcePath: pendingSource },
      {
        onSuccess: () => toast.success(t("settings.backup.imported")),
        onSettled: () => setPendingSource(null),
      },
    );
  }

  return (
    <SettingsSection
      title={t("settings.backup.title")}
      description={t("settings.backup.description")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={isBusy}
          isLoading={exportDatabase.isPending}
          onClick={() => void handleExport()}
        >
          {t("settings.backup.export")}
        </Button>
        <Button variant="secondary" disabled={isBusy} onClick={() => void handlePickBackup()}>
          {t("settings.backup.import")}
        </Button>
      </div>
      <ConfirmDialog
        isOpen={isConfirmOpen}
        tone="danger"
        title={t("settings.backup.importConfirm.title")}
        description={t("settings.backup.importConfirm.description")}
        confirmLabel={t("settings.backup.importConfirm.confirm")}
        isConfirming={importDatabase.isPending}
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingSource(null)}
      />
    </SettingsSection>
  );
}
