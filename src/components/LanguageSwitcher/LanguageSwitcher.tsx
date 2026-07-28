import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SUPPORTED_LANGUAGES } from "../../i18n/types";

interface LanguageSwitcherProps {
  /** Icon-rail mode: shows the active language as a button that opens a popup selector. */
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage;

  const options = (
    <ToggleGroup
      type="single"
      value={current}
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

  if (!compact) return options;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full px-0" aria-label={t("language.label")}>
          {current ? t(`language.${current}`) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-auto p-1">
        {options}
      </PopoverContent>
    </Popover>
  );
}
