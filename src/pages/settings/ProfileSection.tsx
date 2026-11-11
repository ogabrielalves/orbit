import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Settings } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { USER_NAME_MAX_LENGTH } from "@/modules/settings/limits";
import { useUpdateSettings } from "@/modules/settings/queries";
import { SettingsSection } from "@/pages/settings/SettingsSection";

type ProfileSectionProps = {
  settings: Settings;
};

export function ProfileSection({ settings }: ProfileSectionProps) {
  const { t } = useTranslation();
  const updateSettings = useUpdateSettings();
  const [name, setName] = useState(settings.userName ?? "");

  const trimmedName = name.trim();
  const isBlank = trimmedName === "";
  const isUnchanged = trimmedName === settings.userName;
  const canSave = !isBlank && !isUnchanged && !updateSettings.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    updateSettings.mutate(
      { userName: trimmedName },
      { onSuccess: () => toast.success(t("settings.profile.saved")) },
    );
  }

  return (
    <SettingsSection
      title={t("settings.profile.title")}
      description={t("settings.profile.description")}
    >
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <FormField label={t("settings.profile.nameLabel")}>
            {({ id, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                maxLength={USER_NAME_MAX_LENGTH}
                placeholder={t("settings.profile.namePlaceholder")}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" disabled={!canSave} isLoading={updateSettings.isPending}>
          {t("settings.profile.save")}
        </Button>
      </form>
    </SettingsSection>
  );
}
