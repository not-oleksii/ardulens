import { TabBar } from "./components/TabBar/TabBar";
import { AdvisorView } from "./pages/AdvisorView/AdvisorView";
import { CompareView } from "./pages/CompareView/CompareView";
import { DashboardView } from "./pages/DashboardView/DashboardView";
import { GraphsView } from "./pages/GraphsView/GraphsView";
import { ParametersView } from "./pages/ParametersView/ParametersView";
import { useUiStore } from "./stores/uiStore/uiStore";
import "./App.css";

const VIEWS = {
  dashboard: DashboardView,
  graphs: GraphsView,
  parameters: ParametersView,
  advisor: AdvisorView,
  compare: CompareView,
} as const;

function App() {
  const activeTab = useUiStore((s) => s.activeTab);
  const ActiveView = VIEWS[activeTab];

  return (
    <div className="app-shell">
      <header>
        <h1>ArduLens</h1>
        <TabBar />
      </header>
      <main>
        <ActiveView />
      </main>
    </div>
  );
}

export default App;
