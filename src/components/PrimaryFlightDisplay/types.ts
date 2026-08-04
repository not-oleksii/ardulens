export interface PrimaryFlightDisplayProps {
  rollRad: number | null;
  pitchRad: number | null;
  headingDeg: number | null;
  airspeed: number | null;
  altitudeM: number | null;
  armed: boolean;
  modeLabel: string;
}
