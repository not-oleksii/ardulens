import * as Comlink from "comlink";
import { runAdvisors } from "../../analysis/advisors/registry/registry";
import { buildFlightMapDataFromBin } from "../../analysis/flight-map/fromBin";
import { computeRow } from "../../analysis/metrics/metrics";
import { buildRawLog } from "../../analysis/raw-log/raw-log";
import { extractParamsFromBin } from "../../parameters/dataflash-params/dataflash-params";
import { parseParamFile } from "../../parameters/param-file/param-file";
import { parseFile } from "../../parsers/registry/registry";

/** Runs parsing/analysis off the UI thread - .bin logs can be tens of MB. */
const api = {
  parseFile,
  runAdvisors,
  computeRow,
  extractParamsFromBin,
  parseParamFile,
  buildRawLog,
  buildFlightMapDataFromBin,
};

export type CoreWorkerApi = typeof api;

Comlink.expose(api);
