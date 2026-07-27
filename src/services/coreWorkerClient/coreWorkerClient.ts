import * as Comlink from "comlink";
import { runAdvisors } from "../../analysis/advisors/registry/registry";
import { computeRow } from "../../analysis/metrics/metrics";
import { extractParamsFromBin } from "../../parameters/dataflash-params/dataflash-params";
import { parseParamFile } from "../../parameters/param-file/param-file";
import { parseFile } from "../../parsers/registry/registry";
import type { CoreWorkerApi } from "../../workers/coreWorker/core.worker";

type AsyncCoreWorkerApi = {
  [K in keyof CoreWorkerApi]: (...args: Parameters<CoreWorkerApi[K]>) => Promise<ReturnType<CoreWorkerApi[K]>>;
};

// Mirrors core.worker.ts's api, but runs on the calling thread - used when Workers
// aren't available (jsdom tests, or a standalone file:// build without module
// worker support), so callers don't need to care which path they're on.
const localApi: AsyncCoreWorkerApi = {
  parseFile: (...args) => Promise.resolve(parseFile(...args)),
  runAdvisors: (...args) => Promise.resolve(runAdvisors(...args)),
  computeRow: (...args) => Promise.resolve(computeRow(...args)),
  extractParamsFromBin: (...args) => Promise.resolve(extractParamsFromBin(...args)),
  parseParamFile: (...args) => Promise.resolve(parseParamFile(...args)),
};

let client: AsyncCoreWorkerApi | null = null;

/** Lazily spins up the parsing/analysis worker and reuses it across calls. */
export function getCoreWorker(): AsyncCoreWorkerApi {
  if (client) return client;

  if (typeof Worker === "undefined") {
    client = localApi;
    return client;
  }

  const worker = new Worker(new URL("../../workers/coreWorker/core.worker.ts", import.meta.url), {
    type: "module",
  });
  client = Comlink.wrap<CoreWorkerApi>(worker);
  return client;
}
