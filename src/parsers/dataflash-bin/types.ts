export interface FormatDef {
  name: string;
  fmt: string;
  labels: string[];
  len: number;
}

export type DataflashRecord = Record<string, number | string>;
export type DataflashTables = Record<string, DataflashRecord[]>;
