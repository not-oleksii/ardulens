import { useTranslation } from "react-i18next";
import { useMavlinkParamDefaultsStore } from "../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";

interface ModifiedFromDefaultDotProps {
  name: string;
  value: number;
}

/** A small marker shown next to a parameter's value wherever it's edited outside the main
 *  Parameters table (RC Setup, Motors, Battery, PID Tune) - so a user browsing those dedicated
 *  screens can still see at a glance which values have been tuned away from the vehicle's
 *  factory defaults, without needing to cross-reference the Parameters table's own Default
 *  column. Renders nothing until FTP defaults have actually been downloaded (see
 *  mavlinkParamDefaultsStore, populated from the Parameters tab) or once this value matches its
 *  default again. */
export function ModifiedFromDefaultDot({ name, value }: ModifiedFromDefaultDotProps) {
  const { t } = useTranslation();
  const defaults = useMavlinkParamDefaultsStore((s) => s.defaults);
  if (!defaults || !(name in defaults) || value === defaults[name]) return null;
  const label = t("ardupilotSetup.parameters.changedFromDefault", { default: defaults[name] });
  return <span aria-label={label} title={label} className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />;
}
