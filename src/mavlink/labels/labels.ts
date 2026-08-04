import { MavAutopilot, MavState, MavType } from "../registry/registry";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TYPE_KEYS: Partial<Record<MavType, string>> = {
  [MavType.GENERIC]: "generic",
  [MavType.FIXED_WING]: "fixedWing",
  [MavType.QUADROTOR]: "quadrotor",
  [MavType.COAXIAL]: "coaxial",
  [MavType.HELICOPTER]: "helicopter",
  [MavType.ANTENNA_TRACKER]: "antennaTracker",
  [MavType.GROUND_ROVER]: "groundRover",
  [MavType.SURFACE_BOAT]: "surfaceBoat",
  [MavType.SUBMARINE]: "submarine",
  [MavType.HEXAROTOR]: "hexarotor",
  [MavType.OCTOROTOR]: "octorotor",
  [MavType.TRICOPTER]: "tricopter",
};

const AUTOPILOT_KEYS: Partial<Record<MavAutopilot, string>> = {
  [MavAutopilot.GENERIC]: "generic",
  [MavAutopilot.ARDUPILOTMEGA]: "ardupilotmega",
  [MavAutopilot.PX4]: "px4",
  [MavAutopilot.INVALID]: "invalid",
};

const STATE_KEYS: Partial<Record<MavState, string>> = {
  [MavState.UNINIT]: "uninit",
  [MavState.BOOT]: "boot",
  [MavState.CALIBRATING]: "calibrating",
  [MavState.STANDBY]: "standby",
  [MavState.ACTIVE]: "active",
  [MavState.CRITICAL]: "critical",
  [MavState.EMERGENCY]: "emergency",
  [MavState.POWEROFF]: "poweroff",
  [MavState.FLIGHT_TERMINATION]: "flightTermination",
};

export function mavTypeLabel(t: Translate, type: MavType): string {
  const key = TYPE_KEYS[type];
  return key ? t(`ardupilotSetup.vehicle.types.${key}`) : t("ardupilotSetup.vehicle.types.unknown", { value: type });
}

export function mavAutopilotLabel(t: Translate, autopilot: MavAutopilot): string {
  const key = AUTOPILOT_KEYS[autopilot];
  return key
    ? t(`ardupilotSetup.vehicle.autopilots.${key}`)
    : t("ardupilotSetup.vehicle.autopilots.unknown", { value: autopilot });
}

export function mavStateLabel(t: Translate, state: MavState): string {
  const key = STATE_KEYS[state];
  return key ? t(`ardupilotSetup.vehicle.states.${key}`) : t("ardupilotSetup.vehicle.states.unknown", { value: state });
}
