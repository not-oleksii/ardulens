import { TabBar } from "./components/TabBar";
import { AdvisorView } from "./features/advisor/AdvisorView";
import { CompareView } from "./features/compare/CompareView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { GraphsView } from "./features/graphs/GraphsView";
import { ParametersView } from "./features/parameters/ParametersView";
import { useUiStore } from "./stores/uiStore";
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
