import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { VaultStatus } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { getErrorMessageKey } from "@/lib/appError";
import { useSetupVault } from "@/modules/notes/queries";

type VaultSetupProps = {
  status: VaultStatus;
};

export function VaultSetup({ status }: VaultSetupProps) {
  const { t } = useTranslation();
  const setupVault = useSetupVault();

  const unreachablePath = status.path;
  const isUnreachable = unreachablePath !== null;
  const hasFailed = setupVault.isError;

  async function pickFolder(shouldCreate: boolean) {
    const title = t(shouldCreate ? "notes.vault.pickNewTitle" : "notes.vault.pickExistingTitle");
    const selected = await open({ directory: true, multiple: false, title });
    const hasSelection = typeof selected === "string";
    if (!hasSelection) {
      return;
    }
    setupVault.mutate(
      { path: selected, create: shouldCreate },
      { onSuccess: (info) => toast.success(t("notes.vault.ready", { count: info.noteCount })) },
    );
  }

  return (
    <section
      aria-label={t("notes.vault.title")}
      className="mx-auto flex w-full max-w-130 flex-col items-center gap-4 rounded-xl border border-border bg-surface p-8 text-center shadow-xs"
    >
      <h2 className="font-display text-heading-2 font-semibold text-fg">
        {t(isUnreachable ? "notes.vault.unreachableTitle" : "notes.vault.title")}
      </h2>
      <p className="text-body text-fg-muted">
        {t(isUnreachable ? "notes.vault.unreachableDescription" : "notes.vault.description")}
      </p>
      {isUnreachable && (
        <code className="max-w-full rounded-md bg-surface-muted px-3 py-1.5 text-caption break-all text-fg-secondary">
          {unreachablePath}
        </code>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button isLoading={setupVault.isPending} onClick={() => void pickFolder(false)}>
          {t("notes.vault.chooseExisting")}
        </Button>
        <Button
          variant="secondary"
          disabled={setupVault.isPending}
          onClick={() => void pickFolder(true)}
        >
          {t("notes.vault.createNew")}
        </Button>
      </div>
      {hasFailed && (
        <p role="alert" className="text-small text-danger-fg">
          {t(getErrorMessageKey(setupVault.error))}
        </p>
      )}
    </section>
  );
}
