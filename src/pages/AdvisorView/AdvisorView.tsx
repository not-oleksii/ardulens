import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AdvisorView() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("advisor.heading")}</CardTitle>
        <CardDescription>{t("advisor.description")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
