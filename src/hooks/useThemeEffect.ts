import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

const FONT_SIZE_CLASSES: Record<string, string> = {
  small: "text-sm",
  medium: "text-base",
  large: "text-lg",
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
    const root = document.documentElement;
    // 이전 크기 클래스 제거
    Object.values(FONT_SIZE_CLASSES).forEach((cls) =>
      root.classList.remove(cls)
    );
    root.classList.add(FONT_SIZE_CLASSES[fontSize]);
  }, [fontSize]);
}
