import { useTranslation } from "react-i18next";

export function GraphsView() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t("graphs.heading")}</h2>
      <p>{t("graphs.description")}</p>
    </section>
  );
}
