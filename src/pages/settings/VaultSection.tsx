import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Settings } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { useSetupVault } from "@/modules/notes/queries";
import { useReindexVault } from "@/modules/vault/queries";
import { SettingsSection } from "@/pages/settings/SettingsSection";

type VaultSectionProps = {
  settings: Settings;
};

export function VaultSection({ settings }: VaultSectionProps) {
  const { t } = useTranslation();
  const setupVault = useSetupVault();
  const reindexVault = useReindexVault();

  const vaultPath = settings.vaultPath;
  const hasVault = vaultPath !== null;
  const isBusy = setupVault.isPending || reindexVault.isPending;

  async function handleChangeFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("settings.vault.dialogTitle"),
    });
    const hasSelection = typeof selected === "string";
    if (!hasSelection || selected === vaultPath) {
      return;
    }
    setupVault.mutate(
      { path: selected, create: true },
      { onSuccess: () => toast.success(t("settings.vault.changed")) },
    );
  }

  function handleReindex() {
    reindexVault.mutate(undefined, {
      onSuccess: () => toast.success(t("settings.vault.reindexed")),
    });
  }

  return (
    <SettingsSection
      title={t("settings.vault.title")}
      description={t("settings.vault.description")}
    >
      <code className="rounded-md bg-surface-muted px-3 py-2 text-caption break-all text-fg-secondary">
        {hasVault ? vaultPath : t("settings.vault.noFolder")}
      </code>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={isBusy}
          isLoading={setupVault.isPending}
          onClick={() => void handleChangeFolder()}
        >
          {t("settings.vault.change")}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasVault || isBusy}
          isLoading={reindexVault.isPending}
          onClick={handleReindex}
        >
          {t("settings.vault.reindex")}
        </Button>
        <span className="text-caption text-fg-muted">{t("settings.vault.reindexHint")}</span>
      </div>
    </SettingsSection>
  );
}
