// AWS's public "elevation-tiles-prod" bucket (Terrarium-encoded PNG DEM tiles, part of the Open
// Data on AWS program - see https://registry.opendata.aws/terrain-tiles) - free, unauthenticated,
// CORS-open (confirmed: `Access-Control-Allow-Origin: *`), no API key or signup step, matching
// this phase's move away from Cesium ion's required token. Paired with OpenFreeMap for the base
// map itself (see useGroundStationMapViewer.ts).
const TILE_URL_TEMPLATE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TILE_SIZE = 256;
// Zoom 12 is roughly 30-40m/pixel at the latitudes ArduPilot flights typically happen at - fine
// for a coverage-planning tool (not survey-grade), and keeps each unique tile fetch cheap.
const ZOOM = 12;

/** Terrarium's own encoding: elevation in meters is packed across R/G/B with a 32768m offset -
 *  see https://github.com/tilezen/joerd/blob/master/docs/formats.md#terrarium. */
export function decodeTerrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

function lonLatToTilePixel(lon: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return {
    tileX,
    tileY,
    pixelX: Math.min(TILE_SIZE - 1, Math.floor((x - tileX) * TILE_SIZE)),
    pixelY: Math.min(TILE_SIZE - 1, Math.floor((y - tileY) * TILE_SIZE)),
  };
}

async function loadTileImageData(tileX: number, tileY: number): Promise<ImageData> {
  const url = TILE_URL_TEMPLATE.replace("{z}", String(ZOOM)).replace("{x}", String(tileX)).replace("{y}", String(tileY));
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load terrain tile ${url}`));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

// Cached across the whole session (not per-call) - the same handful of tiles cover every device
// on a site, and a site's terrain doesn't change, so there's no reason to ever re-fetch one.
const tileCache = new Map<string, Promise<ImageData>>();
function getTileImageData(tileX: number, tileY: number): Promise<ImageData> {
  const key = `${tileX}/${tileY}`;
  let pending = tileCache.get(key);
  if (!pending) {
    pending = loadTileImageData(tileX, tileY);
    tileCache.set(key, pending);
  }
  return pending;
}

/**
 * Terrain height (meters above the WGS84 ellipsoid, matching this feature's existing altitude
 * convention) for a batch of points in as few tile fetches as possible - points sharing a tile
 * (common for a device's own dense coverage grid) only fetch that tile once, mirroring the
 * batching this app's Cesium code got for free from `sampleTerrainMostDetailed`.
 */
export async function sampleTerrainElevations(points: { lat: number; lon: number }[]): Promise<number[]> {
  const results = new Array<number>(points.length).fill(0);
  const tileCoords = points.map((p) => lonLatToTilePixel(p.lon, p.lat, ZOOM));

  const indicesByTile = new Map<string, number[]>();
  tileCoords.forEach((tc, i) => {
    const key = `${tc.tileX}/${tc.tileY}`;
    const indices = indicesByTile.get(key);
    if (indices) indices.push(i);
    else indicesByTile.set(key, [i]);
  });

  await Promise.all(
    Array.from(indicesByTile.entries()).map(async ([key, indices]) => {
      const [tileXStr, tileYStr] = key.split("/");
      const imageData = await getTileImageData(Number(tileXStr), Number(tileYStr));
      for (const i of indices) {
        const { pixelX, pixelY } = tileCoords[i]!;
        const offset = (pixelY * TILE_SIZE + pixelX) * 4;
        results[i] = decodeTerrariumHeight(imageData.data[offset]!, imageData.data[offset + 1]!, imageData.data[offset + 2]!);
      }
    }),
  );

  return results;
}
