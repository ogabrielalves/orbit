import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "@/i18n/en";
import { ptBR } from "@/i18n/pt-BR";
import { resolveLanguage } from "@/i18n/resolveLanguage";

void i18next.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: ptBR },
    en: { translation: en },
  },
  lng: resolveLanguage(navigator.language),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export { i18next };
