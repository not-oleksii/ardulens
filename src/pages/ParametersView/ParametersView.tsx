import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ParametersView() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parameters.heading")}</CardTitle>
        <CardDescription>{t("parameters.description")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
