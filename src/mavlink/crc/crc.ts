const X25_INIT_CRC = 0xffff;

function crcAccumulate(data: number, crc: number): number {
  let tmp = (data ^ (crc & 0xff)) & 0xff;
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

/**
 * MAVLink's CRC-X25 checksum: accumulated over the packet bytes from LEN through the end
 * of the payload (i.e. everything except the start-of-frame byte), then over one more byte -
 * the message's CRC_EXTRA ("magic number") - which isn't part of the wire packet itself but
 * ties the checksum to the exact field layout, catching dialect/version mismatches that a
 * plain payload checksum wouldn't.
 */
export function x25Crc(bytes: Uint8Array, crcExtra: number): number {
  let crc = X25_INIT_CRC;
  for (const byte of bytes) crc = crcAccumulate(byte, crc);
  return crcAccumulate(crcExtra, crc);
}
