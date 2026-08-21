// Real ArduPilot serial port config (AP_SerialManager), confirmed against ardupilot.org's own
// parameter docs - SERIAL0 (the USB/console port) through SERIAL9, a fixed range across every
// vehicle type since this is shared library code, not vehicle-specific. Protocol and Baud are
// enum-typed with large shared value lists (SERIAL0's Protocol enum is its own much smaller
// one - the console only ever supports MAVLink1/2, confirmed against its own real docs), so their
// labels come from fetchParamDocs rather than being hardcoded here. Options is a real bitmask
// (invert RX/TX, half-duplex, swap pins, etc.) - SERIAL0 has no such param at all, since a USB
// console has no electrical-level UART options to set.
export const SERIAL_PORT_COUNT = 10; // SERIAL0 - SERIAL9

export const SERIAL_PORT_INDICES = Array.from({ length: SERIAL_PORT_COUNT }, (_, i) => i);

export function serialProtocolParam(port: number): string {
  return `SERIAL${port}_PROTOCOL`;
}

export function serialBaudParam(port: number): string {
  return `SERIAL${port}_BAUD`;
}

/** null for SERIAL0 - the console port doesn't have an OPTIONS param at all. */
export function serialOptionsParam(port: number): string | null {
  return port === 0 ? null : `SERIAL${port}_OPTIONS`;
}

export const SERIAL_PORT_PARAM_NAMES = SERIAL_PORT_INDICES.flatMap((port) => {
  const names = [serialProtocolParam(port), serialBaudParam(port)];
  const options = serialOptionsParam(port);
  if (options) names.push(options);
  return names;
});
