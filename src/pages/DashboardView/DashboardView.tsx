import { useTranslation } from "react-i18next";
import { COLUMNS } from "../../analysis/metrics/metrics";

export function DashboardView() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t("dashboard.heading")}</h2>
      <p>{t("dashboard.description")}</p>
      <p className="hint">{t("dashboard.columnsHint", { count: COLUMNS.length })}</p>
    </section>
  );
}
