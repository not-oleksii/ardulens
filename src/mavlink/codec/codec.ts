import type { MavLinkData, MavLinkDataConstructor, MavLinkPacketField } from "mavlink-mappings/dist/lib/mavlink";
import { x25Crc } from "../crc/crc";

export interface MavlinkPacketMeta {
  seq: number;
  sysid: number;
  compid: number;
}

const V2_START_BYTE = 0xfd;
const V2_HEADER_LENGTH = 10; // STX,len,incompat,compat,seq,sysid,compid,msgid(3)

function scalarType(type: string): string {
  return type.endsWith("[]") ? type.slice(0, -2) : type;
}

function readScalar(view: DataView, offset: number, type: string): number | bigint {
  switch (type) {
    case "int8_t":
      return view.getInt8(offset);
    case "uint8_t":
    case "uint8_t_mavlink_version":
      return view.getUint8(offset);
    case "int16_t":
      return view.getInt16(offset, true);
    case "uint16_t":
      return view.getUint16(offset, true);
    case "int32_t":
      return view.getInt32(offset, true);
    case "uint32_t":
      return view.getUint32(offset, true);
    case "int64_t":
      return view.getBigInt64(offset, true);
    case "uint64_t":
      return view.getBigUint64(offset, true);
    case "float":
      return view.getFloat32(offset, true);
    case "double":
      return view.getFloat64(offset, true);
    default:
      throw new Error(`Unsupported MAVLink field type: ${type}`);
  }
}

function writeScalar(view: DataView, offset: number, type: string, value: number | bigint): void {
  switch (type) {
    case "int8_t":
      view.setInt8(offset, Number(value));
      return;
    case "uint8_t":
    case "uint8_t_mavlink_version":
      view.setUint8(offset, Number(value));
      return;
    case "int16_t":
      view.setInt16(offset, Number(value), true);
      return;
    case "uint16_t":
      view.setUint16(offset, Number(value), true);
      return;
    case "int32_t":
      view.setInt32(offset, Number(value), true);
      return;
    case "uint32_t":
      view.setUint32(offset, Number(value), true);
      return;
    case "int64_t":
      view.setBigInt64(offset, BigInt(value), true);
      return;
    case "uint64_t":
      view.setBigUint64(offset, BigInt(value), true);
      return;
    case "float":
      view.setFloat32(offset, Number(value), true);
      return;
    case "double":
      view.setFloat64(offset, Number(value), true);
      return;
    default:
      throw new Error(`Unsupported MAVLink field type: ${type}`);
  }
}

function decodeField(view: DataView, field: MavLinkPacketField): unknown {
  const type = scalarType(field.type);
  if (!field.type.endsWith("[]")) {
    return readScalar(view, field.offset, type);
  }
  if (type === "char") {
    const bytes: number[] = [];
    for (let i = 0; i < field.length; i++) {
      const byte = view.getUint8(field.offset + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
  const values: (number | bigint)[] = [];
  for (let i = 0; i < field.length; i++) {
    values.push(readScalar(view, field.offset + i * field.size, type));
  }
  return values;
}

function encodeField(view: DataView, field: MavLinkPacketField, value: unknown): void {
  const type = scalarType(field.type);
  if (!field.type.endsWith("[]")) {
    writeScalar(view, field.offset, type, value as number | bigint);
    return;
  }
  if (type === "char") {
    const text = typeof value === "string" ? value : "";
    for (let i = 0; i < field.length; i++) {
      view.setUint8(field.offset + i, i < text.length ? text.charCodeAt(i) : 0);
    }
    return;
  }
  const values = (value as (number | bigint)[]) ?? [];
  for (let i = 0; i < field.length; i++) {
    writeScalar(view, field.offset + i * field.size, type, values[i] ?? 0);
  }
}

/** Decodes a (possibly v2-truncated) payload into a populated instance of `ctor`. */
export function decodeMessage<T extends MavLinkData>(ctor: MavLinkDataConstructor<T>, payload: Uint8Array): T {
  const padded = new Uint8Array(ctor.PAYLOAD_LENGTH);
  padded.set(payload.subarray(0, Math.min(payload.length, ctor.PAYLOAD_LENGTH)));
  const view = new DataView(padded.buffer);
  const instance = new ctor();
  for (const field of ctor.FIELDS) {
    (instance as unknown as Record<string, unknown>)[field.name] = decodeField(view, field);
  }
  return instance;
}

/** Serializes a message instance's fields into its raw (untruncated) payload bytes. */
export function encodePayload(msg: MavLinkData): Uint8Array {
  const ctor = msg.constructor as MavLinkDataConstructor<MavLinkData>;
  const buf = new Uint8Array(ctor.PAYLOAD_LENGTH);
  const view = new DataView(buf.buffer);
  for (const field of ctor.FIELDS) {
    encodeField(view, field, (msg as unknown as Record<string, unknown>)[field.name]);
  }
  return buf;
}

/** Assembles a full, unsigned MAVLink v2 packet (header + payload + CRC) ready to send. */
export function encodePacket(msg: MavLinkData, meta: MavlinkPacketMeta): Uint8Array {
  const ctor = msg.constructor as MavLinkDataConstructor<MavLinkData>;
  const payload = encodePayload(msg);

  const header = new Uint8Array(V2_HEADER_LENGTH);
  header[0] = V2_START_BYTE;
  header[1] = payload.length;
  header[2] = 0; // incompatibility flags (unsigned)
  header[3] = 0; // compatibility flags
  header[4] = meta.seq & 0xff;
  header[5] = meta.sysid & 0xff;
  header[6] = meta.compid & 0xff;
  header[7] = ctor.MSG_ID & 0xff;
  header[8] = (ctor.MSG_ID >> 8) & 0xff;
  header[9] = (ctor.MSG_ID >> 16) & 0xff;

  const crcInput = new Uint8Array(header.length - 1 + payload.length);
  crcInput.set(header.subarray(1), 0);
  crcInput.set(payload, header.length - 1);
  const crc = x25Crc(crcInput, ctor.MAGIC_NUMBER);

  const packet = new Uint8Array(header.length + payload.length + 2);
  packet.set(header, 0);
  packet.set(payload, header.length);
  packet[packet.length - 2] = crc & 0xff;
  packet[packet.length - 1] = (crc >> 8) & 0xff;
  return packet;
}
