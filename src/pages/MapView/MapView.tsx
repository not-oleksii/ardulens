import { MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildFlightMapData } from "../../analysis/flight-map/flight-map";
import type { FlightMapData } from "../../analysis/flight-map/types";
import { isRawLog, isRawLogError, isRawLogInfo, type RawLogResult } from "../../analysis/raw-log/raw-log";
import { FlightBinBuilder } from "../../builders/FlightBinBuilder/FlightBinBuilder";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { computeBounds, ensureFlightMapLayers, TRACK_KEYS, updateFlightMapData, updateFlightMapVisibility } from "./mapLayers";
import type { TrackKey } from "./mapLayers";
import { TRACK_COLORS } from "./mapLayers";

// MapLibre's Worker script imports a sibling chunk (maplibre-gl-shared.mjs) via a plain
// relative path, which bundlers can't rewrite. scripts/copy-maplibre-worker.mjs copies both
// files as-is into public/maplibre/ (regenerated on install/build, never committed) so
// they're served at a stable path with their relative relationship intact, in both dev and
// production - see that script for the full explanation.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// A public, keyless OSM-derived style (no account/token needed) - fine for this phase;
// the offline/self-hosted basemap is a later, separate piece of work.
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
const STYLE_LOAD_TIMEOUT_MS = 4000;
const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: "background", type: "background" as const, paint: { "background-color": "#e2e8f0" } }],
};

interface LoadedResult {
  name: string;
  result: RawLogResult;
  mapData: FlightMapData | null;
}

export function MapView() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [visibleTracks, setVisibleTracks] = useState<Record<TrackKey, boolean>>({
    gcsTrack: true,
    gpsTrack: true,
    cleanedTrack: true,
  });
  const [showLoss, setShowLoss] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layersReadyRef = useRef(false);

  async function loadBuffer(name: string, buf: ArrayBuffer) {
    setIsParsing(true);
    try {
      const worker = getCoreWorker();
      const result = await worker.buildRawLog(name, buf);
      const mapData = isRawLog(result) ? buildFlightMapData(result.series) : null;
      setLoaded({ name, result, mapData });
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFile(file: File) {
    await loadBuffer(file.name, await file.arrayBuffer());
  }

  function loadSampleBin() {
    // A clear minority window (60s of 600s) - a spoofed/real split anywhere near 50/50
    // makes the median-center classifier's result a coin flip (see flight-map.ts).
    const buf = new FlightBinBuilder().withDurationSeconds(600).withGpsSpoofing(200, 260).build();
    void loadBuffer("sample-flight.bin", buf);
  }

  function toggleTrack(key: TrackKey) {
    setVisibleTracks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // syncRef always points at a closure over the CURRENT loaded/visibleTracks/showLoss -
  // kept up to date every render (via the effect below) so the map's event handlers
  // (attached once, on mount) never push stale data, and so any re-creation of the layers
  // (e.g. the blank-style fallback below) can immediately re-push the current data
  // without waiting for some other state to change first.
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    syncRef.current = () => {
      const map = mapRef.current;
      if (!map || !layersReadyRef.current) return;

      updateFlightMapData(map, loaded?.mapData ?? null);
      updateFlightMapVisibility(map, visibleTracks, showLoss);

      if (loaded?.mapData) {
        const bounds = computeBounds(loaded.mapData);
        if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
      }
    };
    syncRef.current();
  }, [loaded, visibleTracks, showLoss]);

  // Create the map once on mount.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new MapLibreMap({ container, style: BASEMAP_STYLE, center: [0, 0], zoom: 1 });
    map.addControl(new NavigationControl(), "top-right");
    mapRef.current = map;
    layersReadyRef.current = false;

    // "style.load" fires once the map's style has fully loaded OR changed - unlike "load"
    // (which only ever fires for the very first style), this also covers the fallback
    // setStyle() below, so the track layers get (re)created and re-synced either way.
    const onStyleReady = () => {
      ensureFlightMapLayers(map);
      layersReadyRef.current = true;
      syncRef.current();
    };
    let originalStyleLoaded = false;
    map.once("load", () => {
      originalStyleLoaded = true;
      onStyleReady();
    });
    map.on("style.load", onStyleReady);
    // If the online style can't be fetched (no network), fall back to a blank canvas so
    // the track overlays - the actual point of this page - still work. Gated on whether
    // the ORIGINAL style's "load" ever fired, not isStyleLoaded() - that can still read
    // false for a while after a real successful load (e.g. pending sprites/glyphs), which
    // would otherwise make this fallback wipe out an already-working style for no reason.
    const fallbackTimer = setTimeout(() => {
      if (!originalStyleLoaded) map.setStyle(BLANK_STYLE);
    }, STYLE_LOAD_TIMEOUT_MS);

    return () => {
      clearTimeout(fallbackTimer);
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, []);


  const rawLog = loaded && isRawLog(loaded.result) ? loaded.result : null;
  const hasNoMapData = Boolean(rawLog && !loaded?.mapData);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("map.heading")}</CardTitle>
        <CardDescription>{t("map.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="button"
          aria-disabled={isParsing}
          tabIndex={isParsing ? -1 : 0}
          data-testid="map-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors",
            isParsing && "pointer-events-none opacity-60",
            isDragging ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent",
          )}
        >
          {isParsing ? (
            <span className="font-semibold">{t("map.drop.parsing")}</span>
          ) : (
            <>
              <span className="font-semibold">{t("map.drop.title")}</span>
              <span className="text-sm text-muted-foreground">{t("map.drop.subtitle")}</span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin,.BIN"
          className="sr-only"
          data-testid="map-file-input"
          disabled={isParsing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSampleBin} disabled={isParsing}>
            {t("logs.sample.bin")}
          </Button>
        </div>

        {loaded && isRawLogError(loaded.result) && (
          <Alert variant="destructive">
            <AlertDescription>{loaded.result.error}</AlertDescription>
          </Alert>
        )}
        {loaded && isRawLogInfo(loaded.result) && (
          <Alert variant="info">
            <AlertDescription>{loaded.result.info}</AlertDescription>
          </Alert>
        )}
        {hasNoMapData && (
          <Alert variant="info">
            <AlertDescription>{t("map.noGpsData")}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
          <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium">{t("map.legend.heading")}</h3>
            <ul className="flex flex-col gap-2">
              {TRACK_KEYS.map((key) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`map-track-${key}`}
                    checked={visibleTracks[key]}
                    onChange={() => toggleTrack(key)}
                  />
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: TRACK_COLORS[key] }} />
                  <label htmlFor={`map-track-${key}`} className="flex-1">
                    {t(`map.legend.${key}`)}
                  </label>
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="map-track-gpsLoss"
                  checked={showLoss}
                  onChange={() => setShowLoss((v) => !v)}
                />
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: "#f97316" }} />
                <label htmlFor="map-track-gpsLoss" className="flex-1">
                  {t("map.legend.gpsLoss")}
                </label>
              </li>
            </ul>
          </section>

          <div ref={mapContainerRef} data-testid="flight-map" className="h-[480px] w-full rounded-lg border border-border" />
        </div>
      </CardContent>
    </Card>
  );
}
