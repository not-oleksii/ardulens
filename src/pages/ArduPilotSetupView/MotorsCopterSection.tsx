import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MotorFrameDiagram } from "../../components/MotorFrameDiagram/MotorFrameDiagram";
import { frameDiagramMotors, motorCountForFrameClass } from "../../mavlink/frameDiagrams/frameDiagrams";
import type { MavParamType } from "../../mavlink/registry/registry";
import { fetchParamDocs, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";

interface MotorsCopterSectionProps {
  servoOutputs: Record<number, number>;
  onLoadFrameInfo: () => void;
  onSetFrameParam: (name: string, value: number, type: MavParamType) => void;
  onTestMotor: (instance: number, throttlePercent: number) => void;
}

// Visible enough to confirm which motor spins without meaningfully lifting a propeller-on
// motor - matches Mission Planner's own default motor-test throttle.
const TEST_THROTTLE_PERCENT = 10;

export function MotorsCopterSection({ servoOutputs, onLoadFrameInfo, onSetFrameParam, onTestMotor }: MotorsCopterSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [activeMotor, setActiveMotor] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs("ArduCopter")
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Frame class/type labels are a nice-to-have - the raw numeric codes still work.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const frameClassEntry = params.FRAME_CLASS;
  const frameTypeEntry = params.FRAME_TYPE;
  const hasLoaded = frameClassEntry !== undefined && frameTypeEntry !== undefined;

  const motors = hasLoaded ? frameDiagramMotors(frameClassEntry.value, frameTypeEntry.value) : null;
  const fallbackMotorCount = hasLoaded ? motorCountForFrameClass(frameClassEntry.value) : null;

  function startTest(motor: number) {
    setActiveMotor(motor);
    onTestMotor(motor, TEST_THROTTLE_PERCENT);
  }

  function stopTest(motor: number) {
    setActiveMotor(null);
    onTestMotor(motor, 0);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
        {!hasLoaded && (
          <Button type="button" size="sm" onClick={onLoadFrameInfo}>
            {t("ardupilotSetup.motorsServos.loadFrameInfo")}
          </Button>
        )}
      </div>

      {!hasLoaded ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.frameNotLoaded")}</p>
      ) : (
        <>
          <Alert variant="warning" className="shrink-0">
            <AlertDescription>{t("ardupilotSetup.motorsServos.rebootRequiredWarning")}</AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.frameClass")}</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1"
                value={frameClassEntry.value}
                onChange={(e) => onSetFrameParam("FRAME_CLASS", Number(e.target.value), frameClassEntry.type)}
              >
                {docs?.FRAME_CLASS?.values ? (
                  Object.entries(docs.FRAME_CLASS.values).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))
                ) : (
                  <option value={frameClassEntry.value}>{frameClassEntry.value}</option>
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.frameType")}</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1"
                value={frameTypeEntry.value}
                onChange={(e) => onSetFrameParam("FRAME_TYPE", Number(e.target.value), frameTypeEntry.type)}
              >
                {docs?.FRAME_TYPE?.values ? (
                  Object.entries(docs.FRAME_TYPE.values).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))
                ) : (
                  <option value={frameTypeEntry.value}>{frameTypeEntry.value}</option>
                )}
              </select>
            </label>
          </div>

          <Alert variant="warning" className="shrink-0">
            <AlertDescription>{t("ardupilotSetup.motorsServos.motorSafetyWarning")}</AlertDescription>
          </Alert>

          {motors ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <MotorFrameDiagram motors={motors} activeMotor={activeMotor} onTestStart={startTest} onTestStop={stopTest} />
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                {motors.map(({ motor }) => (
                  <span key={motor}>
                    {motor}: {servoOutputs[motor] !== undefined ? `${servoOutputs[motor]} us` : "-"}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.diagramUnavailable")}</p>
              {fallbackMotorCount !== null && (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: fallbackMotorCount }, (_, i) => i + 1).map((motor) => (
                    <Button
                      key={motor}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="touch-none select-none"
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        startTest(motor);
                      }}
                      onPointerUp={() => stopTest(motor)}
                      onPointerLeave={() => stopTest(motor)}
                      onPointerCancel={() => stopTest(motor)}
                    >
                      {t("ardupilotSetup.motorsServos.holdToTestMotor")} {motor}
                      {servoOutputs[motor] !== undefined ? ` (${servoOutputs[motor]} us)` : ""}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
