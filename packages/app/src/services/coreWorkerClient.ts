import * as Comlink from "comlink";
import type { CoreWorkerApi } from "../workers/core.worker";

let client: Comlink.Remote<CoreWorkerApi> | null = null;

/** Lazily spins up the parsing/analysis worker and reuses it across calls. */
export function getCoreWorker(): Comlink.Remote<CoreWorkerApi> {
  if (!client) {
    const worker = new Worker(new URL("../workers/core.worker.ts", import.meta.url), { type: "module" });
    client = Comlink.wrap<CoreWorkerApi>(worker);
  }
  return client;
}
