import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/molecules/PageHeader";

export function BoardPage() {
  const { t } = useTranslation();

  return <PageHeader title={t("nav.boards")} />;
}
