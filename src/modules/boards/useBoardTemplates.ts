import { useTranslation } from "react-i18next";
import { type BoardTemplate, buildBoardTemplates } from "@/modules/boards/templates";

export function useBoardTemplates(): BoardTemplate[] {
  const { t } = useTranslation();
  return buildBoardTemplates(t);
}
