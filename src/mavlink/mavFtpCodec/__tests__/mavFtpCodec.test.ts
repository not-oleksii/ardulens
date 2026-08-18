import { describe, expect, it } from "vitest";
import { MavFtpOpcode } from "../../registry/registry";
import {
  decodeFtpNakError,
  decodeFtpPayload,
  encodeFtpPayload,
  FTP_PAYLOAD_HEADER_LENGTH,
  packParamPck,
  unpackParamPck,
  type FtpPayloadHeader,
} from "../mavFtpCodec";

describe("encodeFtpPayload / decodeFtpPayload", () => {
  const header: FtpPayloadHeader = {
    seqNumber: 42,
    session: 1,
    opcode: MavFtpOpcode.BURSTREADFILE,
    size: 3,
    reqOpcode: MavFtpOpcode.OPENFILERO,
    burstComplete: true,
    offset: 1000,
  };

  it("round-trips a header with data through encode then decode", () => {
    const data = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const encoded = encodeFtpPayload(header, data);
    expect(encoded.length).toBe(FTP_PAYLOAD_HEADER_LENGTH + 3);

    const decoded = decodeFtpPayload(encoded);
    expect(decoded.header).toEqual(header);
    expect(Array.from(decoded.data)).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it("round-trips a header with no data", () => {
    const noDataHeader: FtpPayloadHeader = { ...header, size: 0, opcode: MavFtpOpcode.TERMINATESESSION };
    const encoded = encodeFtpPayload(noDataHeader);
    expect(encoded.length).toBe(FTP_PAYLOAD_HEADER_LENGTH);
    expect(decodeFtpPayload(encoded).data.length).toBe(0);
  });

  it("decodes from a plain number[] (as returned by the generic MAVLink field decoder)", () => {
    const encoded = Array.from(encodeFtpPayload({ ...header, size: 2 }, new Uint8Array([1, 2])));
    // Simulate the fixed-length uint8_t[251] field's zero-padding tail.
    while (encoded.length < 251) encoded.push(0);
    const decoded = decodeFtpPayload(encoded);
    expect(decoded.header.offset).toBe(1000);
    expect(Array.from(decoded.data)).toEqual([1, 2]);
  });

  it("throws when given fewer than 12 bytes", () => {
    expect(() => decodeFtpPayload(new Uint8Array(5))).toThrow(/12-byte header/);
  });

  it("rejects data longer than the 239-byte max", () => {
    expect(() => encodeFtpPayload(header, new Uint8Array(240))).toThrow(/too long/);
  });
});

describe("decodeFtpNakError", () => {
  it("reads the error code from the first data byte", () => {
    expect(decodeFtpNakError(new Uint8Array([6]))).toBe(6); // MavFtpErr.EOF
  });
});

describe("packParamPck / unpackParamPck round-trip", () => {
  it("unpacks INT8/INT16/INT32/FLOAT records with prefix-compressed names", () => {
    const bytes = packParamPck([
      { name: "ARSPD_USE", type: 1, value: 1 },
      { name: "ARSPD_RATIO", type: 4, value: 2.0 },
      { name: "PILOT_THR_FILT", type: 2, value: 2 },
      { name: "FRAME_CLASS", type: 3, value: 1 },
    ]);
    const { entries, totalParams } = unpackParamPck(bytes);
    expect(totalParams).toBe(4);
    expect(entries.map((e) => e.name)).toEqual(["ARSPD_USE", "ARSPD_RATIO", "PILOT_THR_FILT", "FRAME_CLASS"]);
    expect(entries[0]).toEqual({ name: "ARSPD_USE", value: 1 });
    expect(entries[1]?.value).toBeCloseTo(2.0);
  });

  it("reconstructs a name from a shared prefix with the previous entry", () => {
    const bytes = packParamPck([
      { name: "ATC_RAT_RLL_P", type: 4, value: 0.135 },
      { name: "ATC_RAT_RLL_I", type: 4, value: 0.135 },
    ]);
    const { entries } = unpackParamPck(bytes);
    expect(entries[1]?.name).toBe("ATC_RAT_RLL_I");
  });

  it("includes a default only for entries whose flags bit 0 is set", () => {
    const bytes = packParamPck([
      { name: "ARSPD_USE", type: 1, value: 1, default: 0 },
      { name: "ARSPD_RATIO", type: 4, value: 2.0 },
    ]);
    const { entries } = unpackParamPck(bytes);
    expect(entries[0]?.default).toBe(0);
    expect(entries[1]).not.toHaveProperty("default");
  });

  it("throws on an unexpected magic number", () => {
    const bad = new Uint8Array([0x00, 0x00, 0, 0, 0, 0]);
    expect(() => unpackParamPck(bad)).toThrow(/magic/);
  });

  it("throws on a truncated buffer", () => {
    const bytes = packParamPck([{ name: "ARSPD_USE", type: 1, value: 1 }]);
    expect(() => unpackParamPck(bytes.subarray(0, bytes.length - 1))).toThrow(/truncated/);
  });
});
