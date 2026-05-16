import { TrendingUp, Receipt, Clock } from "lucide-react";
import { SummaryTab } from "@/pages/sales/SummaryTab";
import { TransactionsTab } from "@/pages/sales/TransactionsTab";
import { UnpaidTab } from "@/pages/sales/UnpaidTab";
import { useUIStore } from "@/stores/uiStore";

const TABS = [
  { id: "summary", label: "매출 요약", icon: TrendingUp },
  { id: "transactions", label: "거래 내역", icon: Receipt },
  { id: "unpaid", label: "미수금 관리", icon: Clock },
] as const;

export function SalesPage() {
  const activeTab = useUIStore((s) => s.salesPage.activeTab);
  const setActiveTab = useUIStore((s) => s.setSalesPageTab);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 상단 탭 바 */}
      <div className="flex items-center gap-1 px-1 py-1 bg-surface-card border-b border-border-default shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                isActive
                  ? "bg-primary-600 text-white shadow-sm"
                  : "text-on-surface-muted hover:bg-surface-elevated hover:text-on-surface"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden p-4 min-h-0">
        {activeTab === "summary" && <SummaryTab />}
        {activeTab === "transactions" && <TransactionsTab />}
        {activeTab === "unpaid" && <UnpaidTab />}
      </div>
    </div>
  );
}
