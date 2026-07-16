import * as Comlink from "comlink";
import { computeRow, extractParamsFromBin, parseFile, parseParamFile, runAdvisors } from "@ardulens/core";

/** Runs parsing/analysis off the UI thread - .bin logs can be tens of MB. */
const api = { parseFile, runAdvisors, computeRow, extractParamsFromBin, parseParamFile };

export type CoreWorkerApi = typeof api;

Comlink.expose(api);
