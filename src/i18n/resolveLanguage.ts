export const supportedLanguages = ["pt-BR", "en"] as const;

export type Language = (typeof supportedLanguages)[number];

export function resolveLanguage(languageTag: string): Language {
  const isPortuguese = languageTag.toLowerCase().startsWith("pt");
  return isPortuguese ? "pt-BR" : "en";
}
