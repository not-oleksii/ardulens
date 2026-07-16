import { parseBin } from "./dataflash-bin.js";
import { parseSkylog } from "./skylog.js";
import type { ParseResult } from "../types.js";

export interface FormatParser {
  test: (name: string, u8: Uint8Array) => boolean;
  parse: (buf: ArrayBuffer, board?: string) => ParseResult;
}

/** Ordered registry: add a new log format by writing one parser and listing it here. */
export const PARSERS: FormatParser[] = [
  {
    test: (name, u8) => /\.bin$/i.test(name) || (u8.length > 2 && u8[0] === 0xa3 && u8[1] === 0x95),
    parse: (buf, board) => parseBin(buf, board),
  },
  {
    test: () => true, // fallback: skylog (text)
    parse: (buf) => parseSkylog(buf),
  },
];

export function parseFile(name: string, buf: ArrayBuffer, board?: string): ParseResult {
  const u8 = new Uint8Array(buf);
  for (const parser of PARSERS) {
    if (parser.test(name, u8)) return parser.parse(buf, board);
  }
  return { error: `Немає парсера для файлу "${name}".` };
}
