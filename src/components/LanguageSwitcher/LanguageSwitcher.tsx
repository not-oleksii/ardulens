import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../../i18n/types";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className="lang-switch" role="group" aria-label={t("language.label")}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          className={i18n.resolvedLanguage === lng ? "lang-btn active" : "lang-btn"}
          onClick={() => void i18n.changeLanguage(lng)}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
