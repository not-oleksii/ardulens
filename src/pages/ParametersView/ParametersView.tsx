import { useTranslation } from "react-i18next";

export function ParametersView() {
  const { t } = useTranslation();
  return (
    <section>
      <h2>{t("parameters.heading")}</h2>
      <p>{t("parameters.description")}</p>
    </section>
  );
}
