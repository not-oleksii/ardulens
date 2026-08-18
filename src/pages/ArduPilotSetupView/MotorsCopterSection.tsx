import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MotorFrameDiagram } from "../../components/MotorFrameDiagram/MotorFrameDiagram";
import { frameDiagramMotors, MOTOR_DIRECTION_COLORS, motorCountForFrameClass } from "../../mavlink/frameDiagrams/frameDiagrams";
import { MavParamType } from "../../mavlink/registry/registry";
import { fetchParamDocs, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";

interface MotorsCopterSectionProps {
  servoOutputs: Record<number, number>;
  onLoadMotorSetup: () => void;
  onSetFrameParam: (name: string, value: number, type: MavParamType) => void;
  onTestMotor: (instance: number, throttlePercent: number) => void;
  onReboot: () => void;
}

// Visible enough to confirm which motor spins without meaningfully lifting a propeller-on
// motor - matches Mission Planner's own default motor-test throttle.
const TEST_THROTTLE_PERCENT = 10;

type WizardStep = "frame" | "test" | "reboot" | "done";
// Order only, not a gate - every tab below is clickable at any time so a user who already has
// a working frame can jump straight to "Test & Reverse" for a quick spin-check or reverse
// tweak instead of walking back through frame selection first.
const STEPS: WizardStep[] = ["frame", "test", "reboot", "done"];

function DirectionLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: MOTOR_DIRECTION_COLORS.CW }} />
        {t("ardupilotSetup.motorsServos.wizard.legendCw")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: MOTOR_DIRECTION_COLORS.CCW }} />
        {t("ardupilotSetup.motorsServos.wizard.legendCcw")}
      </span>
    </div>
  );
}

export function MotorsCopterSection({
  servoOutputs,
  onLoadMotorSetup,
  onSetFrameParam,
  onTestMotor,
  onReboot,
}: MotorsCopterSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [activeMotor, setActiveMotor] = useState<number | null>(null);
  const [step, setStep] = useState<WizardStep>("frame");
  // Tracks which motors have been spin-tested this session, purely as a checklist so the user
  // can see at a glance what they've verified - it's a soft guide, not a gate: every step stays
  // reachable via the tabs regardless of test progress.
  const [testedMotors, setTestedMotors] = useState<Set<number>>(new Set());
  const [rebootSent, setRebootSent] = useState(false);

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

  // A new frame class/type can mean a different motor count or layout - previous test marks
  // no longer mean anything once that happens, so they reset along with it. Adjusted during
  // render (React's documented pattern for "reset state when a value changes") rather than in
  // an effect, so it doesn't cost an extra render pass.
  const frameKey = hasLoaded ? `${frameClassEntry.value}:${frameTypeEntry.value}` : null;
  const [prevFrameKey, setPrevFrameKey] = useState(frameKey);
  if (frameKey !== prevFrameKey) {
    setPrevFrameKey(frameKey);
    setTestedMotors(new Set());
    setRebootSent(false);
  }

  const motors = hasLoaded ? frameDiagramMotors(frameClassEntry.value, frameTypeEntry.value) : null;
  const fallbackMotorCount = hasLoaded ? motorCountForFrameClass(frameClassEntry.value) : null;
  const motorNumbers = motors
    ? motors.map((m) => m.motor)
    : fallbackMotorCount
      ? Array.from({ length: fallbackMotorCount }, (_, i) => i + 1)
      : [];

  function startTest(motor: number) {
    setActiveMotor(motor);
    setTestedMotors((prev) => (prev.has(motor) ? prev : new Set(prev).add(motor)));
    onTestMotor(motor, TEST_THROTTLE_PERCENT);
  }

  function stopTest(motor: number) {
    setActiveMotor(null);
    onTestMotor(motor, 0);
  }

  // SERVOx_REVERSED is a real, generic ArduPilot param every servo/motor output has (confirmed
  // against ArduCopter's own apm.pdef.xml) - flips a DShot ESC's spin direction on its next
  // arm/reboot without needing to physically swap wires. It does nothing for plain PWM/OneShot
  // ESCs, which still need rewiring - the UI note below says so rather than overclaiming.
  function reverseCheckbox(motor: number) {
    const entry = params[`SERVO${motor}_REVERSED`];
    const isReversed = entry?.value === 1;
    return (
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={isReversed}
          onChange={(e) =>
            onSetFrameParam(`SERVO${motor}_REVERSED`, e.target.checked ? 1 : 0, entry?.type ?? MavParamType.INT8)
          }
        />
        {t("ardupilotSetup.motorsServos.reverseMotor")}
      </label>
    );
  }

  if (!hasLoaded) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
          <Button type="button" size="sm" onClick={onLoadMotorSetup}>
            {t("ardupilotSetup.motorsServos.loadMotorSetup")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.frameNotLoaded")}</p>
      </div>
    );
  }

  const frameClassLabel = docs?.FRAME_CLASS?.values?.[frameClassEntry.value] ?? String(frameClassEntry.value);
  const frameTypeLabel = docs?.FRAME_TYPE?.values?.[frameTypeEntry.value] ?? String(frameTypeEntry.value);
  const reversedMotors = motorNumbers.filter((n) => params[`SERVO${n}_REVERSED`]?.value === 1);
  const frameConfirmed = !frameClassEntry.dirty && !frameTypeEntry.dirty;

  return (
    <div className="flex h-full flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-border pb-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={step === s}
            onClick={() => setStep(s)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
              step === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {i + 1}. {t(`ardupilotSetup.motorsServos.wizard.step.${s}`)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === "frame" && (
          <div className="flex flex-col gap-3">
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
            <Button type="button" size="sm" className="w-fit self-end" onClick={() => setStep("test")}>
              {t("ardupilotSetup.motorsServos.wizard.next")}
            </Button>
          </div>
        )}

        {step === "test" && (
          <div className="flex flex-col gap-3">
            <Alert variant="warning" className="shrink-0">
              <AlertDescription>{t("ardupilotSetup.motorsServos.motorSafetyWarning")}</AlertDescription>
            </Alert>
            <DirectionLegend />
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.wizard.testAllPrompt")}</p>
            <p className="text-xs font-semibold">
              {t("ardupilotSetup.motorsServos.wizard.testProgress", { tested: testedMotors.size, total: motorNumbers.length })}
            </p>

            {motors ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <MotorFrameDiagram motors={motors} activeMotor={activeMotor} onTestStart={startTest} onTestStop={stopTest} />
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                  {motors.map(({ motor }) => (
                    <div key={motor} className="flex flex-col items-center gap-0.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {testedMotors.has(motor) ? "✓ " : ""}
                        {motor}: {servoOutputs[motor] !== undefined ? `${servoOutputs[motor]} us` : "-"}
                      </span>
                      {reverseCheckbox(motor)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.diagramUnavailable")}</p>
                <div className="flex flex-wrap gap-3">
                  {motorNumbers.map((motor) => (
                    <div key={motor} className="flex flex-col items-center gap-1">
                      <Button
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
                        {testedMotors.has(motor) ? "✓ " : ""}
                        {t("ardupilotSetup.motorsServos.holdToTestMotor")} {motor}
                        {servoOutputs[motor] !== undefined ? ` (${servoOutputs[motor]} us)` : ""}
                      </Button>
                      {reverseCheckbox(motor)}
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.reverseNote")}</p>

            <div className="flex justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep("frame")}>
                {t("ardupilotSetup.motorsServos.wizard.back")}
              </Button>
              <Button type="button" size="sm" onClick={() => setStep("reboot")}>
                {t("ardupilotSetup.motorsServos.wizard.next")}
              </Button>
            </div>
          </div>
        )}

        {step === "reboot" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-card p-3 text-xs">
              <p className="font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.wizard.rebootSummaryHeading")}</p>
              <p>{t("ardupilotSetup.motorsServos.wizard.rebootSummaryFrame", { frame: `${frameClassLabel} / ${frameTypeLabel}` })}</p>
              <p>
                {reversedMotors.length > 0
                  ? t("ardupilotSetup.motorsServos.wizard.rebootSummaryReversed", { list: reversedMotors.join(", ") })
                  : t("ardupilotSetup.motorsServos.wizard.rebootSummaryNoneReversed")}
              </p>
            </div>
            <Alert variant="warning" className="shrink-0">
              <AlertDescription>{t("ardupilotSetup.motorsServos.rebootRequiredWarning")}</AlertDescription>
            </Alert>
            <Button
              type="button"
              size="sm"
              className="w-fit"
              onClick={() => {
                onReboot();
                setRebootSent(true);
              }}
            >
              {t("ardupilotSetup.motorsServos.rebootNow")}
            </Button>
            {rebootSent && (
              <Alert variant="info" className="shrink-0">
                <AlertDescription>{t("ardupilotSetup.motorsServos.wizard.rebootSent")}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep("test")}>
                {t("ardupilotSetup.motorsServos.wizard.back")}
              </Button>
              <Button type="button" size="sm" disabled={!rebootSent} onClick={() => setStep("done")}>
                {t("ardupilotSetup.motorsServos.wizard.continueToSummary")}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.wizard.doneHeading")}</h4>
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {t("ardupilotSetup.motorsServos.wizard.rebootSummaryFrame", { frame: `${frameClassLabel} / ${frameTypeLabel}` })}
                </span>
                <span className={frameConfirmed ? "text-primary" : "text-muted-foreground"}>
                  {frameConfirmed ? t("ardupilotSetup.motorsServos.wizard.confirmed") : t("ardupilotSetup.motorsServos.wizard.pending")}
                </span>
              </div>
              {motorNumbers.map((n) => {
                const entry = params[`SERVO${n}_REVERSED`];
                if (entry?.value !== 1) return null;
                const confirmed = !entry.dirty;
                return (
                  <div key={n} className="flex items-center justify-between gap-2">
                    <span>{t("ardupilotSetup.motorsServos.wizard.reversedMotorLabel", { motor: n })}</span>
                    <span className={confirmed ? "text-primary" : "text-muted-foreground"}>
                      {confirmed ? t("ardupilotSetup.motorsServos.wizard.confirmed") : t("ardupilotSetup.motorsServos.wizard.pending")}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {testedMotors.size > 0
                ? t("ardupilotSetup.motorsServos.wizard.testedSummary", {
                    list: Array.from(testedMotors)
                      .sort((a, b) => a - b)
                      .join(", "),
                  })
                : t("ardupilotSetup.motorsServos.wizard.notTestedThisSession")}
            </p>
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setStep("test")}>
                {t("ardupilotSetup.motorsServos.wizard.editSettings")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setStep("frame");
                  setTestedMotors(new Set());
                }}
              >
                {t("ardupilotSetup.motorsServos.wizard.startOver")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
