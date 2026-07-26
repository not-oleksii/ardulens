import { TABS, useUiStore } from "../../stores/uiStore/uiStore";

const LABELS: Record<(typeof TABS)[number], string> = {
  dashboard: "Огляд",
  graphs: "Графіки",
  parameters: "Параметри",
  advisor: "Аналіз",
  compare: "Порівняння",
};

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          className={tab === activeTab ? "tab active" : "tab"}
          onClick={() => setActiveTab(tab)}
        >
          {LABELS[tab]}
        </button>
      ))}
    </nav>
  );
}
