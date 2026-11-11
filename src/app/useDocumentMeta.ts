import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const APP_NAME = "ORBIT";
const MAX_TITLE_PARTS = 2;

export function buildDocumentTitle(labels: string[]): string {
  const parts = [...labels].reverse().slice(0, MAX_TITLE_PARTS);
  return [...parts, APP_NAME].join(" · ");
}

export function useDocumentMeta(labels: string[]): string {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const title = buildDocumentTitle(labels);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return title;
}
