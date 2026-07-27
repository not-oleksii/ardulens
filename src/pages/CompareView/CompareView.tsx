import { useTranslation } from "react-i18next";

export function CompareView() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t("compare.heading")}</h2>
      <p>{t("compare.description")}</p>
    </section>
  );
}
