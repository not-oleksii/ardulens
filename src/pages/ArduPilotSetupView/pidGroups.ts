/**
 * PID/rate-controller gain groups for the PID Tune tab - one config per vehicle family, since
 * ArduCopter and ArduPlane name their tuning parameters completely differently.
 *
 * Copter (confirmed against ardupilot.org's current Copter parameter docs, "Roll/Pitch/Yaw
 * Rate Controller" and "Angle Controller" sections): a single, stable naming scheme -
 * ATC_RAT_{RLL,PIT,YAW}_{P,I,D,FF} for the inner rate loop, ATC_ANG_{RLL,PIT,YAW}_P for the
 * outer angle loop's single P gain. No ambiguity, no candidates needed.
 *
 * Plane is genuinely ambiguous depending on firmware version, confirmed by reading
 * ArduPilot's own source (libraries/APM_Control/AP_RollController.cpp, AP_PitchController.cpp,
 * AP_YawController.cpp on GitHub) and the wiki's new-roll-and-pitch-tuning.rst:
 *  - Modern firmware (the rate-controller rewrite) uses RLL_RATE_{P,I,D,FF} and
 *    PTCH_RATE_{P,I,D,FF} for the actual gains - RLL2SRV_* and PTCH2SRV_* still exist but now
 *    hold unrelated angle-loop shaping settings (TCONST, RMAX_UP/DN), not P/I/D gains.
 *  - Older firmware only has the classic RLL2SRV_{P,I,D,FF}/PTCH2SRV_{P,I,D,FF} gains.
 * Each term below lists BOTH as candidates (new scheme first) so the UI can pick whichever one
 * the connected vehicle actually responds to, rather than guessing a firmware version.
 * Yaw is a different controller shape entirely (no P/I/D) - a rate/lateral-acceleration damper
 * with YAW2SRV_DAMP (rate damping), YAW2SRV_SLIP (lateral-accel to yaw-rate), YAW2SRV_INT
 * (integral trim) - this naming is stable across firmware versions.
 *
 * Roll/pitch also get an angle-loop shaping term group (confirmed against
 * libraries/APM_Control/AP_RollController.cpp and AP_PitchController.cpp's own var_info/
 * AP_GROUPINFO tables on GitHub) - RLL2SRV_ANGLE_P/PTCH2SRV_ANGLE_P (angle-error-to-rate gain,
 * 0 means "use 1/TCONST"), RLL2SRV_TCONST/PTCH2SRV_TCONST (seconds from demanded to achieved
 * angle), and RLL2SRV_RMAX (roll) / PTCH2SRV_RMAX_UP + PTCH2SRV_RMAX_DN (pitch has separate
 * up/down rate caps, roll doesn't) - the max commanded rate in angle-stabilized modes, 0
 * disables the limit. These names are stable across firmware versions, unlike the rate gains.
 */

export interface PidTerm {
  /** Short label for this gain box, e.g. "P", "I", "D", "FF", "Damp", "Slip", "Int". */
  label: string;
  /** Real ArduPilot parameter names that could hold this gain, tried in this order - the UI
   *  uses whichever one the connected vehicle actually reports via PARAM_VALUE. */
  candidates: readonly string[];
}

export interface PidAxis {
  key: "roll" | "pitch" | "yaw";
  terms: readonly PidTerm[];
}

export interface PidVehicleConfig {
  axes: readonly PidAxis[];
}

const COPTER_CONFIG: PidVehicleConfig = {
  axes: [
    {
      key: "roll",
      terms: [
        { label: "P", candidates: ["ATC_RAT_RLL_P"] },
        { label: "I", candidates: ["ATC_RAT_RLL_I"] },
        { label: "D", candidates: ["ATC_RAT_RLL_D"] },
        { label: "FF", candidates: ["ATC_RAT_RLL_FF"] },
        { label: "Angle P", candidates: ["ATC_ANG_RLL_P"] },
      ],
    },
    {
      key: "pitch",
      terms: [
        { label: "P", candidates: ["ATC_RAT_PIT_P"] },
        { label: "I", candidates: ["ATC_RAT_PIT_I"] },
        { label: "D", candidates: ["ATC_RAT_PIT_D"] },
        { label: "FF", candidates: ["ATC_RAT_PIT_FF"] },
        { label: "Angle P", candidates: ["ATC_ANG_PIT_P"] },
      ],
    },
    {
      key: "yaw",
      terms: [
        { label: "P", candidates: ["ATC_RAT_YAW_P"] },
        { label: "I", candidates: ["ATC_RAT_YAW_I"] },
        { label: "D", candidates: ["ATC_RAT_YAW_D"] },
        { label: "FF", candidates: ["ATC_RAT_YAW_FF"] },
        { label: "Angle P", candidates: ["ATC_ANG_YAW_P"] },
      ],
    },
  ],
};

const PLANE_CONFIG: PidVehicleConfig = {
  axes: [
    {
      key: "roll",
      terms: [
        { label: "P", candidates: ["RLL_RATE_P", "RLL2SRV_P"] },
        { label: "I", candidates: ["RLL_RATE_I", "RLL2SRV_I"] },
        { label: "D", candidates: ["RLL_RATE_D", "RLL2SRV_D"] },
        { label: "FF", candidates: ["RLL_RATE_FF", "RLL2SRV_FF"] },
        { label: "Angle P", candidates: ["RLL2SRV_ANGLE_P"] },
        { label: "TC", candidates: ["RLL2SRV_TCONST"] },
        { label: "Max Rate", candidates: ["RLL2SRV_RMAX"] },
      ],
    },
    {
      key: "pitch",
      terms: [
        { label: "P", candidates: ["PTCH_RATE_P", "PTCH2SRV_P"] },
        { label: "I", candidates: ["PTCH_RATE_I", "PTCH2SRV_I"] },
        { label: "D", candidates: ["PTCH_RATE_D", "PTCH2SRV_D"] },
        { label: "FF", candidates: ["PTCH_RATE_FF", "PTCH2SRV_FF"] },
        { label: "Angle P", candidates: ["PTCH2SRV_ANGLE_P"] },
        { label: "TC", candidates: ["PTCH2SRV_TCONST"] },
        { label: "Max Rate Up", candidates: ["PTCH2SRV_RMAX_UP"] },
        { label: "Max Rate Dn", candidates: ["PTCH2SRV_RMAX_DN"] },
      ],
    },
    {
      key: "yaw",
      terms: [
        { label: "Damp", candidates: ["YAW2SRV_DAMP"] },
        { label: "Int", candidates: ["YAW2SRV_INT"] },
        { label: "Slip", candidates: ["YAW2SRV_SLIP"] },
      ],
    },
  ],
};

/** Every candidate param name across every axis/term - what a full "load PID params" request
 *  should ask the vehicle for, since we don't know in advance which naming scheme it uses. */
export function allPidCandidateNames(config: PidVehicleConfig): string[] {
  return config.axes.flatMap((axis) => axis.terms.flatMap((term) => term.candidates));
}

export function pidConfigForVehicleFolder(folder: string): PidVehicleConfig | null {
  if (folder === "ArduCopter") return COPTER_CONFIG;
  if (folder === "ArduPlane") return PLANE_CONFIG;
  return null;
}
