import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CompareView() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("compare.heading")}</CardTitle>
        <CardDescription>{t("compare.description")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
