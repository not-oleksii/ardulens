// vite's html plugin mirrors the entry's root-relative path (app/index.html) into
// outDir, nesting it one level deeper than the assets it references. Tauri expects
// index.html directly at the root of frontendDist, so move it up after the build.
import { existsSync, renameSync, rmdirSync } from "node:fs";

const nested = "app/dist/app/index.html";
const flat = "app/dist/index.html";

if (existsSync(nested)) {
  renameSync(nested, flat);
  rmdirSync("app/dist/app");
}
