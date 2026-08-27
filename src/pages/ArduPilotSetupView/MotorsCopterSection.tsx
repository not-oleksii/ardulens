import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MotorFrameDiagram } from "../../components/MotorFrameDiagram/MotorFrameDiagram";
import {
  FRAME_CLASS_NAMES,
  FRAME_TYPE_NAMES,
  frameDiagramMotors,
  MOTOR_DIRECTION_COLORS,
  motorCountForFrameClass,
} from "../../mavlink/frameDiagrams/frameDiagrams";
import { MavParamType } from "../../mavlink/registry/registry";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { useParamDocs } from "./useParamDocs";
import { useStagedParamChanges } from "./useStagedParamChanges";

interface MotorsCopterSectionProps {
  servoOutputs: Record<number, number>;
  onLoadMotorSetup: () => void;
  onSetFrameParam: (name: string, value: number, type: MavParamType) => void;
  onTestMotor: (instance: number, throttlePercent: number) => void;
  onReboot: () => void;
}

// Visible enough to confirm which motor spins without meaningfully lifting a propeller-on
// motor. Adjustable in the UI (see testThrottlePercent state below) rather than fixed, but
// this is the starting value and the floor/ceiling of that control.
const DEFAULT_TEST_THROTTLE_PERCENT = 10;
const MIN_TEST_THROTTLE_PERCENT = 5;
const MAX_TEST_THROTTLE_PERCENT = 40;

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
  const [activeMotor, setActiveMotor] = useState<number | null>(null);
  const [step, setStep] = useState<WizardStep>("frame");
  // Tracks which motors have been spin-tested this session, purely as a checklist so the user
  // can see at a glance what they've verified - it's a soft guide, not a gate: every step stays
  // reachable via the tabs regardless of test progress.
  const [testedMotors, setTestedMotors] = useState<Set<number>>(new Set());
  const [rebootSent, setRebootSent] = useState(false);
  const [testThrottlePercent, setTestThrottlePercent] = useState(DEFAULT_TEST_THROTTLE_PERCENT);
  // FRAME_CLASS/FRAME_TYPE/SERVOx_REVERSED edits stage here (same shape/semantics as
  // ParametersPanel's own pendingChanges) instead of sending immediately - unified in Wave 2 of
  // the UI/UX audit, this used to be one of 3 different param-edit commit models the app had.
  // Motor-test throttle/identification below is NOT staged - those are live test commands, not
  // config, and must stay instant per the same audit's own safety-critical-controls note.
  // Frame class/type labels are a nice-to-have - the raw numeric codes still work without them.
  const { docs } = useParamDocs("ArduCopter");
  // FRAME_CLASS/FRAME_TYPE/SERVOx_REVERSED edits stage here - only the shared state/reset/
  // unsaved-guard half of the hook is used, since this section's save-all needs a FRAME_CLASS/
  // FRAME_TYPE/REVERSED-specific type fallback the hook's generic logic doesn't have (see
  // handleConfirmSaveAll below, kept local).
  const { pendingChanges, setPendingChanges, pendingEntries, hasPendingChanges, confirmOpen, setConfirmOpen, resetAll: handleResetAll } =
    useStagedParamChanges({ params, onSetParam: onSetFrameParam, trackUnsaved: true });

  // Guided identification: the app drives each output one at a time instead of the user
  // picking which to spin - the user's job is just to watch the real propeller and
  // click the diagram position (or fallback button) where they see it actually spinning. A
  // mismatch (clicked position != the output that was actually driven) is a real wiring/frame
  // problem worth flagging, not just a missed click - see confirmIdentifyClick below.
  const [identifying, setIdentifying] = useState(false);
  const [identifyIndex, setIdentifyIndex] = useState(0);
  const [identifyMismatches, setIdentifyMismatches] = useState<Record<number, number>>({});

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
    setIdentifying(false);
    setIdentifyIndex(0);
    setIdentifyMismatches({});
  }

  const motors = hasLoaded ? frameDiagramMotors(frameClassEntry.value, frameTypeEntry.value) : null;
  const fallbackMotorCount = hasLoaded ? motorCountForFrameClass(frameClassEntry.value) : null;
  const motorNumbers = motors
    ? motors.map((m) => m.motor)
    : fallbackMotorCount
      ? Array.from({ length: fallbackMotorCount }, (_, i) => i + 1)
      : [];

  // Leaving the Test & Reverse step mid-identification would otherwise leave a motor spinning
  // in the background with no visible indication - stop it the moment the user looks away.
  // State resets happen during render (same pattern as the frame-key reset above, no refs
  // touched there). The ref itself is only ever read/written inside effects (never during
  // render, which React disallows) - one effect keeps it mirroring the latest activeMotor, a
  // second fires the actual external stop command when step leaves "test" and nothing else
  // (no setState), since only that part is a real effect synchronizing with the vehicle.
  const motorToStopOnLeaveRef = useRef<number | null>(null);
  useEffect(() => {
    motorToStopOnLeaveRef.current = activeMotor;
  }, [activeMotor]);

  const [prevStep, setPrevStep] = useState(step);
  if (step !== prevStep) {
    setPrevStep(step);
    if (step !== "test") {
      setIdentifying(false);
      setActiveMotor(null);
    }
  }

  useEffect(() => {
    if (step === "test") return;
    const motor = motorToStopOnLeaveRef.current;
    if (motor === null) return;
    motorToStopOnLeaveRef.current = null;
    onTestMotor(motor, 0);
  }, [step, onTestMotor]);

  function startTest(motor: number) {
    setActiveMotor(motor);
    setTestedMotors((prev) => (prev.has(motor) ? prev : new Set(prev).add(motor)));
    onTestMotor(motor, testThrottlePercent);
  }

  function stopTest(motor: number) {
    setActiveMotor(null);
    onTestMotor(motor, 0);
  }

  function startIdentify() {
    if (!motors || motors.length === 0) return;
    setIdentifying(true);
    setIdentifyIndex(0);
    setIdentifyMismatches({});
    const first = motors[0]!;
    setActiveMotor(first.motor);
    onTestMotor(first.motor, testThrottlePercent);
  }

  function stopIdentify() {
    if (activeMotor !== null) onTestMotor(activeMotor, 0);
    setActiveMotor(null);
    setIdentifying(false);
  }

  function confirmIdentifyClick(clickedMotor: number) {
    if (!motors || identifyIndex >= motors.length) return;
    const expected = motors[identifyIndex]!.motor;
    onTestMotor(expected, 0);
    setTestedMotors((prev) => new Set(prev).add(expected));
    if (clickedMotor !== expected) {
      setIdentifyMismatches((prev) => ({ ...prev, [expected]: clickedMotor }));
    }
    const nextIndex = identifyIndex + 1;
    setIdentifyIndex(nextIndex);
    if (nextIndex >= motors.length) {
      setActiveMotor(null);
      setIdentifying(false);
      return;
    }
    const next = motors[nextIndex]!;
    setActiveMotor(next.motor);
    onTestMotor(next.motor, testThrottlePercent);
  }

  // A single, always-reachable kill switch for the whole Test & Reverse step - one obvious
  // "stop everything now" control, rather than relying only on releasing a held button (which
  // a mismatched pointerup/leave could miss) or waiting for guided identification's own
  // per-step stop.
  function stopAllMotors() {
    if (activeMotor !== null) onTestMotor(activeMotor, 0);
    setActiveMotor(null);
    setIdentifying(false);
  }

  function stageParam(name: string, value: number, original: number) {
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (value === original) delete next[name]; // editing back to the original un-stages it
      else next[name] = value;
      return next;
    });
  }

  function handleConfirmSaveAll() {
    for (const [name, value] of pendingEntries) {
      const type =
        name === "FRAME_CLASS" ? frameClassEntry?.type : name === "FRAME_TYPE" ? frameTypeEntry?.type : (params[name]?.type ?? MavParamType.INT8);
      if (type !== undefined) onSetFrameParam(name, value, type);
    }
    setPendingChanges({});
    setConfirmOpen(false);
  }

  // SERVOx_REVERSED is a real, generic ArduPilot param every servo/motor output has (confirmed
  // against ArduCopter's own apm.pdef.xml) - flips a DShot ESC's spin direction on its next
  // arm/reboot without needing to physically swap wires. It does nothing for plain PWM/OneShot
  // ESCs, which still need rewiring - the UI note below says so rather than overclaiming.
  function reverseCheckbox(motor: number) {
    const name = `SERVO${motor}_REVERSED`;
    const entry = params[name];
    const original = entry?.value ?? 0;
    const shownValue = pendingChanges[name] ?? original;
    const isReversed = shownValue === 1;
    return (
      <label className="flex items-center gap-1 text-xs">
        <input
          type="checkbox"
          checked={isReversed}
          onChange={(e) => stageParam(name, e.target.checked ? 1 : 0, original)}
        />
        {t("ardupilotSetup.motorsServos.reverseMotor")}
        {pendingChanges[name] !== undefined ? (
          <span className="text-primary">{t("ardupilotSetup.parameters.modified")}</span>
        ) : (
          entry && <ModifiedFromDefaultDot name={name} value={entry.value} />
        )}
      </label>
    );
  }

  if (!hasLoaded) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
          <Button type="button" size="sm" variant="outline" onClick={onLoadMotorSetup}>
            {t("ardupilotSetup.motorsServos.loadMotorSetup")}
          </Button>
        </div>
        <ParamLoadProgress />
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.frameNotLoaded")}</p>
      </div>
    );
  }

  const shownFrameClass = pendingChanges.FRAME_CLASS ?? frameClassEntry.value;
  const shownFrameType = pendingChanges.FRAME_TYPE ?? frameTypeEntry.value;
  const frameClassLabel = docs?.FRAME_CLASS?.values?.[shownFrameClass] ?? FRAME_CLASS_NAMES[shownFrameClass] ?? String(shownFrameClass);
  const frameTypeLabel = docs?.FRAME_TYPE?.values?.[shownFrameType] ?? FRAME_TYPE_NAMES[shownFrameType] ?? String(shownFrameType);
  const reversedMotors = motorNumbers.filter((n) => (pendingChanges[`SERVO${n}_REVERSED`] ?? params[`SERVO${n}_REVERSED`]?.value) === 1);
  const frameConfirmed = !frameClassEntry.dirty && !frameTypeEntry.dirty;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
        {hasPendingChanges && (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
              {t("ardupilotSetup.parameters.reset")}
            </Button>
            <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
              {t("ardupilotSetup.parameters.saveAll", { count: pendingEntries.length })}
            </Button>
          </div>
        )}
      </div>

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
                <span className="flex items-center gap-1.5 font-bold tracking-wide uppercase">
                  {t("ardupilotSetup.motorsServos.frameClass")}
                  <ModifiedFromDefaultDot name="FRAME_CLASS" value={shownFrameClass} />
                </span>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1"
                  value={shownFrameClass}
                  onChange={(e) => stageParam("FRAME_CLASS", Number(e.target.value), frameClassEntry.value)}
                >
                  {Object.entries(docs?.FRAME_CLASS?.values ?? FRAME_CLASS_NAMES).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                  {/* The vehicle's actual current value always stays selectable/shown, even if
                      it's a code neither source above happens to list (e.g. a newer firmware
                      class this app doesn't know about yet). */}
                  {!(shownFrameClass in (docs?.FRAME_CLASS?.values ?? FRAME_CLASS_NAMES)) && (
                    <option value={shownFrameClass}>{shownFrameClass}</option>
                  )}
                </select>
                {pendingChanges.FRAME_CLASS !== undefined && (
                  <span className="text-xs text-primary">{t("ardupilotSetup.parameters.modified")}</span>
                )}
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="flex items-center gap-1.5 font-bold tracking-wide uppercase">
                  {t("ardupilotSetup.motorsServos.frameType")}
                  <ModifiedFromDefaultDot name="FRAME_TYPE" value={shownFrameType} />
                </span>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1"
                  value={shownFrameType}
                  onChange={(e) => stageParam("FRAME_TYPE", Number(e.target.value), frameTypeEntry.value)}
                >
                  {Object.entries(docs?.FRAME_TYPE?.values ?? FRAME_TYPE_NAMES).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                  {!(shownFrameType in (docs?.FRAME_TYPE?.values ?? FRAME_TYPE_NAMES)) && (
                    <option value={shownFrameType}>{shownFrameType}</option>
                  )}
                </select>
                {pendingChanges.FRAME_TYPE !== undefined && (
                  <span className="text-xs text-primary">{t("ardupilotSetup.parameters.modified")}</span>
                )}
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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-xs">
                <span className="font-bold tracking-wide uppercase text-muted-foreground">
                  {t("ardupilotSetup.motorsServos.wizard.testThrottle")}
                </span>
                <input
                  type="range"
                  min={MIN_TEST_THROTTLE_PERCENT}
                  max={MAX_TEST_THROTTLE_PERCENT}
                  value={testThrottlePercent}
                  onChange={(e) => setTestThrottlePercent(Number(e.target.value))}
                  className="w-32"
                />
                <span className="w-10 font-mono">{testThrottlePercent}%</span>
              </label>
              {/* A single, always-reachable kill switch - see stopAllMotors's own comment for
                  why this exists alongside per-motor hold-to-release and identification's own
                  stop button. */}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={activeMotor === null}
                onClick={stopAllMotors}
              >
                {t("ardupilotSetup.motorsServos.wizard.stopAllMotors")}
              </Button>
            </div>

            <DirectionLegend />

            <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                {t("ardupilotSetup.motorsServos.wizard.identifyHeading")}
              </h4>
              {!identifying && identifyIndex === 0 && (
                <>
                  <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.wizard.identifyIntro")}</p>
                  <Button type="button" size="sm" className="w-fit" onClick={startIdentify}>
                    {t("ardupilotSetup.motorsServos.wizard.identifyStart")}
                  </Button>
                </>
              )}
              {identifying && (
                <>
                  <p className="text-xs font-semibold">
                    {t("ardupilotSetup.motorsServos.wizard.identifySpinning", { motor: activeMotor })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("ardupilotSetup.motorsServos.wizard.identifyProgress", {
                      current: identifyIndex + 1,
                      total: motorNumbers.length,
                    })}
                  </p>
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={stopIdentify}>
                    {t("ardupilotSetup.motorsServos.wizard.identifyStop")}
                  </Button>
                </>
              )}
              {!identifying && identifyIndex >= motorNumbers.length && motorNumbers.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-primary">{t("ardupilotSetup.motorsServos.wizard.identifyDone")}</p>
                  {Object.keys(identifyMismatches).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.wizard.identifyAllConfirmed")}</p>
                  ) : (
                    <Alert variant="destructive" className="shrink-0">
                      <AlertDescription className="flex flex-col gap-1">
                        {Object.entries(identifyMismatches).map(([expected, clicked]) => (
                          <span key={expected}>
                            {t("ardupilotSetup.motorsServos.wizard.identifyMismatch", { expected, clicked })}
                          </span>
                        ))}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button type="button" size="sm" variant="outline" className="w-fit" onClick={startIdentify}>
                    {t("ardupilotSetup.motorsServos.wizard.identifyRestart")}
                  </Button>
                </>
              )}
            </section>

            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
              {t("ardupilotSetup.motorsServos.wizard.manualHeading")}
            </h4>
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.wizard.testAllPrompt")}</p>
            <p className="text-xs font-semibold">
              {t("ardupilotSetup.motorsServos.wizard.testProgress", { tested: testedMotors.size, total: motorNumbers.length })}
            </p>

            {motors ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <MotorFrameDiagram
                  motors={motors}
                  activeMotor={activeMotor}
                  onTestStart={identifying ? confirmIdentifyClick : startTest}
                  onTestStop={identifying ? () => {} : stopTest}
                />
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
                  {motorNumbers.map((motor) =>
                    identifying ? (
                      <div key={motor} className="flex flex-col items-center gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => confirmIdentifyClick(motor)}>
                          {testedMotors.has(motor) ? "✓ " : ""}
                          {motor}
                          {servoOutputs[motor] !== undefined ? ` (${servoOutputs[motor]} us)` : ""}
                        </Button>
                        {reverseCheckbox(motor)}
                      </div>
                    ) : (
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
                    ),
                  )}
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
            {/* Once the reboot's actually been sent, "still needs a reboot" is no longer true -
                the rebootSent Alert below takes over as the current-state message instead of
                stacking on top of this one, which would otherwise read as contradictory. */}
            {!rebootSent && (
              <Alert variant="warning" className="shrink-0">
                <AlertDescription>{t("ardupilotSetup.motorsServos.rebootRequiredWarning")}</AlertDescription>
              </Alert>
            )}
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
                <Badge variant={frameConfirmed ? "good" : "neutral"}>
                  {frameConfirmed ? t("ardupilotSetup.motorsServos.wizard.confirmed") : t("ardupilotSetup.motorsServos.wizard.pending")}
                </Badge>
              </div>
              {motorNumbers.map((n) => {
                const entry = params[`SERVO${n}_REVERSED`];
                if (entry?.value !== 1) return null;
                const confirmed = !entry.dirty;
                return (
                  <div key={n} className="flex items-center justify-between gap-2">
                    <span>{t("ardupilotSetup.motorsServos.wizard.reversedMotorLabel", { motor: n })}</span>
                    <Badge variant={confirmed ? "good" : "neutral"}>
                      {confirmed ? t("ardupilotSetup.motorsServos.wizard.confirmed") : t("ardupilotSetup.motorsServos.wizard.pending")}
                    </Badge>
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.parameters.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("ardupilotSetup.parameters.confirmDescription", { count: pendingEntries.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.to")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono">{name}</TableCell>
                    <TableCell className="font-mono">{params[name]?.value}</TableCell>
                    <TableCell className="font-mono">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("ardupilotSetup.parameters.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.parameters.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
