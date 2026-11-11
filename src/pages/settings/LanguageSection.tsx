import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Language, Settings } from "@/bindings";
import { Select } from "@/components/atoms/Select";
import { FormField } from "@/components/molecules/FormField";
import { useUpdateSettings } from "@/modules/settings/queries";
import { SettingsSection } from "@/pages/settings/SettingsSection";

const SYSTEM_OPTION = "system";

type LanguageSectionProps = {
  settings: Settings;
};

function toLanguage(value: string): Language | null {
  if (value === "pt-BR" || value === "en") {
    return value;
  }
  return null;
}

export function LanguageSection({ settings }: LanguageSectionProps) {
  const { t } = useTranslation();
  const updateSettings = useUpdateSettings();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    updateSettings.mutate({ language: toLanguage(event.target.value) });
  }

  return (
    <SettingsSection
      title={t("settings.language.title")}
      description={t("settings.language.description")}
    >
      <FormField label={t("settings.language.label")}>
        {({ id }) => (
          <Select
            id={id}
            value={settings.language ?? SYSTEM_OPTION}
            disabled={updateSettings.isPending}
            onChange={handleChange}
          >
            <option value={SYSTEM_OPTION}>{t("settings.language.system")}</option>
            <option value="pt-BR">{t("settings.language.ptBR")}</option>
            <option value="en">{t("settings.language.en")}</option>
          </Select>
        )}
      </FormField>
    </SettingsSection>
  );
}
