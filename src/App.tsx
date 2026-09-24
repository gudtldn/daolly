import { useEffect, useState, useCallback } from "react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { Toaster, toast } from "sonner";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Logo } from "@/components/Logo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalDialog } from "@/components/GlobalDialog";
import { Layout } from "@/components/Layout";
import { useThemeEffect } from "@/hooks/useThemeEffect";
import { databaseApi } from "@/bindings/database";
import { updateApi } from "@/bindings/updates";
import { useDialogStore } from "@/stores/dialogStore";
import { RecoveryScreen } from "@/components/RecoveryScreen";
import type { StartupStatus } from "@/types";
import { PosPage } from "@/pages/PosPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { SalesPage } from "@/pages/SalesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import "./App.css";

function SplashScreen({ isClosing }: { isClosing: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[9999] bg-surface-container flex flex-col items-center justify-center p-6 transition-all duration-700 ease-in-out ${
        isClosing ? "opacity-0 scale-105 pointer-events-none" : "opacity-100"
      }`}
    >
      <Logo size="lg" />
    </div>
  );
}

function AppContent() {
  useThemeEffect();

  return (
    <MemoryRouter initialEntries={["/customers"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/customers" replace />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/customers" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function App() {
  const [isClosing, setIsClosing] = useState(false);
  const [showApp, setShowApp] = useState(false);
  // DB를 열지 못했으면 복구 화면을 보여줌 (확인 전에는 본문을 그리지 않음)
  const [startup, setStartup] = useState<StartupStatus | null>(null);

  useEffect(() => {
    databaseApi
      .getStartupStatus()
      .then(setStartup)
      .catch((e) => {
        console.error("Failed to get startup status:", e);
        setStartup({ state: "ready" });
      });
  }, []);

  // 스플래시 페이드아웃 및 앱 노출 시퀀스
  const finishSplash = useCallback((delay = 0) => {
    const timer = setTimeout(() => {
      setIsClosing(true);
      // CSS 트랜지션(700ms) 완료 후 스플래시 컴포넌트 제거
      setTimeout(() => setShowApp(true), 750);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  // 창을 띄우고 잠깐 로고를 보여준 뒤 본문 표시.
  // 업데이트는 Rust가 백그라운드에서 받아 두었다가 프로그램을 끌 때 설치하므로 기다리지 않음
  useEffect(() => {
    getCurrentWindow()
      .show()
      .catch((e) => console.error("Failed to show window:", e));
    return finishSplash(import.meta.env.DEV ? 100 : 300);
  }, [finishSplash]);

  // 새 버전을 받아 두었으면 한 번 알림
  useEffect(() => {
    const unlisten = updateApi
      .onStatus((status) => {
        if (status.state === "ready") {
          toast.success(`새 버전(${status.version})을 받아 두었습니다.`, {
            description: "프로그램을 끄면 설치된 뒤 다시 열립니다.",
            duration: 10000,
          });
        }
      })
      .catch((e) => {
        console.error("Failed to listen update status:", e);
        return undefined;
      });
    return () => {
      void unlisten.then((fn) => fn?.());
    };
  }, []);

  // 기동 중 발생한 알림 (백업 복원 결과 등)
  useEffect(() => {
    if (!showApp) return;
    databaseApi
      .takeStartupNotices()
      .then((notices) => {
        for (const notice of notices) {
          if (notice.type === "restoreApplied") {
            toast.success("백업에서 데이터를 복원했습니다.");
          } else {
            void useDialogStore.getState().showAlert({
              title: "복원하지 못했습니다",
              message: (
                <>
                  선택한 백업으로 복원하지 못해 복원 전 데이터로 되돌렸습니다.
                  <br />
                  (사유: {notice.reason})
                </>
              ),
            });
          }
        }
      })
      .catch((e) => console.error("Failed to load startup notices:", e));
  }, [showApp]);

  return (
    <ErrorBoundary>
      {!showApp && <SplashScreen isClosing={isClosing} />}
      {/* 본문은 항상 뒤에 렌더링해두어 페이드아웃 시 자연스럽게 보이게 함 */}
      <div className={`h-full bg-surface transition-opacity duration-700 ${isClosing ? "opacity-100" : "opacity-0"}`}>
        {startup?.state === "failed" ? (
          <RecoveryScreen message={startup.message} />
        ) : startup?.state === "ready" ? (
          <AppContent />
        ) : null}
      </div>
      <GlobalDialog />
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              "!bg-surface-card !border !border-border-default !shadow-lg !text-on-surface !rounded-xl",
            title: "!text-on-surface !font-semibold !text-sm",
            description: "!text-on-surface-muted !text-sm",
            success: "!border-l-4 !border-l-primary-400",
            error: "!border-l-4 !border-l-danger-400",
            actionButton:
              "!bg-primary-50 dark:!bg-primary-950 !text-primary-600 dark:!text-primary-400 !border !border-primary-200 dark:!border-primary-800 !rounded-md !text-sm !font-medium !px-3 !py-1.5 !cursor-pointer hover:!bg-primary-100",
          },
        }}
      />
    </ErrorBoundary>
  );
}

export default App;
