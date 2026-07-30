import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Finding, Severity } from "../../analysis/advisors/types";
import type { FindingsBadgeProps } from "./types";

const SEVERITY_RANK: Severity[] = ["critical", "warning", "info"];

const BADGE_STYLES: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive hover:bg-destructive/25",
  warning: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-400",
  info: "bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:text-blue-400",
};

const ICON_STYLES: Record<Severity, string> = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-blue-600 dark:text-blue-400",
};

function worstSeverity(findings: Finding[]): Severity {
  return SEVERITY_RANK.find((s) => findings.some((f) => f.severity === s)) ?? "info";
}

function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const cls = cn(className, ICON_STYLES[severity]);
  return severity === "info" ? <Info className={cls} aria-hidden /> : <AlertTriangle className={cls} aria-hidden />;
}

/**
 * Reusable anomaly indicator: drops into any page that has a Finding[] (from
 * analysis/advisors) to surface. Shows a quiet "no issues" mark when the list is empty,
 * otherwise a compact severity-colored badge that opens a popover with full details.
 */
export function FindingsBadge({ findings }: FindingsBadgeProps) {
  const { t } = useTranslation();

  if (findings.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-500" aria-hidden />
        {t("findings.ok")}
      </span>
    );
  }

  const worst = worstSeverity(findings);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("findings.ariaLabel", { count: findings.length })}
          className={cn("h-auto gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", BADGE_STYLES[worst])}
        >
          <SeverityIcon severity={worst} className="h-3.5 w-3.5" />
          {findings.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <ul className="flex flex-col gap-2">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-sm">
              <SeverityIcon severity={f.severity} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t(f.messageKey, f.params)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
