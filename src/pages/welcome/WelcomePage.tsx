import { useNavigate } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import logoUrl from "@/assets/logo/orbit-logo-animado.svg";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { getErrorMessageKey } from "@/lib/appError";
import { useSetupVault } from "@/modules/notes/queries";
import { useSettings, useUpdateSettings } from "@/modules/settings/queries";

export const USER_NAME_MAX_LENGTH = 60;

export function WelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formId = useId();
  const setupVault = useSetupVault();
  const updateSettings = useUpdateSettings();
  const [name, setName] = useState("");
  const [pickedFolder, setPickedFolder] = useState<string | null>(null);
  const savedFolder = useSettings().data?.vaultPath ?? null;

  const folder = pickedFolder ?? savedFolder;
  const trimmedName = name.trim();
  const hasName = trimmedName !== "";
  const hasFolder = folder !== null;
  const canStart = hasName && hasFolder;
  const isSubmitting = setupVault.isPending || updateSettings.isPending;
  const setupError = setupVault.isError ? setupVault.error : null;
  const hasSetupError = setupError !== null;

  async function pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("welcome.folderDialogTitle"),
    });
    const hasSelection = typeof selected === "string";
    if (hasSelection) {
      setPickedFolder(selected);
      setupVault.reset();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folder === null || !hasName || isSubmitting) {
      return;
    }

    const isFolderChanged = folder !== savedFolder;
    if (isFolderChanged) {
      try {
        await setupVault.mutateAsync({ path: folder, create: true });
      } catch {
        return;
      }
    }
    await updateSettings.mutateAsync({ userName: trimmedName });
    void navigate({ to: "/", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-fg">
      <form
        id={formId}
        onSubmit={(event) => void handleSubmit(event).catch(() => undefined)}
        className="flex w-full max-w-130 flex-col gap-6 rounded-3xl border border-border bg-surface p-8 shadow-md"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <img src={logoUrl} alt="" className="size-14" />
          <h1 className="font-display text-heading-1 font-bold text-fg">{t("welcome.title")}</h1>
          <p className="text-body text-fg-muted">{t("welcome.subtitle")}</p>
        </div>

        <FormField label={t("welcome.nameLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={name}
              maxLength={USER_NAME_MAX_LENGTH}
              placeholder={t("welcome.namePlaceholder")}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-fg">{t("welcome.folderLabel")}</span>
          <p className="text-caption text-fg-muted">{t("welcome.folderHint")}</p>
          <div className="flex items-center gap-3">
            <code className="min-w-0 flex-1 rounded-md bg-surface-muted px-3 py-2 text-caption break-all text-fg-secondary">
              {hasFolder ? folder : t("welcome.noFolder")}
            </code>
            <Button variant="secondary" disabled={isSubmitting} onClick={() => void pickFolder()}>
              {hasFolder ? t("welcome.changeFolder") : t("welcome.chooseFolder")}
            </Button>
          </div>
          {hasSetupError && (
            <p role="alert" className="text-small text-danger-fg">
              {t(getErrorMessageKey(setupError))}
            </p>
          )}
        </div>

        <Button type="submit" form={formId} disabled={!canStart} isLoading={isSubmitting}>
          {t("welcome.start")}
        </Button>
      </form>
    </main>
  );
}
