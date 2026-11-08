import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/molecules/PageHeader";

export function BacklogPage() {
  const { t } = useTranslation();

  return <PageHeader title={t("nav.backlog")} />;
}
