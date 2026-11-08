import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/molecules/PageHeader";

export function NotFoundPage() {
  const { t } = useTranslation();

  return <PageHeader title={t("errors.pageNotFound")} />;
}
