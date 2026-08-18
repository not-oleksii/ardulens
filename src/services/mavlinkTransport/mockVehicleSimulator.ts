import type { CommandLong } from "mavlink-mappings/dist/lib/common";
import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { decodeMessage, encodePacket } from "../../mavlink/codec/codec";
import { MavlinkFramer } from "../../mavlink/framer/framer";
import {
  ApParamType,
  decodeFtpPayload,
  encodeFtpPayload,
  FTP_MAX_DATA_LENGTH,
  packParamPck,
  type ApParamTypeCode,
  type FtpPayloadHeader,
} from "../../mavlink/mavFtpCodec/mavFtpCodec";
import { buildParamValuePacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../mavlink/paramValueCodec/paramValueCodec";
import {
  AccelcalVehiclePos,
  AccelcalVehiclePosCommand,
  Attitude,
  CommandAck,
  DoMotorTestCommand,
  DoSetServoCommand,
  FileTransferProtocol,
  GlobalPositionInt,
  GpsFixType,
  GpsRawInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MagCalStatus,
  MavAutopilot,
  MavCmd,
  MavFtpErr,
  MavFtpOpcode,
  MavModeFlag,
  MavParamType,
  MavResult,
  MavState,
  MavType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  PreflightCalibrationCommand,
  RcChannels,
  RequestDataStream,
  ServoOutputRaw,
  SysStatus,
  VfrHud,
} from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../ardupilotParamDocs/ardupilotParamDocs";

const SYSID = 1;
const COMPID = 1;
// The GCS identity ArduPilotSetupView.tsx itself uses (GCS_SYSID/GCS_COMPID) - the real
// target of a vehicle-initiated command like ACCELCAL_VEHICLE_POS. The app doesn't actually
// filter incoming packets by target_system/component, so this only matters for realism.
const GCS_SYSID = 255;
const GCS_COMPID = 190;
const HEARTBEAT_INTERVAL_MS = 1000;
const TELEMETRY_INTERVAL_MS = 250;
// Simulated receiver channel count for the RC_CHANNELS sweep below - enough to exercise a
// typical AETR + a few aux switches, well under the real RC1-16 param cap.
const RC_CHANNEL_COUNT = 8;
const COMPASS_CAL_TICK_MS = 300;
const COMPASS_CAL_TOTAL_TICKS = 15; // ~4.5s to 100%
// Delay before the simulator prompts for the next accel-cal position, or reports the final
// result - mirrors a real vehicle briefly processing each sample rather than responding
// instantly, without needing a full progress-percentage simulation like compass cal has.
const ACCEL_CAL_STEP_DELAY_MS = 300;
const ACCEL_CAL_POSITION_SEQUENCE = [
  AccelcalVehiclePos.LEVEL,
  AccelcalVehiclePos.LEFT,
  AccelcalVehiclePos.RIGHT,
  AccelcalVehiclePos.NOSEDOWN,
  AccelcalVehiclePos.NOSEUP,
  AccelcalVehiclePos.BACK,
];
const COMMAND_LONG_MSG_ID = 76;
// A real vehicle doesn't always answer every request cleanly first try - one param is
// deliberately withheld from the initial PARAM_REQUEST_LIST dump, and only ever answers to a
// specific PARAM_REQUEST_READ, so the "Request missing" feature has something real to do.
const SIMULATED_DROPPED_PARAM = "SERVO3_TRIM";
// Real ArduPilot's factory default for ARSPD_RATIO is 2.0 - the mock seeds 1.98 (see
// FAKE_PARAM_SEED's own comment) so this one param has a genuinely different default, giving
// the Default column (served over MAVLink FTP's @PARAM/param.pck?withdefaults=1, see
// handleFtpRequest below) something real to show without hand-crafting one for every param.
const SIMULATED_PARAM_DEFAULTS: Record<string, number> = {
  ARSPD_RATIO: 2.0,
};
// ArduPilot's own virtual-file path (see ArduPilotSetupView.tsx's PARAM_PCK_PATH) - only the
// path portion (before any "?query") is checked, matching the real firmware's file lookup.
const PARAM_PCK_FILE_PATH = "@PARAM/param.pck";

interface FakeParam {
  value: number;
  type: MavParamType;
  index: number;
}

// A small, hand-picked set covering every feature this app currently has a page for: a
// couple of generic params for the Parameters tab, and three active + one disabled servo
// channel (real function codes confirmed against ArduPilot's own apm.pdef.xml: 4=Aileron,
// 110=Airbrakes, 138=Alarm) for the Motors & Servos tab.
const FAKE_PARAM_SEED: ReadonlyArray<readonly [string, number, MavParamType]> = [
  ["ARSPD_USE", 1, MavParamType.INT8],
  ["ARSPD_RATIO", 1.98, MavParamType.REAL32],
  ["SERVO1_FUNCTION", 4, MavParamType.INT16],
  ["SERVO1_MIN", 1000, MavParamType.INT16],
  ["SERVO1_MAX", 2000, MavParamType.INT16],
  ["SERVO1_TRIM", 1500, MavParamType.INT16],
  ["SERVO2_FUNCTION", 110, MavParamType.INT16],
  ["SERVO2_MIN", 1000, MavParamType.INT16],
  ["SERVO2_MAX", 2000, MavParamType.INT16],
  ["SERVO2_TRIM", 1500, MavParamType.INT16],
  ["SERVO3_FUNCTION", 138, MavParamType.INT16],
  ["SERVO3_MIN", 1000, MavParamType.INT16],
  ["SERVO3_MAX", 2000, MavParamType.INT16],
  ["SERVO3_TRIM", 1500, MavParamType.INT16],
  ["SERVO4_FUNCTION", 0, MavParamType.INT16],
  // ESC Cal + Battery Config tabs - generic params both Copter and Plane share, real names
  // confirmed against ArduPilot's own esc_calibration.cpp/AP_BattMonitor_Params.cpp source.
  // ESC_CALIBRATION=0 (NONE) is the real idle default; the BATT_* values below are plausible
  // demo values for exercising the UI, not claimed to be exact stock defaults.
  ["ESC_CALIBRATION", 0, MavParamType.INT8],
  ["BATT_MONITOR", 4, MavParamType.INT8],
  ["BATT_CAPACITY", 5000, MavParamType.INT32],
  ["BATT_ARM_VOLT", 10.5, MavParamType.REAL32],
  ["BATT_LOW_VOLT", 10.5, MavParamType.REAL32],
  ["BATT_CRT_VOLT", 9.6, MavParamType.REAL32],
  ["BATT_LOW_MAH", 0, MavParamType.INT32],
  ["BATT_CRT_MAH", 0, MavParamType.INT32],
  ["BATT_FS_LOW_ACT", 2, MavParamType.INT8],
  ["BATT_FS_CRT_ACT", 1, MavParamType.INT8],
];

export interface MockVehicleHandle {
  /** Feeds bytes the app sent via sendBytes() into the simulator, as if it were the vehicle
   *  receiving them - decodes and reacts exactly like a real vehicle would. */
  handleAppBytes(bytes: Uint8Array): void;
  stop(): void;
}

/**
 * A self-contained, in-process MAVLink "vehicle" - decodes real requests the app sends
 * (PARAM_REQUEST_LIST/READ, PARAM_SET, REQUEST_DATA_STREAM, DO_START/ACCEPT/CANCEL_MAG_CAL,
 * DO_SET_SERVO, DO_MOTOR_TEST, PREFLIGHT_CALIBRATION, ACCELCAL_VEHICLE_POS) and responds with
 * real, correctly-encoded wire packets, so the whole app can be exercised - Telemetry,
 * Parameters, Compass Cal, Accel Cal, Motors & Servos - without any real hardware, SITL, or
 * Tauri backend. Reuses the exact same encode/decode/codec utilities the real app and its
 * tests use, so nothing about the wire format is faked or shortcut.
 */
export function startMockVehicle(
  vehicleType: MavType,
  emit: (bytes: Uint8Array) => void,
  copterFrame?: { frameClass: number; frameType: number },
): MockVehicleHandle {
  const framer = new MavlinkFramer();
  let seq = 0;
  function nextSeq(): number {
    const s = seq;
    seq = (seq + 1) % 256;
    return s;
  }
  function send(msg: MavLinkData) {
    emit(encodePacket(msg, { seq: nextSeq(), sysid: SYSID, compid: COMPID }));
  }

  // --- Heartbeat ---
  function sendHeartbeat() {
    const hb = new Heartbeat();
    hb.type = vehicleType;
    hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    hb.baseMode = MavModeFlag.STABILIZE_ENABLED;
    hb.customMode = 0;
    hb.systemStatus = MavState.STANDBY;
    hb.mavlinkVersion = 3;
    send(hb);
  }
  sendHeartbeat(); // immediately, so the app learns our sysid/compid without waiting a full second
  const heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // --- Telemetry (starts once the app asks, mirroring a real vehicle) ---
  let telemetryTimer: number | null = null;
  let elapsedMs = 0;
  const HOME_LAT = 50.4501;
  const HOME_LON = 30.5234;

  function sendTelemetryTick() {
    elapsedMs += TELEMETRY_INTERVAL_MS;
    const t = elapsedMs / 1000;

    const att = new Attitude();
    att.roll = Math.sin(t * 0.3) * 0.2;
    att.pitch = Math.sin(t * 0.2) * 0.1;
    att.yaw = ((t * 0.1) % (2 * Math.PI)) - Math.PI;
    send(att);

    const vfr = new VfrHud();
    vfr.airspeed = 15 + Math.sin(t * 0.1) * 2;
    vfr.groundspeed = 14 + Math.sin(t * 0.1) * 2;
    vfr.heading = Math.round((t * 5) % 360);
    vfr.throttle = 50;
    vfr.alt = 100 + Math.sin(t * 0.05) * 10;
    vfr.climb = Math.cos(t * 0.05);
    send(vfr);

    const sys = new SysStatus();
    sys.voltageBattery = Math.max(10500, 16800 - Math.round(t * 2));
    sys.currentBattery = 520;
    sys.batteryRemaining = Math.max(10, 100 - Math.round(t / 10));
    send(sys);

    const lat = HOME_LAT + Math.sin(t * 0.02) * 0.001;
    const lon = HOME_LON + Math.cos(t * 0.02) * 0.001;

    const gps = new GpsRawInt();
    gps.fixType = GpsFixType.GPS_FIX_TYPE_3D_FIX;
    gps.satellitesVisible = 11;
    send(gps);

    const pos = new GlobalPositionInt();
    pos.lat = Math.round(lat * 1e7);
    pos.lon = Math.round(lon * 1e7);
    pos.relativeAlt = Math.round((100 + Math.sin(t * 0.05) * 10) * 1000);
    send(pos);

    // Simulated stick/switch movement - a different phase per channel so Dev Mode's RC
    // calibration screen has something real to capture min/max/trim from without needing an
    // actual transmitter. Sweeps the full 1000-2000 PWM range over ~12.5s per channel.
    const rc = new RcChannels();
    rc.chancount = RC_CHANNEL_COUNT;
    const rcRaws: number[] = [];
    for (let channel = 0; channel < RC_CHANNEL_COUNT; channel++) {
      rcRaws.push(Math.round(1500 + 500 * Math.sin(t * 0.5 + channel)));
    }
    const chan = (i: number) => rcRaws[i] ?? 0xffff; // UINT16_MAX = unused, not 0
    rc.chan1Raw = chan(0);
    rc.chan2Raw = chan(1);
    rc.chan3Raw = chan(2);
    rc.chan4Raw = chan(3);
    rc.chan5Raw = chan(4);
    rc.chan6Raw = chan(5);
    rc.chan7Raw = chan(6);
    rc.chan8Raw = chan(7);
    rc.chan9Raw = chan(8);
    rc.chan10Raw = chan(9);
    rc.chan11Raw = chan(10);
    rc.chan12Raw = chan(11);
    rc.chan13Raw = chan(12);
    rc.chan14Raw = chan(13);
    rc.chan15Raw = chan(14);
    rc.chan16Raw = chan(15);
    rc.chan17Raw = chan(16);
    rc.chan18Raw = chan(17);
    send(rc);
  }

  function startTelemetry() {
    if (telemetryTimer !== null) return;
    telemetryTimer = window.setInterval(sendTelemetryTick, TELEMETRY_INTERVAL_MS);
  }

  // --- Parameters ---
  const params = new Map<string, FakeParam>();
  FAKE_PARAM_SEED.forEach(([name, value, type], index) => params.set(name, { value, type, index }));
  // FRAME_CLASS/FRAME_TYPE only exist on Copter firmware - seeded here (not in the static
  // FAKE_PARAM_SEED table above) so a simulated Plane doesn't report params it wouldn't
  // really have. Defaults to Quad X (1, 1) - one of frameDiagrams.ts's verified layouts - but
  // the caller (Dev Mode's frame-preset selector) can start the simulator as any of the
  // other 5 verified combos instead.
  if (vehicleFolderForMavType(vehicleType) === "ArduCopter") {
    params.set("FRAME_CLASS", { value: copterFrame?.frameClass ?? 1, type: MavParamType.INT8, index: params.size });
    params.set("FRAME_TYPE", { value: copterFrame?.frameType ?? 1, type: MavParamType.INT8, index: params.size });
    // SERVO1-8_REVERSED, seeded Normal (0) - so Dev Mode's reverse checkboxes have something
    // real to toggle without needing every simulated Copter to start pre-reversed.
    for (let channel = 1; channel <= 8; channel++) {
      params.set(`SERVO${channel}_REVERSED`, { value: 0, type: MavParamType.INT8, index: params.size });
    }
    // Rate + angle controller gains for the PID Tune tab - real ArduCopter stock defaults
    // (confirmed against ardupilot.org's Copter parameter docs), so Dev Mode shows the same
    // starting values a freshly-flashed real vehicle would.
    for (const axis of ["RLL", "PIT", "YAW"] as const) {
      const [p, i, d, ff] = axis === "YAW" ? [0.18, 0.018, 0, 0] : [0.135, 0.135, 0.0036, 0];
      params.set(`ATC_RAT_${axis}_P`, { value: p, type: MavParamType.REAL32, index: params.size });
      params.set(`ATC_RAT_${axis}_I`, { value: i, type: MavParamType.REAL32, index: params.size });
      params.set(`ATC_RAT_${axis}_D`, { value: d, type: MavParamType.REAL32, index: params.size });
      params.set(`ATC_RAT_${axis}_FF`, { value: ff, type: MavParamType.REAL32, index: params.size });
      params.set(`ATC_ANG_${axis}_P`, { value: 4.5, type: MavParamType.REAL32, index: params.size });
    }
  } else if (vehicleFolderForMavType(vehicleType) === "ArduPlane") {
    // Rate + angle-loop-shaping gains for the PID Tune tab - real ArduPlane stock defaults,
    // confirmed by reading the AC_PID::Defaults{} constructor args and AP_GROUPINFO tables in
    // ArduPilot's own libraries/APM_Control/AP_RollController.cpp and AP_PitchController.cpp on
    // GitHub (the modern RLL_RATE_*/PTCH_RATE_* rate gains; RLL2SRV_ANGLE_P/TCONST/RMAX and
    // PTCH2SRV_ANGLE_P/TCONST/RMAX_UP/RMAX_DN for angle-loop shaping), plus the yaw damper's
    // YAW2SRV_* gains from AP_YawController.cpp (all zero at stock default - the wiki's "0.5 is
    // a good starting point" for YAW2SRV_DAMP is tuning guidance, not the factory default).
    for (const axis of ["RLL", "PTCH"] as const) {
      const prefix = axis === "RLL" ? "RLL_RATE" : "PTCH_RATE";
      const [p, i, d, ff] = axis === "RLL" ? [0.08, 0.15, 0, 0.345] : [0.04, 0.15, 0, 0.345];
      params.set(`${prefix}_P`, { value: p, type: MavParamType.REAL32, index: params.size });
      params.set(`${prefix}_I`, { value: i, type: MavParamType.REAL32, index: params.size });
      params.set(`${prefix}_D`, { value: d, type: MavParamType.REAL32, index: params.size });
      params.set(`${prefix}_FF`, { value: ff, type: MavParamType.REAL32, index: params.size });
    }
    params.set("RLL2SRV_ANGLE_P", { value: 0, type: MavParamType.REAL32, index: params.size });
    params.set("RLL2SRV_TCONST", { value: 0.5, type: MavParamType.REAL32, index: params.size });
    params.set("RLL2SRV_RMAX", { value: 0, type: MavParamType.INT16, index: params.size });
    params.set("PTCH2SRV_ANGLE_P", { value: 0, type: MavParamType.REAL32, index: params.size });
    params.set("PTCH2SRV_TCONST", { value: 0.5, type: MavParamType.REAL32, index: params.size });
    params.set("PTCH2SRV_RMAX_UP", { value: 0, type: MavParamType.INT16, index: params.size });
    params.set("PTCH2SRV_RMAX_DN", { value: 0, type: MavParamType.INT16, index: params.size });
    params.set("YAW2SRV_DAMP", { value: 0, type: MavParamType.REAL32, index: params.size });
    params.set("YAW2SRV_INT", { value: 0, type: MavParamType.REAL32, index: params.size });
    params.set("YAW2SRV_SLIP", { value: 0, type: MavParamType.REAL32, index: params.size });
  }

  // FLTMODE_CH/FLTMODE1-6 and RC1-16_OPTION are generic ArduPilot RC-input params common to
  // every vehicle family (not Copter/Plane-specific like FRAME_CLASS above), so seeded outside
  // the branch above. FLTMODE_CH=5 is the real ArduPilot factory default. The FLTMODE1-6 values
  // below are varied demo modes (not the real stock default, which is STABILIZE/mode 0 in all
  // six slots) so the RC Setup tab's Flight Modes picker has something interesting to show in
  // Dev Mode. RCx_OPTION all default to 0 ("Do Nothing") - the one universally-safe default
  // across every aux-function enum, rather than guessing a specific function's numeric code.
  params.set("FLTMODE_CH", { value: 5, type: MavParamType.INT8, index: params.size });
  const demoFlightModes = [0, 2, 5, 6, 3, 4];
  for (let slot = 1; slot <= 6; slot++) {
    params.set(`FLTMODE${slot}`, { value: demoFlightModes[slot - 1]!, type: MavParamType.INT8, index: params.size });
  }
  for (let channel = 1; channel <= 16; channel++) {
    params.set(`RC${channel}_OPTION`, { value: 0, type: MavParamType.INT16, index: params.size });
  }
  // RCMAP_ROLL/PITCH/THROTTLE/YAW - real ArduPilot factory defaults (channels 1/2/3/4, confirmed
  // against common-rcmap.html). FS_THR_ENABLE/FS_THR_VALUE - real throttle-failsafe params;
  // Disabled + the documented 975us default so Dev Mode doesn't start mid-failsafe.
  params.set("RCMAP_ROLL", { value: 1, type: MavParamType.INT8, index: params.size });
  params.set("RCMAP_PITCH", { value: 2, type: MavParamType.INT8, index: params.size });
  params.set("RCMAP_THROTTLE", { value: 3, type: MavParamType.INT8, index: params.size });
  params.set("RCMAP_YAW", { value: 4, type: MavParamType.INT8, index: params.size });
  params.set("FS_THR_ENABLE", { value: 0, type: MavParamType.INT8, index: params.size });
  params.set("FS_THR_VALUE", { value: 975, type: MavParamType.INT16, index: params.size });

  function sendParamValue(name: string) {
    const p = params.get(name);
    if (!p) return;
    const msg = new ParamValue();
    msg.paramId = name;
    msg.paramType = p.type;
    msg.paramIndex = p.index;
    msg.paramCount = params.size;
    msg.paramValue = 0; // placeholder - buildParamValuePacket overwrites with the real wire bits
    emit(buildParamValuePacket(msg, paramValueToWireBits(p.value, p.type), { seq: nextSeq(), sysid: SYSID, compid: COMPID }));
  }

  function handleParamRequestList() {
    for (const name of params.keys()) {
      if (name === SIMULATED_DROPPED_PARAM) continue;
      sendParamValue(name);
    }
  }

  function handleParamRequestRead(msg: ParamRequestRead) {
    if (msg.paramIndex >= 0) {
      for (const [name, p] of params) {
        if (p.index === msg.paramIndex) {
          sendParamValue(name);
          return;
        }
      }
      return;
    }
    if (msg.paramId) sendParamValue(msg.paramId);
  }

  function handleParamSet(msg: ParamSet, payload: Uint8Array) {
    const existing = params.get(msg.paramId);
    if (!existing) return;
    existing.value = paramWireBitsToValue(readParamValueBits(payload), msg.paramType);
    sendParamValue(msg.paramId);
  }

  // --- Compass calibration ---
  const COMPASS_IDS = [0, 1];
  let compassCalTimer: number | null = null;
  let compassCalTick = 0;

  function stopCompassCal() {
    if (compassCalTimer !== null) {
      window.clearInterval(compassCalTimer);
      compassCalTimer = null;
    }
    compassCalTick = 0;
  }

  function startCompassCal() {
    stopCompassCal();
    compassCalTimer = window.setInterval(() => {
      compassCalTick++;
      const pct = Math.min(100, Math.round((compassCalTick / COMPASS_CAL_TOTAL_TICKS) * 100));
      const status = pct < 10 ? MagCalStatus.WAITING_TO_START : pct < 90 ? MagCalStatus.RUNNING_STEP_ONE : MagCalStatus.RUNNING_STEP_TWO;
      const setBits = Math.floor((pct / 100) * 80);
      const mask = new Array<number>(10).fill(0);
      for (let i = 0; i < setBits; i++) mask[i >> 3] = (mask[i >> 3] ?? 0) | (1 << (i & 7));

      for (const compassId of COMPASS_IDS) {
        const progress = new MagCalProgress();
        progress.compassId = compassId;
        progress.calMask = 0b11;
        progress.calStatus = status;
        progress.attempt = 1;
        progress.completionPct = pct;
        progress.completionMask = mask;
        send(progress);
      }

      if (pct >= 100) {
        stopCompassCal();
        for (const compassId of COMPASS_IDS) {
          const report = new MagCalReport();
          report.fitness = 8.4 + compassId * 0.6;
          report.ofsX = 12;
          report.ofsY = -8;
          report.ofsZ = 5;
          report.diagX = 1;
          report.diagY = 1;
          report.diagZ = 1;
          report.compassId = compassId;
          report.calMask = 0b11;
          report.calStatus = MagCalStatus.SUCCESS;
          report.autosaved = 0;
          send(report);
        }
      }
    }, COMPASS_CAL_TICK_MS);
  }

  // --- Accelerometer calibration ---
  // Unlike compass cal (a continuous progress percentage), the full 6-position accel cal is a
  // simple step sequence: the vehicle asks for one position at a time via its own
  // ACCELCAL_VEHICLE_POS command and only advances once the GCS echoes that same position back
  // (see registry.ts's export comment) - so this just needs an index into the sequence, not a
  // ticking timer.
  let accelCalStepIndex = 0;
  let accelCalTimer: number | null = null;

  function stopAccelCal() {
    if (accelCalTimer !== null) {
      window.clearTimeout(accelCalTimer);
      accelCalTimer = null;
    }
    accelCalStepIndex = 0;
  }

  function sendAccelCalPos(position: number) {
    const cmd = new AccelcalVehiclePosCommand(GCS_SYSID, GCS_COMPID);
    cmd.position = position;
    send(cmd);
  }

  function startFullAccelCal() {
    stopAccelCal();
    accelCalTimer = window.setTimeout(() => {
      sendAccelCalPos(ACCEL_CAL_POSITION_SEQUENCE[0]!);
    }, ACCEL_CAL_STEP_DELAY_MS);
  }

  // Called when the GCS echoes a position back, confirming the vehicle is actually in it -
  // out-of-order/stale echoes (not matching the position currently being waited on) are
  // ignored rather than accepted, matching how a real vehicle's state machine would behave.
  function handleAccelCalPositionConfirmed(position: AccelcalVehiclePos) {
    if (ACCEL_CAL_POSITION_SEQUENCE[accelCalStepIndex] !== position) return;
    accelCalStepIndex++;
    accelCalTimer = window.setTimeout(() => {
      if (accelCalStepIndex >= ACCEL_CAL_POSITION_SEQUENCE.length) {
        sendAccelCalPos(AccelcalVehiclePos.SUCCESS);
        stopAccelCal();
      } else {
        sendAccelCalPos(ACCEL_CAL_POSITION_SEQUENCE[accelCalStepIndex]!);
      }
    }, ACCEL_CAL_STEP_DELAY_MS);
  }

  function ackCommand(command: number, result: MavResult) {
    const ack = new CommandAck();
    ack.command = command;
    ack.result = result;
    ack.progress = 0;
    ack.resultParam2 = 0;
    ack.targetSystem = SYSID;
    ack.targetComponent = COMPID;
    send(ack);
  }

  // --- Servo test ---
  const servoBank0: [number, number, number, number, number, number, number, number] = [
    1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500,
  ];

  function handleSetServo(channel: number, pwm: number) {
    if (channel >= 1 && channel <= 8) servoBank0[channel - 1] = pwm;
    const msg = new ServoOutputRaw();
    msg.port = 0;
    [msg.servo1Raw, msg.servo2Raw, msg.servo3Raw, msg.servo4Raw, msg.servo5Raw, msg.servo6Raw, msg.servo7Raw, msg.servo8Raw] =
      servoBank0;
    send(msg);
  }

  function handleCommandLong(message: unknown, payload: Uint8Array) {
    // The framer decodes every msg-76 packet generically as CommandLong (registered once per
    // id in MAVLINK_REGISTRY) regardless of which specific COMMAND_LONG wrapper class
    // encoded it - `.command` there is typed against common's own MavCmd, distinct from (but
    // structurally compatible with) this file's merged MavCmd, hence the cast.
    const command = (message as CommandLong).command as MavCmd;
    if (command === MavCmd.DO_START_MAG_CAL) {
      ackCommand(command, MavResult.ACCEPTED);
      startCompassCal();
    } else if (command === MavCmd.DO_ACCEPT_MAG_CAL) {
      ackCommand(command, MavResult.ACCEPTED);
    } else if (command === MavCmd.DO_CANCEL_MAG_CAL) {
      ackCommand(command, MavResult.ACCEPTED);
      stopCompassCal();
    } else if (command === MavCmd.DO_SET_SERVO) {
      const cmd = decodeMessage(DoSetServoCommand, payload);
      handleSetServo(cmd.instance, cmd.pwm);
    } else if (command === MavCmd.DO_MOTOR_TEST) {
      // Motor outputs ARE servo outputs 1..N in real ArduPilot (see ServoOutputRaw handling in
      // ArduPilotSetupView.tsx) - reusing handleSetServo reports the test's effect through the
      // exact same live-readback path the Plane surface test already uses.
      const cmd = decodeMessage(DoMotorTestCommand, payload);
      const pwm = Math.round(1000 + (cmd.throttle / 100) * 1000);
      handleSetServo(cmd.instance, pwm);
    } else if (command === MavCmd.PREFLIGHT_CALIBRATION) {
      const cmd = decodeMessage(PreflightCalibrationCommand, payload);
      // accelerometer: 1 = FULL (6-position), 2 = TRIM (one-shot level cal, nothing further
      // to send beyond this ack) - real codes confirmed against MAVLink's own common.xml.
      if (cmd.accelerometer === 1) {
        ackCommand(command, MavResult.ACCEPTED);
        startFullAccelCal();
      } else if (cmd.accelerometer === 2) {
        ackCommand(command, MavResult.ACCEPTED);
      } else {
        // A pure RC-only call (remoteControl set, nothing else) - real ArduPilot's dispatch
        // (GCS_Common.cpp's _handle_command_preflight_calibration) applies the RC-calibrating
        // flag as a side effect but falls through every accel/gyro/baro branch to the default
        // MAV_RESULT_UNSUPPORTED return, since none of them match. Confirmed against
        // ArduPilot's own source, not assumed - the app's RC cal UI already treats this ack
        // as expected, not an error (only a FAILED/armed ack is).
        ackCommand(command, MavResult.UNSUPPORTED);
      }
    } else if (command === MavCmd.ACCELCAL_VEHICLE_POS) {
      const cmd = decodeMessage(AccelcalVehiclePosCommand, payload);
      handleAccelCalPositionConfirmed(cmd.position);
    } else if (command === MavCmd.PREFLIGHT_REBOOT_SHUTDOWN) {
      // A real reboot would drop and re-establish the connection - out of scope for this
      // in-process simulator, which has no transport-level disconnect to simulate. Acking is
      // enough for the UI (button click -> ACCEPTED) to be exercised in Dev Mode.
      ackCommand(command, MavResult.ACCEPTED);
    }
  }

  // --- MAVLink FTP (param.pck defaults download) ---
  // A real, minimal FTP server: enough of OPEN_FILE_RO/BURSTREADFILE/TERMINATESESSION to serve
  // exactly one virtual file, @PARAM/param.pck?withdefaults=1 - the only file this app's FTP
  // client (ArduPilotSetupView.tsx) ever requests. Reuses the exact same mavFtpCodec.ts the
  // real app and its tests use, so nothing about the wire format is faked.
  let ftpSession: { id: number; bytes: Uint8Array } | null = null;
  let nextFtpSessionId = 1;
  let ftpRespSeq = 0;

  function apParamTypeFor(type: MavParamType): ApParamTypeCode {
    switch (type) {
      case MavParamType.INT8:
      case MavParamType.UINT8:
        return ApParamType.INT8;
      case MavParamType.INT16:
      case MavParamType.UINT16:
        return ApParamType.INT16;
      case MavParamType.INT32:
      case MavParamType.UINT32:
        return ApParamType.INT32;
      default:
        return ApParamType.FLOAT;
    }
  }

  function buildParamPckBytes(): Uint8Array {
    const entries = Array.from(params.entries())
      .sort((a, b) => a[1].index - b[1].index)
      .map(([name, p]) => {
        const defaultValue = SIMULATED_PARAM_DEFAULTS[name];
        return {
          name,
          type: apParamTypeFor(p.type),
          value: p.value,
          ...(defaultValue !== undefined && defaultValue !== p.value ? { default: defaultValue } : {}),
        };
      });
    return packParamPck(entries);
  }

  function ftpSend(opcode: MavFtpOpcode, reqOpcode: MavFtpOpcode, opts: { session?: number; offset?: number; data?: Uint8Array; burstComplete?: boolean } = {}) {
    const msg = new FileTransferProtocol();
    msg.targetSystem = GCS_SYSID;
    msg.targetComponent = GCS_COMPID;
    const header: FtpPayloadHeader = {
      seqNumber: ftpRespSeq++,
      session: opts.session ?? 0,
      opcode,
      size: opts.data?.length ?? 0,
      reqOpcode,
      burstComplete: opts.burstComplete ?? false,
      offset: opts.offset ?? 0,
    };
    msg.payload = Array.from(encodeFtpPayload(header, opts.data));
    send(msg);
  }

  function handleFtpRequest(header: FtpPayloadHeader, data: Uint8Array) {
    if (header.opcode === MavFtpOpcode.OPENFILERO) {
      const path = new TextDecoder().decode(data);
      if (!path.startsWith(PARAM_PCK_FILE_PATH)) {
        ftpSend(MavFtpOpcode.NAK, MavFtpOpcode.OPENFILERO, { data: new Uint8Array([MavFtpErr.FILENOTFOUND]) });
        return;
      }
      const fileBytes = buildParamPckBytes();
      const sessionId = nextFtpSessionId++;
      ftpSession = { id: sessionId, bytes: fileBytes };
      const sizeData = new Uint8Array(4);
      new DataView(sizeData.buffer).setUint32(0, fileBytes.length, true);
      ftpSend(MavFtpOpcode.ACK, MavFtpOpcode.OPENFILERO, { session: sessionId, data: sizeData });
    } else if (header.opcode === MavFtpOpcode.BURSTREADFILE) {
      if (!ftpSession || ftpSession.id !== header.session) {
        ftpSend(MavFtpOpcode.NAK, MavFtpOpcode.BURSTREADFILE, { session: header.session, data: new Uint8Array([MavFtpErr.INVALIDSESSION]) });
        return;
      }
      // Streams the whole file as consecutive FTP_MAX_DATA_LENGTH-byte chunks in one
      // synchronous burst - a real vehicle paces these more slowly, but there's no reason to
      // add artificial delay here just to mimic that.
      const { bytes: fileBytes, id: sessionId } = ftpSession;
      let offset = header.offset;
      while (offset < fileBytes.length) {
        const chunk = fileBytes.subarray(offset, Math.min(offset + FTP_MAX_DATA_LENGTH, fileBytes.length));
        const isLast = offset + chunk.length >= fileBytes.length;
        ftpSend(MavFtpOpcode.ACK, MavFtpOpcode.BURSTREADFILE, { session: sessionId, offset, data: chunk, burstComplete: isLast });
        offset += chunk.length;
      }
    } else if (header.opcode === MavFtpOpcode.TERMINATESESSION) {
      if (ftpSession && ftpSession.id === header.session) ftpSession = null;
      ftpSend(MavFtpOpcode.ACK, MavFtpOpcode.TERMINATESESSION, { session: header.session });
    }
  }

  function handleAppBytes(bytes: Uint8Array) {
    for (const packet of framer.push(bytes)) {
      switch (packet.msgId) {
        case RequestDataStream.MSG_ID:
          startTelemetry();
          break;
        case ParamRequestList.MSG_ID:
          handleParamRequestList();
          break;
        case ParamRequestRead.MSG_ID:
          handleParamRequestRead(packet.message as ParamRequestRead);
          break;
        case ParamSet.MSG_ID:
          handleParamSet(packet.message as ParamSet, packet.payload);
          break;
        case COMMAND_LONG_MSG_ID:
          handleCommandLong(packet.message, packet.payload);
          break;
        case FileTransferProtocol.MSG_ID: {
          const ftpMsg = decodeMessage(FileTransferProtocol, packet.payload);
          const { header, data } = decodeFtpPayload(ftpMsg.payload);
          handleFtpRequest(header, data);
          break;
        }
        default:
          break;
      }
    }
  }

  function stop() {
    window.clearInterval(heartbeatTimer);
    if (telemetryTimer !== null) window.clearInterval(telemetryTimer);
    stopCompassCal();
    stopAccelCal();
  }

  return { handleAppBytes, stop };
}
