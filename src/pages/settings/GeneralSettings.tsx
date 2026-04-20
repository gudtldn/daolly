import { Wrench, Sun, Moon, Monitor } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AppSettings } from "@/types/settings";

const themeOptions: {
  value: AppSettings["general"]["theme"];
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
];

export function GeneralSettings() {
  const theme = useSettingsStore((s) => s.general.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Wrench className="w-5 h-5 text-secondary-500" />
        <h3 className="text-lg font-bold text-secondary-800">일반 설정</h3>
      </div>

      <div className="space-y-6">
        {/* 테마 설정 */}
        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-3">테마</h4>
          <div className="flex gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                  theme === opt.value
                    ? "border-primary-500 bg-primary-50 text-primary-700 font-semibold"
                    : "border-secondary-200 text-secondary-600 hover:border-secondary-300 hover:bg-secondary-50"
                }`}
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 데이터 관리 placeholder */}
        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-3">데이터 관리</h4>
          <p className="text-sm text-secondary-500">준비 중입니다</p>
        </section>
      </div>
    </div>
  );
}
