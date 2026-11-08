import { useEffect } from "react";
import { i18next } from "@/i18n";
import { useSettings } from "@/modules/settings/queries";

export function useSyncLanguage(): void {
  const { data: settings } = useSettings();
  const language = settings?.language;

  useEffect(() => {
    const hasLanguage = language !== undefined;
    if (hasLanguage) {
      void i18next.changeLanguage(language);
    }
  }, [language]);
}
