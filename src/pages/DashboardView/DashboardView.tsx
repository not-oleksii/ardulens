import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COLUMNS } from "../../analysis/metrics/metrics";

export function DashboardView() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.heading")}</CardTitle>
        <CardDescription>{t("dashboard.description")}</CardDescription>
      </CardHeader>
      <CardContent>{t("dashboard.columnsHint", { count: COLUMNS.length })}</CardContent>
    </Card>
  );
}
