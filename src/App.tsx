import { Route, Routes } from "react-router";
import { GlobalDropOverlay } from "./components/GlobalDropOverlay/GlobalDropOverlay";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ArduPilotSetupView } from "./pages/ArduPilotSetupView/ArduPilotSetupView";
import { AdvisorView } from "./pages/AdvisorView/AdvisorView";
import { CesiumMapView } from "./pages/CesiumMapView/CesiumMapView";
import { CompareView } from "./pages/CompareView/CompareView";
import { GeoTagView } from "./pages/GeoTagView/GeoTagView";
import { GraphsView } from "./pages/GraphsView/GraphsView";
import { HomeView } from "./pages/HomeView/HomeView";
import { LogsView } from "./pages/LogsView/LogsView";
import { ParametersView } from "./pages/ParametersView/ParametersView";
import { useFileStore } from "./stores/fileStore/fileStore";
import { useUiStore } from "./stores/uiStore/uiStore";

const VIEWS = {
  logs: LogsView,
  graphs: GraphsView,
  map: CesiumMapView,
  geotag: GeoTagView,
  parameters: ParametersView,
  advisor: AdvisorView,
  compare: CompareView,
} as const;

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
          <ActiveView />
        </main>
      </div>
    </GlobalDropOverlay>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LogViewerRoot />} />
      <Route path="/ardupilot-setup" element={<ArduPilotSetupView />} />
    </Routes>
  );
}

export default App;
