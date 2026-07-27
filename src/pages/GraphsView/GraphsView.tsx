import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GraphsView() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("graphs.heading")}</CardTitle>
        <CardDescription>{t("graphs.description")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
