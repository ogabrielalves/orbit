import type { ptBR } from "@/i18n/pt-BR";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof ptBR };
  }
}
