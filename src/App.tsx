import { useEffect, useState, useCallback } from "react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
import { check } from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RefreshCw, Download, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalDialog } from "@/components/GlobalDialog";
import { Layout } from "@/components/Layout";
import { useThemeEffect } from "@/hooks/useThemeEffect";
import { DashboardPage } from "@/pages/DashboardPage";
import { PosPage } from "@/pages/PosPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { SalesPage } from "@/pages/SalesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import "./App.css";

function UpdateSplashScreen({
  status,
  progress,
  error,
  isClosing,
}: {
  status: string;
  progress?: number;
  error?: string;
  isClosing: boolean;
}) {
  return (
    <div
      className={`fixed inset-0 z-[9999] bg-surface-container flex flex-col items-center justify-center p-6 transition-all duration-700 ease-in-out ${
        isClosing ? "opacity-0 scale-105 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-xs space-y-8 text-center">
        <div className="space-y-2">
          <Logo size="lg" />
          <p className="text-sm text-on-surface-muted">최신 버전을 준비하고 있습니다</p>
        </div>

        <div className="relative py-8">
          {error ? (
            <div className="flex flex-col items-center gap-3 text-danger-500">
              <AlertCircle className="w-12 h-12" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <RefreshCw className="w-12 h-12 text-primary-500 animate-spin" />
                {status === "downloading" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Download className="w-5 h-5 text-primary-600" />
                  </div>
                )}
              </div>
              <div className="space-y-2 w-full">
                <p className="text-sm font-medium text-on-surface">
                  {status === "checking" && "업데이트 확인 중..."}
                  {status === "downloading" && "새 버전 다운로드 중..."}
                  {status === "installing" && "업데이트 설치 중..."}
                </p>
                {status === "downloading" && typeof progress === "number" && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-on-surface-muted font-mono">{progress}%</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
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
          <Route path="/dashboard" element={<DashboardPage />} />
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
  const [updateStatus, setUpdateStatus] = useState<{
    status: "checking" | "downloading" | "installing" | "done" | "error";
    progress: number;
    error?: string;
  }>({ status: "checking", progress: 0 });
  const [isClosing, setIsClosing] = useState(false);
  const [showApp, setShowApp] = useState(false);

  // 스플래시 페이드아웃 및 앱 노출 시퀀스
  const finishSplash = useCallback((delay = 0) => {
    const timer = setTimeout(() => {
      setIsClosing(true);
      // CSS 트랜지션(700ms) 완료 후 스플래시 컴포넌트 제거
      setTimeout(() => setShowApp(true), 750);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const runUpdate = async () => {
      try {
        await getCurrentWindow().show();
      } catch (e) {
        console.error("Failed to show window:", e);
      }

      if (import.meta.env.DEV) {
        finishSplash(100);
        return;
      }

      try {
        const update = await check();
        if (!update?.available) {
          finishSplash(500);
          return;
        }

        let downloaded = 0;
        let total = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              total = event.data.contentLength ?? 0;
              setUpdateStatus({ status: "downloading", progress: 0 });
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              if (total > 0) {
                setUpdateStatus({
                  status: "downloading",
                  progress: Math.round((downloaded / total) * 100),
                });
              }
              break;
            case "Finished":
              // Windows 재시작 로직 대기
              break;
          }
        });
      } catch (e) {
        console.error("Update failed:", e);
        setUpdateStatus({
          status: "error",
          progress: 0,
          error: "업데이트를 확인하지 못했습니다.",
        });
        finishSplash(2000); // 에러 메시지를 볼 수 있도록 충분히 대기
      }
    };

    runUpdate();
  }, [finishSplash]);

  return (
    <ErrorBoundary>
      {!showApp && (
        <UpdateSplashScreen
          status={updateStatus.status}
          progress={updateStatus.progress}
          error={updateStatus.error}
          isClosing={isClosing}
        />
      )}
      {/* 본문은 항상 뒤에 렌더링해두어 페이드아웃 시 자연스럽게 보이게 함 */}
      <div className={`h-full bg-surface transition-opacity duration-700 ${isClosing ? "opacity-100" : "opacity-0"}`}>
        <AppContent />
      </div>
      <GlobalDialog />
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              "!bg-surface-card !border !border-border-default !shadow-lg !text-on-surface !rounded-xl",
            title: "!text-on-surface !font-semibold !text-sm",
            description: "!text-on-surface-muted !text-xs",
            success: "!border-l-4 !border-l-primary-400",
            error: "!border-l-4 !border-l-danger-400",
            actionButton:
              "!bg-primary-50 dark:!bg-primary-950 !text-primary-600 dark:!text-primary-400 !border !border-primary-200 dark:!border-primary-800 !rounded-md !text-xs !font-medium !px-3 !py-1.5 !cursor-pointer hover:!bg-primary-100",
          },
        }}
      />
    </ErrorBoundary>
  );
}

export default App;
