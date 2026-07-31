// MapLibre's Worker script (maplibre-gl-worker.mjs) imports a sibling chunk
// (maplibre-gl-shared.mjs) via a plain relative path. Vite's bundler can't rewrite that
// import when the worker file is referenced via a `?url` import (a verbatim byte copy,
// bypassed from Vite's module graph), so both files need to be served as-is, side by
// side, at a stable path - this copies them from node_modules into public/ so that's
// true in both `vite dev` and a production build. Regenerated on every install/build
// rather than committed, so it can't drift from the installed maplibre-gl version.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(rootDir, "node_modules/maplibre-gl/dist");
const destDir = join(rootDir, "app/public/maplibre");

mkdirSync(destDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
