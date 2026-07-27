import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SUPPORTED_LANGUAGES } from "../../i18n/types";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <ToggleGroup
      type="single"
      value={i18n.resolvedLanguage}
      onValueChange={(value) => {
        if (value) void i18n.changeLanguage(value);
      }}
      aria-label={t("language.label")}
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <ToggleGroupItem key={lng} value={lng}>
          {t(`language.${lng}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
