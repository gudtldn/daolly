import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

const FONT_SIZE_VALUES: Record<string, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

/**
 * 테마(dark 클래스)와 글꼴 크기를 <html>에 적용하는 훅.
 * App 최상위에서 한 번만 호출.
 */
export function useThemeEffect() {
  const theme = useSettingsStore((s) => s.general.theme);
  const fontSize = useSettingsStore((s) => s.general.fontSize);

  // 다크모드 적용
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
      return () => root.classList.remove("dark");
    }

    if (theme === "light") {
      root.classList.remove("dark");
      return;
    }

    // system: OS 설정 따라감
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (e: MediaQueryList | MediaQueryListEvent) => {
      root.classList.toggle("dark", e.matches);
    };
    apply(mq);
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.classList.remove("dark");
    };
  }, [theme]);

  // 글꼴 크기 적용
  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZE_VALUES[fontSize] || "16px";
  }, [fontSize]);
}
