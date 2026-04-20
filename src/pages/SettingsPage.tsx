import { useState } from "react";
import { Settings, Wrench, Info } from "lucide-react";
import { GeneralSettings } from "@/pages/settings/GeneralSettings";
import { AppInfoSettings } from "@/pages/settings/AppInfoSettings";

const categories = [
  { id: "general", label: "일반 설정", icon: Wrench },
  { id: "appinfo", label: "앱 정보", icon: Info },
] as const;

type CategoryId = (typeof categories)[number]["id"];

const categoryComponents: Record<CategoryId, React.FC> = {
  general: GeneralSettings,
  appinfo: AppInfoSettings,
};

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("general");
  const ActiveComponent = categoryComponents[activeCategory];

  return (
    <div className="h-full flex">
      {/* 좌측 카테고리 목록 */}
      <aside className="w-56 bg-white border-r border-secondary-200 py-4 shrink-0">
        <div className="flex items-center gap-2 px-5 mb-4">
          <Settings className="w-5 h-5 text-secondary-500" />
          <h2 className="text-lg font-bold text-secondary-800">환경 설정</h2>
        </div>
        <nav className="space-y-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? "bg-primary-50 text-primary-700 font-semibold border-r-2 border-primary-600"
                  : "text-secondary-600 hover:bg-secondary-50 hover:text-secondary-800"
              }`}
            >
              <cat.icon className="w-4 h-4 shrink-0" />
              {cat.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 우측 콘텐츠 영역 */}
      <main className="flex-1 overflow-y-auto p-6">
        <ActiveComponent />
      </main>
    </div>
  );
}
