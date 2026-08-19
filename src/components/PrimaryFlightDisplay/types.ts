import type { ReactNode } from "react";

export interface PrimaryFlightDisplayProps {
  rollRad: number | null;
  pitchRad: number | null;
  headingDeg: number | null;
  airspeed: number | null;
  altitudeM: number | null;
  armed: boolean;
  modeLabel: string;
  /** Optional content overlaid on the lower portion of the horizon circle - e.g. ArduPilot
   *  Setup's VehicleHealthSection. Positioned by this component (which knows its own internal
   *  SVG layout precisely), not by the caller, and never affects this component's own size -
   *  see PrimaryFlightDisplay.tsx's own comment on why. */
  warningOverlay?: ReactNode;
}
