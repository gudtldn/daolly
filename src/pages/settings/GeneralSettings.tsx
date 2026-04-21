import { Wrench, Sun, Moon, Monitor, Type } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AppSettings, FontSize } from "@/types/settings";

const themeOptions: {
  value: AppSettings["general"]["theme"];
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
  { value: "system", label: "시스템", icon: Monitor },
];

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "작게" },
  { value: "medium", label: "보통" },
  { value: "large", label: "크게" },
];

export function GeneralSettings() {
  const theme = useSettingsStore((s) => s.general.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const fontSize = useSettingsStore((s) => s.general.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Wrench className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">일반 설정</h3>
      </div>

      <div className="space-y-6">
        {/* 테마 설정 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-3">테마</h4>
          <div className="flex gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                  theme === opt.value
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold"
                    : "border-border-default text-on-surface-muted hover:border-secondary-300 hover:bg-surface-elevated"
                }`}
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 글꼴 크기 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <div className="flex items-center gap-2 mb-3">
            <Type className="w-4 h-4 text-on-surface-muted" />
            <h4 className="text-sm font-semibold text-on-surface">글꼴 크기</h4>
          </div>
          <div className="flex gap-3">
            {fontSizeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFontSize(opt.value)}
                className={`px-4 py-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                  fontSize === opt.value
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold"
                    : "border-border-default text-on-surface-muted hover:border-secondary-300 hover:bg-surface-elevated"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
