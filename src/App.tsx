import { Sidebar } from "./components/Sidebar/Sidebar";
import { AdvisorView } from "./pages/AdvisorView/AdvisorView";
import { CesiumMapView } from "./pages/CesiumMapView/CesiumMapView";
import { CompareView } from "./pages/CompareView/CompareView";
import { GraphsView } from "./pages/GraphsView/GraphsView";
import { LogsView } from "./pages/LogsView/LogsView";
import { MapView } from "./pages/MapView/MapView";
import { ParametersView } from "./pages/ParametersView/ParametersView";
import { useUiStore } from "./stores/uiStore/uiStore";

const VIEWS = {
  logs: LogsView,
  graphs: GraphsView,
  map: MapView,
  cesium3d: CesiumMapView,
  parameters: ParametersView,
  advisor: AdvisorView,
  compare: CompareView,
} as const;

function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const ActiveView = VIEWS[activeTab];

  return (
    <div className="flex h-svh overflow-hidden text-left">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-7 py-5">
        <ActiveView />
      </main>
    </div>
  );
}

export default App;
