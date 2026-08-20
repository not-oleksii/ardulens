import { useTranslation } from "react-i18next";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";

/** Shared "downloading parameters..." progress bar, shown by every setup section while the
 *  connect-time full parameter list download (see ArduPilotSetupView's fullParamsRequestedRef
 *  effect) is still in progress - renders nothing once it's done, or before a vehicle has
 *  reported anything yet, matching Mission Planner's own progress bar shown right after
 *  connecting rather than a per-section "Load" gate. */
export function ParamLoadProgress() {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const expectedCount = useMavlinkParameterStore((s) => s.expectedCount);

  if (expectedCount === null || expectedCount === 0) return null;
  const received = Object.keys(params).length;
  if (received >= expectedCount) return null;

  const pct = Math.min(100, Math.round((received / expectedCount) * 100));
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.paramLoadProgress", { received, total: expectedCount })}</p>
      <div data-testid="param-load-progress" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
