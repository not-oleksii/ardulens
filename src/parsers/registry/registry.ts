import { parseBin } from "../dataflash-bin/dataflash-bin";
import { parseSkylog } from "../skylog/skylog";
import { parseTlog } from "../tlog/tlog";
import type { ParseOpts, ParseResult } from "../../types";
import type { FormatParser } from "./types";

/** Ordered registry: add a new log format by writing one parser and listing it here. */
export const PARSERS: FormatParser[] = [
  {
    test: (name, u8) => /\.bin$/i.test(name) || (u8.length > 2 && u8[0] === 0xa3 && u8[1] === 0x95),
    parse: (buf, board, opts) => parseBin(buf, board, opts),
  },
  {
    // A .tlog's first 8 bytes are a timestamp (no fixed magic pattern), so byte 8 being a
    // real MAVLink v1/v2 start byte is the only structural signature available without a
    // real extension - same "extension OR structural sniff" shape as .bin's own test above.
    test: (name, u8) => /\.tlog$/i.test(name) || (u8.length > 9 && (u8[8] === 0xfe || u8[8] === 0xfd)),
    parse: (buf, board, opts) => parseTlog(buf, board, opts),
  },
  {
    test: () => true, // fallback: skylog (text)
    parse: (buf) => parseSkylog(buf),
  },
];

export function parseFile(name: string, buf: ArrayBuffer, board?: string, opts?: ParseOpts): ParseResult {
  const u8 = new Uint8Array(buf);
  for (const parser of PARSERS) {
    if (parser.test(name, u8)) return parser.parse(buf, board, opts);
  }
  return { error: `Немає парсера для файлу "${name}".` };
}
