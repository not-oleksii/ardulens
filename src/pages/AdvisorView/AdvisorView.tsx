import { useTranslation } from "react-i18next";

export function AdvisorView() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t("advisor.heading")}</h2>
      <p>{t("advisor.description")}</p>
    </section>
  );
}
