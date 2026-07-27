import { LanguageSwitcher } from "./components/LanguageSwitcher/LanguageSwitcher";
import { TabBar } from "./components/TabBar/TabBar";
import { AdvisorView } from "./pages/AdvisorView/AdvisorView";
import { CompareView } from "./pages/CompareView/CompareView";
import { DashboardView } from "./pages/DashboardView/DashboardView";
import { GraphsView } from "./pages/GraphsView/GraphsView";
import { ParametersView } from "./pages/ParametersView/ParametersView";
import { useUiStore } from "./stores/uiStore/uiStore";

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
    <div className="flex min-h-svh flex-col text-left">
      <header className="flex flex-col gap-3 px-7 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-3xl tracking-tight">ArduLens</h1>
          <LanguageSwitcher />
        </div>
        <TabBar />
      </header>
      <main className="px-7 py-5">
        <ActiveView />
      </main>
    </div>
  );
}

export default App;
