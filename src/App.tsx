import { useEffect, useState } from "react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { RefreshCw, Download, AlertCircle } from "lucide-react";
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
}: {
  status: string;
  progress?: number;
  error?: string;
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-surface-container flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tighter text-primary-600 dark:text-primary-400">
            DAOLLY
          </h1>
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
                    <p className="text-xs text-on-surface-muted font-mono">{progress}%</p>
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

  useEffect(() => {
    const runUpdate = async () => {
      try {
        const update = await check();
        if (!update?.available) {
          setUpdateStatus((s) => ({ ...s, status: "done" }));
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
              setUpdateStatus({ status: "done", progress: 100 });
              relaunch();
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
        // 에러 발생 시 2초 후 앱 진입 (사용자 경험 방해 최소화)
        setTimeout(() => setUpdateStatus((s) => ({ ...s, status: "done" })), 2000);
      }
    };

    runUpdate();
  }, []);

  if (updateStatus.status !== "done") {
    return (
      <UpdateSplashScreen
        status={updateStatus.status}
        progress={updateStatus.progress}
        error={updateStatus.error}
      />
    );
  }

  return (
    <ErrorBoundary>
      <AppContent />
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
