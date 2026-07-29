/**
 * Minimal ArduPilot DataFlash (.bin) buffer builder used only by tests, so the
 * binary offset/format-char logic in dataflash-bin.ts can be exercised without
 * shipping a real multi-MB log fixture.
 */

type FieldChar = "Q" | "f" | "d" | "B" | "N";

const HEADER = [0xa3, 0x95];

function padString(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < Math.min(s.length, len); i++) out[i] = s.charCodeAt(i);
  return out;
}

function fieldSize(ch: FieldChar): number {
  switch (ch) {
    case "Q": return 8;
    case "f": return 4;
    case "d": return 8;
    case "B": return 1;
    case "N": return 16;
  }
}

export class DataflashBuilder {
  private chunks: Uint8Array[] = [];
  private lenByType = new Map<number, number>();
  private fmtByType = new Map<number, FieldChar[]>();

  defineFormat(typeId: number, name: string, fields: FieldChar[], labels: string[]): this {
    const fmtStr = fields.join("");
    const recordLen = 3 + fields.reduce((sum, f) => sum + fieldSize(f), 0);
    this.lenByType.set(typeId, recordLen);
    this.fmtByType.set(typeId, fields);

    const buf = new Uint8Array(89);
    const dv = new DataView(buf.buffer);
    buf[0] = HEADER[0]!;
    buf[1] = HEADER[1]!;
    buf[2] = 128;
    dv.setUint8(3, typeId);
    dv.setUint8(4, recordLen);
    buf.set(padString(name, 4), 5);
    buf.set(padString(fmtStr, 16), 9);
    buf.set(padString(labels.join(","), 64), 25);
    this.chunks.push(buf);
    return this;
  }

  addRecord(typeId: number, values: Array<number | bigint | string>): this {
    const fields = this.fmtByType.get(typeId);
    if (!fields) throw new Error(`format ${typeId} not defined`);
    const len = this.lenByType.get(typeId)!;
    const buf = new Uint8Array(len);
    const dv = new DataView(buf.buffer);
    buf[0] = HEADER[0]!;
    buf[1] = HEADER[1]!;
    buf[2] = typeId;

    let off = 3;
    fields.forEach((f, i) => {
      const v = values[i]!;
      switch (f) {
        case "Q": dv.setBigUint64(off, typeof v === "bigint" ? v : BigInt(Math.round(Number(v))), true); break;
        case "f": dv.setFloat32(off, Number(v), true); break;
        case "d": dv.setFloat64(off, Number(v), true); break;
        case "B": dv.setUint8(off, Number(v)); break;
        case "N": buf.set(padString(String(v), 16), off); break;
      }
      off += fieldSize(f);
    });
    this.chunks.push(buf);
    return this;
  }

  build(): ArrayBuffer {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out.buffer;
  }
}
