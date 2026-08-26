import { Settings } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  /** Icon-rail mode: shows the trigger as an icon-only button, matching the sidebar's other actions. */
  collapsed?: boolean;
  /** Extra page-specific settings appended below Theme/Language (e.g. ArduPilotSetupView's own
   *  Dev Mode section) - a render prop so that content can close this dialog itself once its own
   *  action (e.g. connecting) completes, without this component needing to know what it renders. */
  children?: (close: () => void) => ReactNode;
}

export function SettingsDialog({ collapsed = false, children }: SettingsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          aria-label={t("sidebar.settings")}
          title={collapsed ? t("sidebar.settings") : undefined}
          className={cn("gap-2", collapsed ? "justify-center px-0" : "justify-start")}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t("sidebar.settings")}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("theme.label")}</span>
            <ThemeSwitcher />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("language.label")}</span>
            <LanguageSwitcher />
          </div>
          {children?.(() => setOpen(false))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
