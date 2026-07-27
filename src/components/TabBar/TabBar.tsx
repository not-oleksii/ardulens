import { useTranslation } from "react-i18next";
import { TABS, useUiStore } from "../../stores/uiStore/uiStore";

export function TabBar() {
  const { t } = useTranslation();
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
          {t(`tabs.${tab}`)}
        </button>
      ))}
    </nav>
  );
}
