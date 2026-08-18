import { MavFtpErr, MavFtpOpcode } from "../registry/registry";

// https://mavlink.io/en/services/ftp.html - the 12-byte header that prefixes every
// FILE_TRANSFER_PROTOCOL.payload. Confirmed against mavlink-mappings' own FileTransferProtocol
// FIELDS (payload: uint8_t[251]), which implies up to 251-12=239 bytes of `data` following it.
export const FTP_PAYLOAD_HEADER_LENGTH = 12;
export const FTP_MAX_DATA_LENGTH = 239;

export interface FtpPayloadHeader {
  seqNumber: number;
  session: number;
  opcode: MavFtpOpcode;
  size: number;
  reqOpcode: MavFtpOpcode;
  burstComplete: boolean;
  offset: number;
}

/** Builds the raw header+data bytes for FileTransferProtocol.payload - the array field's own
 *  fixed-length (251) zero-padding is handled by the generic field encoder, not here. */
export function encodeFtpPayload(header: FtpPayloadHeader, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (data.length > FTP_MAX_DATA_LENGTH) throw new Error(`FTP payload data too long: ${data.length} > ${FTP_MAX_DATA_LENGTH}`);
  const buf = new Uint8Array(FTP_PAYLOAD_HEADER_LENGTH + data.length);
  const view = new DataView(buf.buffer);
  view.setUint16(0, header.seqNumber, true);
  view.setUint8(2, header.session);
  view.setUint8(3, header.opcode);
  view.setUint8(4, header.size);
  view.setUint8(5, header.reqOpcode);
  view.setUint8(6, header.burstComplete ? 1 : 0);
  view.setUint8(7, 0); // padding, per spec
  view.setUint32(8, header.offset, true);
  buf.set(data, FTP_PAYLOAD_HEADER_LENGTH);
  return buf;
}

export interface DecodedFtpPayload {
  header: FtpPayloadHeader;
  /** Exactly `header.size` bytes - the rest of the fixed-length field's zero padding is dropped. */
  data: Uint8Array;
}

/** Inverse of {@link encodeFtpPayload} - `payload` is the decoded FileTransferProtocol.payload
 *  field (a plain number[]/Uint8Array of length 251, real trailing bytes possibly zero-padded). */
export function decodeFtpPayload(payload: ArrayLike<number>): DecodedFtpPayload {
  const bytes = payload instanceof Uint8Array ? payload : Uint8Array.from(payload);
  if (bytes.length < FTP_PAYLOAD_HEADER_LENGTH) throw new Error("FTP payload shorter than the 12-byte header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: FtpPayloadHeader = {
    seqNumber: view.getUint16(0, true),
    session: view.getUint8(2),
    opcode: view.getUint8(3),
    size: view.getUint8(4),
    reqOpcode: view.getUint8(5),
    burstComplete: view.getUint8(6) !== 0,
    offset: view.getUint32(8, true),
  };
  const data = bytes.subarray(FTP_PAYLOAD_HEADER_LENGTH, FTP_PAYLOAD_HEADER_LENGTH + header.size);
  return { header, data };
}

/** A NAK's single data byte is the MavFtpErr code (a second byte, only present for FAILERRNO,
 *  carries the remote errno - not needed here). */
export function decodeFtpNakError(data: Uint8Array): MavFtpErr {
  return data[0] ?? 0;
}

// --- @PARAM/param.pck unpacking ---------------------------------------------------------------
// Format confirmed verbatim against ArduPilot's own libraries/AP_Filesystem/README.md.

const PARAM_PCK_MAGIC = 0x671b;

// AP_Param's own on-wire type codes (distinct from MAVLink's MavParamType) - NONE=0 is a real
// enum member but never appears in a packed parameter record itself. A plain object, not a
// TS `enum`, since this project builds with `erasableSyntaxOnly` (no non-erasable TS syntax).
export const ApParamType = {
  INT8: 1,
  INT16: 2,
  INT32: 3,
  FLOAT: 4,
} as const;
export type ApParamTypeCode = (typeof ApParamType)[keyof typeof ApParamType];

const AP_PARAM_TYPE_BYTE_LENGTH: Partial<Record<number, number>> = {
  [ApParamType.INT8]: 1,
  [ApParamType.INT16]: 2,
  [ApParamType.INT32]: 4,
  [ApParamType.FLOAT]: 4,
};

function readApParamValue(view: DataView, offset: number, type: number): number {
  switch (type) {
    case ApParamType.INT8:
      return view.getInt8(offset);
    case ApParamType.INT16:
      return view.getInt16(offset, true);
    case ApParamType.INT32:
      return view.getInt32(offset, true);
    case ApParamType.FLOAT:
      return view.getFloat32(offset, true);
    default:
      throw new Error(`Unknown AP_Param type ${type}`);
  }
}

function writeApParamValue(view: DataView, offset: number, type: number, value: number): void {
  switch (type) {
    case ApParamType.INT8:
      view.setInt8(offset, value);
      return;
    case ApParamType.INT16:
      view.setInt16(offset, value, true);
      return;
    case ApParamType.INT32:
      view.setInt32(offset, value, true);
      return;
    case ApParamType.FLOAT:
      view.setFloat32(offset, value, true);
      return;
    default:
      throw new Error(`Unknown AP_Param type ${type}`);
  }
}

export interface ParamPckEntry {
  name: string;
  value: number;
  /** Present only when the file was fetched `withdefaults=1` AND this param's default differs
   *  from its currently-set value - ArduPilot omits it entirely otherwise. */
  default?: number;
}

export interface UnpackedParamPck {
  entries: ParamPckEntry[];
  /** The full file's total parameter count, per the header - lets a caller confirm a multi-burst
   *  download actually captured everything rather than silently truncating. */
  totalParams: number;
}

/**
 * Unpacks the concatenated bytes of a fully-downloaded `@PARAM/param.pck?withdefaults=1` file
 * (i.e. every burst-read chunk's `data`, joined in offset order) into {name, value, default?}
 * entries. Prefix-compressed: each name reuses `common_len` leading bytes from the *previous*
 * entry's name, so entries must be unpacked strictly in order.
 */
export function unpackParamPck(bytes: Uint8Array): UnpackedParamPck {
  if (bytes.length < 6) throw new Error("param.pck shorter than its 6-byte header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint16(0, true);
  if (magic !== PARAM_PCK_MAGIC) {
    throw new Error(`Unexpected param.pck magic 0x${magic.toString(16)} (expected 0x${PARAM_PCK_MAGIC.toString(16)})`);
  }
  const numParams = view.getUint16(2, true);
  const totalParams = view.getUint16(4, true);

  const entries: ParamPckEntry[] = [];
  let offset = 6;
  let previousName = "";
  for (let i = 0; i < numParams; i++) {
    if (offset + 2 > bytes.length) throw new Error(`param.pck truncated: missing record ${i + 1}/${numParams}`);
    const typeFlagsByte = bytes[offset]!;
    const type = typeFlagsByte & 0x0f;
    const flags = (typeFlagsByte >> 4) & 0x0f;
    const hasDefault = (flags & 0x01) !== 0;
    offset += 1;

    const lengthsByte = bytes[offset]!;
    const commonLen = lengthsByte & 0x0f;
    const nameLen = ((lengthsByte >> 4) & 0x0f) + 1; // stored as (real length - 1)
    offset += 1;

    if (offset + nameLen > bytes.length) throw new Error(`param.pck truncated: name bytes missing for record ${i + 1}/${numParams}`);
    const nameSuffix = new TextDecoder().decode(bytes.subarray(offset, offset + nameLen));
    offset += nameLen;
    const name = previousName.slice(0, commonLen) + nameSuffix;
    previousName = name;

    const byteLength = AP_PARAM_TYPE_BYTE_LENGTH[type];
    if (byteLength === undefined) throw new Error(`param.pck record "${name}" has unknown AP_Param type ${type}`);
    if (offset + byteLength > bytes.length) throw new Error(`param.pck truncated: value bytes missing for "${name}"`);
    const value = readApParamValue(view, offset, type);
    offset += byteLength;

    let defaultValue: number | undefined;
    if (hasDefault) {
      if (offset + byteLength > bytes.length) throw new Error(`param.pck truncated: default bytes missing for "${name}"`);
      defaultValue = readApParamValue(view, offset, type);
      offset += byteLength;
    }

    entries.push({ name, value, ...(defaultValue !== undefined ? { default: defaultValue } : {}) });
  }

  return { entries, totalParams };
}

export interface ParamPckSourceEntry {
  name: string;
  type: ApParamTypeCode;
  value: number;
  /** Included in the packed output only when this is set - real ArduPilot omits the default
   *  entirely whenever it equals the current value (see unpackParamPck's own comment). */
  default?: number;
}

/**
 * Inverse of {@link unpackParamPck} - packs {name, type, value, default?} entries into real
 * `@PARAM/param.pck` bytes (magic 0x671b, prefix-compressed names). Used by the mock vehicle
 * simulator to serve a real, correctly-encoded packed file for Dev Mode's Default column,
 * exactly the same way the rest of this app's mock exercises real wire encoding rather than
 * faking a shortcut response.
 */
export function packParamPck(entries: ParamPckSourceEntry[], totalParams = entries.length): Uint8Array {
  const chunks: number[] = [];
  chunks.push(PARAM_PCK_MAGIC & 0xff, (PARAM_PCK_MAGIC >> 8) & 0xff);
  chunks.push(entries.length & 0xff, (entries.length >> 8) & 0xff);
  chunks.push(totalParams & 0xff, (totalParams >> 8) & 0xff);

  let previousName = "";
  const writeValue = (type: ApParamTypeCode, value: number) => {
    const byteLength = AP_PARAM_TYPE_BYTE_LENGTH[type]!;
    const arr = new Uint8Array(byteLength);
    writeApParamValue(new DataView(arr.buffer), 0, type, value);
    chunks.push(...arr);
  };

  for (const entry of entries) {
    let commonLen = 0;
    while (
      commonLen < previousName.length &&
      commonLen < entry.name.length &&
      commonLen < 15 &&
      previousName[commonLen] === entry.name[commonLen]
    ) {
      commonLen++;
    }
    const suffix = entry.name.slice(commonLen);
    if (suffix.length < 1 || suffix.length > 16) throw new Error(`param.pck: "${entry.name}" has an unencodable suffix length`);
    const hasDefault = entry.default !== undefined;

    chunks.push((entry.type & 0x0f) | ((hasDefault ? 1 : 0) << 4));
    chunks.push((commonLen & 0x0f) | (((suffix.length - 1) & 0x0f) << 4));
    for (const ch of suffix) chunks.push(ch.charCodeAt(0));
    writeValue(entry.type, entry.value);
    if (hasDefault) writeValue(entry.type, entry.default!);

    previousName = entry.name;
  }

  return new Uint8Array(chunks);
}
