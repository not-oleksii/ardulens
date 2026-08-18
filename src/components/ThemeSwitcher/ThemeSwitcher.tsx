import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { THEME_MODES, useThemeStore, type ThemeMode } from "@/stores/themeStore/themeStore";

interface ThemeSwitcherProps {
  /** Icon-rail mode: shows the active mode as a button that opens a popup selector. */
  compact?: boolean;
}

const MODE_ICONS = { light: Sun, dark: Moon, system: Monitor } as const satisfies Record<ThemeMode, typeof Sun>;

export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const CurrentIcon = MODE_ICONS[mode];

  const options = (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => {
        if (value) setMode(value as ThemeMode);
      }}
      aria-label={t("theme.label")}
    >
      {THEME_MODES.map((m) => {
        const Icon = MODE_ICONS[m];
        return (
          <ToggleGroupItem key={m} value={m} aria-label={t(`theme.${m}`)} title={t(`theme.${m}`)}>
            <Icon className="h-4 w-4" />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );

  if (!compact) return options;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full px-0" aria-label={t("theme.label")}>
          <CurrentIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-auto p-1">
        {options}
      </PopoverContent>
    </Popover>
  );
}
