import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { GlobalDropOverlay } from "./components/GlobalDropOverlay/GlobalDropOverlay";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Toaster } from "./components/ui/toaster";
import { HomeView } from "./pages/HomeView/HomeView";
import { useFileStore } from "./stores/fileStore/fileStore";
import { useUiStore } from "./stores/uiStore/uiStore";

// Lazy - the offline viewer (this whole VIEWS map) and the live-GCS route below are each a
// substantial, mostly-disjoint amount of code (Cesium alone is multiple MB), previously all one
// eager bundle regardless of which half of the app - or even which single tab - a session ever
// actually opens. `.then(m => ({ default: m.X }))` is needed because these are named exports,
// not default ones - changing that convention app-wide just for lazy() isn't worth it.
const LogsView = lazy(() => import("./pages/LogsView/LogsView").then((m) => ({ default: m.LogsView })));
const GraphsView = lazy(() => import("./pages/GraphsView/GraphsView").then((m) => ({ default: m.GraphsView })));
const CesiumMapView = lazy(() => import("./pages/CesiumMapView/CesiumMapView").then((m) => ({ default: m.CesiumMapView })));
const GeoTagView = lazy(() => import("./pages/GeoTagView/GeoTagView").then((m) => ({ default: m.GeoTagView })));
const ParametersView = lazy(() => import("./pages/ParametersView/ParametersView").then((m) => ({ default: m.ParametersView })));
const AdvisorView = lazy(() => import("./pages/AdvisorView/AdvisorView").then((m) => ({ default: m.AdvisorView })));
const CompareView = lazy(() => import("./pages/CompareView/CompareView").then((m) => ({ default: m.CompareView })));
const ArduPilotSetupView = lazy(() =>
  import("./pages/ArduPilotSetupView/ArduPilotSetupView").then((m) => ({ default: m.ArduPilotSetupView })),
);

const VIEWS = {
  logs: LogsView,
  graphs: GraphsView,
  map: CesiumMapView,
  geotag: GeoTagView,
  parameters: ParametersView,
  advisor: AdvisorView,
  compare: CompareView,
} as const;

function LoadingSpinner({ className }: { className: string }) {
  return (
    <div className={className}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function LogViewerRoot() {
  const file = useFileStore((s) => s.file);
  const activeTab = useUiStore((s) => s.activeTab);
  const ActiveView = VIEWS[activeTab];

  if (!file) {
    return <HomeView />;
  }

  return (
    <GlobalDropOverlay>
      <div className="flex h-svh overflow-hidden text-left">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto px-7 py-5">
          <Suspense fallback={<LoadingSpinner className="flex h-full items-center justify-center" />}>
            <ActiveView />
          </Suspense>
        </main>
      </div>
    </GlobalDropOverlay>
  );
}

function App() {
  return (
    <>
      <Suspense fallback={<LoadingSpinner className="flex h-svh items-center justify-center" />}>
        <Routes>
          <Route path="/" element={<LogViewerRoot />} />
          <Route path="/ardupilot-setup" element={<ArduPilotSetupView />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}

export default App;
