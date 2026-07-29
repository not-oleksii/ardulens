/**
 * Short field descriptions for DataFlash log messages, sourced from ArduPilot's official
 * log message documentation (https://ardupilot.org/plane/docs/logmessages.html). Covers
 * the message types this app can categorize (see MESSAGE_CATEGORY in raw-log.ts); numbered
 * sensor-instance variants (BAT2, IMU2/3, MAG2, GPS2, AHR2) share the base message's fields.
 */
interface MessageDoc {
  summary: string;
  fields: Record<string, string>;
}

const LOGMESSAGES_URL = "https://ardupilot.org/plane/docs/logmessages.html";

const TIME_FIELD = "Time since system startup.";

function numberedChannelFields(count: number, describe: (channel: number) => string): Record<string, string> {
  const fields: Record<string, string> = { TimeUS: TIME_FIELD };
  for (let i = 1; i <= count; i++) fields[`C${i}`] = describe(i);
  return fields;
}

const MESSAGE_DOCS: Record<string, MessageDoc> = {
  ATT: {
    summary: "Canonical vehicle attitude.",
    fields: {
      TimeUS: TIME_FIELD,
      DesRoll: "Vehicle's desired roll angle.",
      Roll: "Vehicle's achieved roll angle.",
      DesPitch: "Vehicle's desired pitch angle.",
      Pitch: "Vehicle's achieved pitch angle.",
      DesYaw: "Vehicle's desired yaw angle.",
      Yaw: "Vehicle's achieved yaw angle.",
      AEKF: "Active EKF type.",
    },
  },
  AHR2: {
    summary: "Backup AHRS (attitude/position estimator) data.",
    fields: {
      TimeUS: TIME_FIELD,
      Roll: "Estimated roll.",
      Pitch: "Estimated pitch.",
      Yaw: "Estimated yaw.",
      Alt: "Estimated altitude.",
      Lat: "Estimated latitude.",
      Lng: "Estimated longitude.",
    },
  },
  IMU: {
    summary: "Inertial Measurement Unit (gyroscope/accelerometer) data.",
    fields: {
      TimeUS: TIME_FIELD,
      I: "IMU sensor instance number.",
      GyrX: "Measured rotation rate about the roll (X) axis.",
      GyrY: "Measured rotation rate about the pitch (Y) axis.",
      GyrZ: "Measured rotation rate about the yaw (Z) axis.",
      AccX: "Measured acceleration along the X axis.",
      AccY: "Measured acceleration along the Y axis.",
      AccZ: "Measured acceleration along the Z axis.",
      T: "IMU temperature.",
    },
  },
  BARO: {
    summary: "Gathered barometer (altitude/pressure) data.",
    fields: {
      TimeUS: TIME_FIELD,
      I: "Barometer sensor instance number.",
      Alt: "Calculated altitude.",
      AltAMSL: "Altitude above mean sea level.",
      Press: "Measured atmospheric pressure.",
      Temp: "Measured atmospheric temperature.",
      CRt: "Derived climb rate from the primary barometer.",
      GndTemp: "Temperature on the ground.",
      H: "Whether the barometer is considered healthy.",
    },
  },
  MAG: {
    summary: "Information received from the compass(es).",
    fields: {
      TimeUS: TIME_FIELD,
      I: "Magnetometer sensor instance number.",
      MagX: "Magnetic field strength, X axis (body frame).",
      MagY: "Magnetic field strength, Y axis (body frame).",
      MagZ: "Magnetic field strength, Z axis (body frame).",
      OfsX: "Magnetic field offset, X axis.",
      OfsY: "Magnetic field offset, Y axis.",
      OfsZ: "Magnetic field offset, Z axis.",
      Health: "Whether the compass is considered healthy.",
    },
  },
  ARSP: {
    summary: "Airspeed sensor data.",
    fields: {
      TimeUS: TIME_FIELD,
      I: "Airspeed sensor instance number.",
      Airspeed: "Current measured airspeed.",
      DiffPress: "Pressure difference between the static and dynamic ports.",
      Temp: "Temperature used for the airspeed calculation.",
      RawPress: "Raw pressure reading, less offset.",
      Offset: "Zero-airspeed pressure offset (from calibration).",
      U: "Whether this sensor is being used.",
      H: "Whether this sensor is healthy.",
    },
  },
  GPS: {
    summary: "Information received from the GNSS/GPS receiver(s).",
    fields: {
      TimeUS: TIME_FIELD,
      I: "GPS instance number.",
      Status: "GPS fix type (e.g. no fix, 2D, 3D, RTK).",
      NSats: "Number of satellites visible.",
      HDop: "Horizontal dilution of precision (lower is better).",
      Lat: "Latitude.",
      Lng: "Longitude.",
      Alt: "Altitude.",
      Spd: "Ground speed.",
      GCrs: "Ground course (heading over ground).",
      VZ: "Vertical speed.",
      Yaw: "Vehicle yaw, if the GPS supports yaw (e.g. moving baseline).",
      U: "Whether this GPS instance is in use.",
    },
  },
  CTUN: {
    summary: "Control tuning information (throttle/roll/pitch control loop).",
    fields: {
      TimeUS: TIME_FIELD,
      NavRoll: "Desired roll.",
      Roll: "Achieved roll.",
      NavPitch: "Desired pitch.",
      Pitch: "Achieved pitch.",
      ThO: "Scaled output throttle.",
      RdO: "Scaled output rudder.",
      As: "Airspeed estimate used by the controller.",
    },
  },
  BAT: {
    summary: "Gathered battery data.",
    fields: {
      TimeUS: TIME_FIELD,
      Inst: "Battery instance number.",
      Volt: "Measured battery voltage.",
      VoltR: "Estimated resting (unloaded) voltage.",
      Curr: "Measured battery current draw.",
      CurrTot: "Consumed capacity so far, in Ah.",
      EnrgTot: "Consumed energy so far, in Wh.",
      Temp: "Measured battery temperature.",
      Res: "Estimated battery internal resistance.",
      RemPct: "Estimated remaining battery percentage.",
      H: "Battery health status.",
    },
  },
  MCU: {
    summary: "Autopilot MCU voltage and temperature monitoring.",
    fields: {
      TimeUS: TIME_FIELD,
      MTemp: "MCU temperature.",
      MVolt: "MCU voltage.",
      MVmin: "Minimum MCU voltage observed.",
      MVmax: "Maximum MCU voltage observed.",
    },
  },
  VIBE: {
    summary: "Processed (post-filter) vibration levels, per IMU.",
    fields: {
      TimeUS: TIME_FIELD,
      VibeX: "Vibration level on the X axis.",
      VibeY: "Vibration level on the Y axis.",
      VibeZ: "Vibration level on the Z axis.",
      Clip0: "Accelerometer clipping events, first IMU.",
      Clip1: "Accelerometer clipping events, second IMU.",
      Clip2: "Accelerometer clipping events, third IMU.",
    },
  },
  RCIN: {
    summary: "Raw RC transmitter input, per channel.",
    fields: numberedChannelFields(14, (n) => `Raw input value on RC channel ${n}.`),
  },
  RCOU: {
    summary: "Servo/motor output sent to the vehicle's actuators, per channel.",
    fields: numberedChannelFields(14, (n) => `Output value sent to servo/motor channel ${n}.`),
  },
  CURR: {
    summary: "Autopilot power supply monitoring (legacy name for board power, distinct from battery BAT).",
    fields: {
      TimeUS: TIME_FIELD,
      Volt: "Voltage of the autopilot's own power supply.",
      Curr: "Current drawn from the autopilot's power supply.",
      Vcc: "Board voltage.",
    },
  },
  POWR: {
    summary: "Autopilot power rail status.",
    fields: {
      TimeUS: TIME_FIELD,
      Vcc: "Flight board voltage.",
      VServo: "Servo rail voltage.",
      Flags: "Power status flags (e.g. which power source is in use, brownout detected).",
      Safety: "Safety switch state.",
    },
  },
};

/** ArduPilot numbers extra sensor instances by appending a digit (BAT2, IMU3, MAG2, ...); they document identically to instance 1. */
function baseMessageName(msg: string): string {
  return msg.replace(/\d+$/, "");
}

// .skylog only exposes this fixed, synthesized field set (see raw-log.ts) - not real
// DataFlash messages, so there's no ardupilot.org anchor to link to for them.
const TELEMETRY_DOCS: Record<string, string> = {
  voltage: "Battery voltage at the time of the sample.",
  current: "Battery current draw at the time of the sample.",
  airspeed: "Measured airspeed at the time of the sample.",
  throttle: "Commanded throttle percentage at the time of the sample.",
  alt: "Altitude above the takeoff point at the time of the sample.",
};

export interface ParamDoc {
  text: string;
  url?: string;
}

/** Looks up a short description (+ doc link, when one exists) for a param key like "BAT.Volt" or "telemetry.voltage". */
export function getParamDoc(key: string): ParamDoc | null {
  const dot = key.indexOf(".");
  if (dot < 0) return null;
  const msg = key.slice(0, dot);
  const field = key.slice(dot + 1);

  if (msg === "telemetry") {
    const text = TELEMETRY_DOCS[field];
    return text ? { text } : null;
  }

  const doc = MESSAGE_DOCS[msg] ?? MESSAGE_DOCS[baseMessageName(msg)];
  if (!doc) return null;

  const text = doc.fields[field] ?? doc.summary;
  return { text, url: `${LOGMESSAGES_URL}#${baseMessageName(msg).toLowerCase()}` };
}
