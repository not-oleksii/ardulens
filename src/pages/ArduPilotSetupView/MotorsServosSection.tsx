import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ComingSoonSection } from "./ComingSoonSection";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { MotorsCopterSection } from "./MotorsCopterSection";

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

interface ServoChannel {
  channel: number;
  functionCode: number;
  functionLabel: string;
  min: number;
  max: number;
  trim: number;
  testPwm: number;
}

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

  const channels: ServoChannel[] = [];
  if (hasLoaded) {
    for (let channel = 1; channel <= SERVO_CHANNEL_COUNT; channel++) {
      const functionEntry = params[`SERVO${channel}_FUNCTION`];
      if (!functionEntry || functionEntry.value === 0) continue; // 0 = Disabled
      const min = params[`SERVO${channel}_MIN`]?.value ?? 1000;
      const max = params[`SERVO${channel}_MAX`]?.value ?? 2000;
      const trim = params[`SERVO${channel}_TRIM`]?.value ?? (min + max) / 2;
      channels.push({
        channel,
        functionCode: functionEntry.value,
        functionLabel: docs?.[`SERVO${channel}_FUNCTION`]?.values?.[functionEntry.value] ?? String(functionEntry.value),
        min,
        max,
        trim,
        testPwm: computeTestPwm(min, max, trim),
      });
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.motorsServos.heading")}</h3>
        {!hasLoaded && (
          <Button type="button" size="sm" onClick={onLoad}>
            {t("ardupilotSetup.motorsServos.load")}
          </Button>
        )}
      </div>

      <Alert variant="warning" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.motorsServos.safetyWarning")}</AlertDescription>
      </Alert>

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
                <TableHead>{t("ardupilotSetup.motorsServos.function")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.output")}</TableHead>
                <TableHead>{t("ardupilotSetup.motorsServos.test")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map(({ channel, functionCode, functionLabel, trim, testPwm }) => {
                const liveOutput = servoOutputs[channel];
                return (
                  <TableRow key={channel}>
                    <TableCell className="font-mono">{channel}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {functionLabel}
                        <ModifiedFromDefaultDot name={`SERVO${channel}_FUNCTION`} value={functionCode} />
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{liveOutput !== undefined ? `${liveOutput} us` : "-"}</TableCell>
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
