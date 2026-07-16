export interface ParameterEntry {
  name: string;
  value: number;
  /** DataFlash TimeUS this value was last set/logged at, if known (bin source only). */
  timestamp?: number;
}
