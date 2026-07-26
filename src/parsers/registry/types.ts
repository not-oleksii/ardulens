import type { ParseResult } from "../../types";

export interface FormatParser {
  test: (name: string, u8: Uint8Array) => boolean;
  parse: (buf: ArrayBuffer, board?: string) => ParseResult;
}
