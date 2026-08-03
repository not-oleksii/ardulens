// CesiumJS ships static assets (Workers, Assets, ThirdParty, Widgets CSS/images) that its
// runtime code fetches by URL rather than importing - Vite's bundler never sees these
// references, so they must be copied verbatim into a stable, servable location (see
// Cesium's own Vite guide: https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/).
// Regenerated on every install/build rather than committed, so it can't drift from the
// installed cesium version - same pattern as copy-maplibre-worker.mjs.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(rootDir, "node_modules/cesium/Build/Cesium");
const destDir = join(rootDir, "app/public/cesium");

mkdirSync(destDir, { recursive: true });
for (const dir of ["ThirdParty", "Workers", "Assets", "Widgets"]) {
  cpSync(join(srcDir, dir), join(destDir, dir), { recursive: true });
}
