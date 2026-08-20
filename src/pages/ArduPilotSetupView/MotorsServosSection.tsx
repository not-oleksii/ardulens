import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MavParamType, type MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ComingSoonSection } from "./ComingSoonSection";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { MotorsCopterSection } from "./MotorsCopterSection";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { colorForRcChannel } from "./rcChannelColors";

interface MotorsServosSectionProps {
  vehicleType: MavType;
  servoOutputs: Record<number, number>;
  onLoad: () => void;
  onTestServo: (channel: number, pwm: number) => void;
  onLoadMotorSetup: () => void;
  onSetFrameParam: (name: string, value: number, type: MavParamType) => void;
  onTestMotor: (instance: number, throttlePercent: number) => void;
  onReboot: () => void;
}

const SERVO_CHANNEL_COUNT = 16;
// The test deflects toward whichever side of trim has more room, by 30% of that range -
// visible enough to confirm which surface moved, without commanding a full-deflection extreme.
const TEST_FRACTION = 0.3;

function computeTestPwm(min: number, max: number, trim: number): number {
  const towardMax = max - trim;
  const towardMin = trim - min;
  const target = towardMax >= towardMin ? trim + towardMax * TEST_FRACTION : trim - towardMin * TEST_FRACTION;
  return Math.round(Math.min(max, Math.max(min, target)));
}

// 900-2100us comfortably covers real PWM including typical overshoot past 1000-2000 - same
// reference scale RcCalSection/RcSetupSection's live bars use, so a channel's live position
// looks the same everywhere it's shown in this app.
const SCALE_MIN = 900;
const SCALE_MAX = 2100;
function scalePct(value: number): number {
  return Math.min(100, Math.max(0, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

interface ServoChannel {
  channel: number;
  functionCode: number;
  min: number;
  max: number;
  trim: number;
  reversed: number;
  testPwm: number;
}

type EditableField = "MIN" | "TRIM" | "MAX";

export function MotorsServosSection({
  vehicleType,
  servoOutputs,
  onLoad,
  onTestServo,
  onLoadMotorSetup,
  onSetFrameParam,
  onTestMotor,
  onReboot,
}: MotorsServosSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [editingCell, setEditingCell] = useState<{ channel: number; field: EditableField } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  const isPlane = vehicleFolder === "ArduPlane";
  const isCopter = vehicleFolder === "ArduCopter";

  useEffect(() => {
    if (!isPlane) return;
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Function labels are a nice-to-have - channels still list by raw code without them.
      });
    return () => {
      cancelled = true;
    };
  }, [isPlane, vehicleFolder]);

  if (isCopter) {
    return (
      <MotorsCopterSection
        servoOutputs={servoOutputs}
        onLoadMotorSetup={onLoadMotorSetup}
        onSetFrameParam={onSetFrameParam}
        onTestMotor={onTestMotor}
        onReboot={onReboot}
      />
    );
  }

  if (!isPlane) {
    return (
      <ComingSoonSection
        heading={t("ardupilotSetup.sidebar.motorsSetup")}
        description={t("ardupilotSetup.motorsServos.otherVehicleComingSoon")}
      />
    );
  }

  const hasLoaded = Object.keys(params).some((name) => /^SERVO\d+_FUNCTION$/.test(name));

  // Every channel, not just the ones with a non-Disabled function - matches Mission Planner's
  // own "Servo Output" screen, which always lists all 16 rows (Disabled channels included) so
  // Min/Trim/Max/Reverse stay reachable even before a function is assigned.
  const channels: ServoChannel[] = [];
  if (hasLoaded) {
    for (let channel = 1; channel <= SERVO_CHANNEL_COUNT; channel++) {
      const functionEntry = params[`SERVO${channel}_FUNCTION`];
      if (!functionEntry) continue;
      const min = params[`SERVO${channel}_MIN`]?.value ?? 1000;
      const max = params[`SERVO${channel}_MAX`]?.value ?? 2000;
      const trim = params[`SERVO${channel}_TRIM`]?.value ?? (min + max) / 2;
      channels.push({
        channel,
        functionCode: functionEntry.value,
        min,
        max,
        trim,
        reversed: params[`SERVO${channel}_REVERSED`]?.value ?? 0,
        testPwm: computeTestPwm(min, max, trim),
      });
    }
  }

  const functionValues = docs?.SERVO1_FUNCTION?.values;

  function startEdit(channel: number, field: EditableField, currentValue: number) {
    setEditingCell({ channel, field });
    setEditingValue(String(currentValue));
  }

  function commitEdit() {
    if (!editingCell) return;
    const { channel, field } = editingCell;
    setEditingCell(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    const name = `SERVO${channel}_${field}`;
    const type = params[name]?.type ?? MavParamType.INT16;
    onSetFrameParam(name, parsed, type);
  }

  // Nudges Min/Trim/Max by arrow key instead of requiring a full retype for every adjustment -
  // 1us per press, 10us with Shift for coarser moves. Commits immediately on each press (rather
  // than waiting for blur/Enter) so a held-down surface visibly moves in real time, the same way
  // a transmitter's own trim buttons behave, clamped to the same 900-2100us PWM range the live
  // output bar above already assumes.
  function nudgeEditingValue(channel: number, field: EditableField, direction: 1 | -1, coarse: boolean) {
    const name = `SERVO${channel}_${field}`;
    const current = Number(editingValue);
    const base = Number.isFinite(current) ? current : (params[name]?.value ?? 0);
    const step = coarse ? 10 : 1;
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, base + direction * step));
    setEditingValue(String(next));
    const type = params[name]?.type ?? MavParamType.INT16;
    onSetFrameParam(name, next, type);
  }

  function editableNumberCell(channel: number, field: EditableField, value: number) {
    const isEditing = editingCell?.channel === channel && editingCell.field === field;
    const name = `SERVO${channel}_${field}`;
    if (isEditing) {
      return (
        <Input
          autoFocus
          title={t("ardupilotSetup.motorsServos.arrowKeyHint")}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingCell(null);
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              nudgeEditingValue(channel, field, e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
            }
          }}
          className="h-7 w-20 font-mono text-xs"
        />
      );
    }
    return (
      <span className="flex items-center gap-1.5">
        <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(channel, field, value)}>
          {value}
        </button>
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onLoad}>
          {t("ardupilotSetup.motorsServos.load")}
        </Button>
      </div>

      <Alert variant="warning" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.motorsServos.safetyWarning")}</AlertDescription>
      </Alert>

      <ParamLoadProgress />

      {!hasLoaded ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.notLoaded")}</p>
      ) : channels.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.motorsServos.noActiveChannels")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>{t("ardupilotSetup.motorsServos.channel")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.output")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.reverse")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.function")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.min")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.trim")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.max")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.test")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map(({ channel, functionCode, min, max, trim, reversed, testPwm }) => {
                const liveOutput = servoOutputs[channel];
                const color = colorForRcChannel(channel);
                const functionName = `SERVO${channel}_FUNCTION`;
                const reversedName = `SERVO${channel}_REVERSED`;
                return (
                  <TableRow key={channel}>
                    <TableCell className="font-mono" style={{ color }}>
                      {channel}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <div className="relative h-3 w-16 rounded-full bg-muted">
                          {liveOutput !== undefined && (
                            <div
                              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border border-background"
                              style={{ left: `${scalePct(liveOutput)}%`, background: color }}
                            />
                          )}
                        </div>
                        <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                          {liveOutput !== undefined ? `${liveOutput} us` : "-"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={reversed !== 0}
                          onChange={(e) => onSetFrameParam(reversedName, e.target.checked ? 1 : 0, params[reversedName]?.type ?? MavParamType.INT8)}
                        />
                        <ModifiedFromDefaultDot name={reversedName} value={reversed} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {functionValues ? (
                          <select
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                            value={functionCode}
                            onChange={(e) =>
                              onSetFrameParam(functionName, Number(e.target.value), params[functionName]?.type ?? MavParamType.INT16)
                            }
                          >
                            {!(functionCode in functionValues) && <option value={functionCode}>{functionCode}</option>}
                            {Object.entries(functionValues).map(([code, label]) => (
                              <option key={code} value={code}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-xs">{functionCode}</span>
                        )}
                        <ModifiedFromDefaultDot name={functionName} value={functionCode} />
                      </span>
                    </TableCell>
                    <TableCell>{editableNumberCell(channel, "MIN", min)}</TableCell>
                    <TableCell>{editableNumberCell(channel, "TRIM", trim)}</TableCell>
                    <TableCell>{editableNumberCell(channel, "MAX", max)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="touch-none select-none"
                        onPointerDown={(e) => {
                          // Not implemented in jsdom (tests) and not universally available -
                          // guarded rather than assumed, since losing capture just means a
                          // pointerup outside the button won't be caught by it (still caught
                          // by onPointerLeave in practice).
                          e.currentTarget.setPointerCapture?.(e.pointerId);
                          onTestServo(channel, testPwm);
                        }}
                        onPointerUp={() => onTestServo(channel, trim)}
                        onPointerLeave={() => onTestServo(channel, trim)}
                        onPointerCancel={() => onTestServo(channel, trim)}
                      >
                        {t("ardupilotSetup.motorsServos.holdToTest")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
