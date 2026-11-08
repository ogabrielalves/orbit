import { useEffect } from "react";
import { i18next } from "@/i18n";
import { resolveLanguage } from "@/i18n/resolveLanguage";
import { useSettings } from "@/modules/settings/queries";

export function useSyncLanguage(): void {
  const { data: settings } = useSettings();
  const areSettingsLoaded = settings !== undefined;
  const savedLanguage = settings?.language ?? null;

  useEffect(() => {
    if (!areSettingsLoaded) {
      return;
    }
    const targetLanguage = savedLanguage ?? resolveLanguage(navigator.language);
    void i18next.changeLanguage(targetLanguage);
  }, [areSettingsLoaded, savedLanguage]);
}
