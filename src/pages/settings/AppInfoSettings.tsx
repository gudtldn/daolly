import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Info, RefreshCw, Download, CheckCircle, AlertCircle } from "lucide-react";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; body: string | null | undefined }
  | { status: "downloading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

export function AppInfoSettings() {
  const [version, setVersion] = useState("...");
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateState({ status: "checking" });
    try {
      const update = await check();
      if (!update?.available) {
        setUpdateState({ status: "up-to-date" });
        return;
      }
      setUpdateState({ status: "available", version: update.version, body: update.body });
    } catch (e: unknown) {
      setUpdateState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDownloadAndInstall = async () => {
    if (updateState.status !== "available") return;
    try {
      const update = await check();
      if (!update?.available) return;
      setUpdateState({ status: "downloading", progress: 0 });
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            setUpdateState({ status: "downloading", progress: Math.round((downloaded / total) * 100) });
          }
        } else if (event.event === "Finished") {
          setUpdateState({ status: "ready" });
        }
      });
    } catch (e: unknown) {
      setUpdateState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleRelaunch = async () => {
    await relaunch();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <Info className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">앱 정보</h3>
      </div>

      <div className="space-y-6">
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-4">다올리</h4>
          <dl className="space-y-3 text-sm">
            <div className="flex">
              <dt className="w-24 text-on-surface-muted shrink-0">버전</dt>
              <dd className="text-on-surface">{version}</dd>
            </div>
          </dl>
        </section>

        {/* 업데이트 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-4">업데이트</h4>

          {updateState.status === "idle" && (
            <button
              onClick={handleCheckUpdate}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              업데이트 확인
            </button>
          )}

          {updateState.status === "checking" && (
            <div className="flex items-center gap-2 text-sm text-on-surface-muted">
              <RefreshCw className="w-4 h-4 animate-spin" />
              최신 버전을 확인하는 중...
            </div>
          )}

          {updateState.status === "up-to-date" && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-success-600 dark:text-success-400">
                <CheckCircle className="w-4 h-4" />
                최신 버전입니다.
              </div>
              <button
                onClick={handleCheckUpdate}
                className="ml-auto text-sm text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
              >
                다시 확인
              </button>
            </div>
          )}

          {updateState.status === "available" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface">
                  새 버전 <span className="font-semibold text-primary-600 dark:text-primary-400">{updateState.version}</span> 이 있습니다.
                </span>
                <button
                  onClick={handleDownloadAndInstall}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  다운로드 및 설치
                </button>
              </div>
              {updateState.body && (
                <pre className="text-xs text-on-surface-muted bg-surface-elevated px-3 py-2 rounded-lg whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {updateState.body}
                </pre>
              )}
            </div>
          )}

          {updateState.status === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-on-surface-muted">
                <span>다운로드 중...</span>
                <span>{updateState.progress}%</span>
              </div>
              <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-200"
                  style={{ width: `${updateState.progress}%` }}
                />
              </div>
            </div>
          )}

          {updateState.status === "ready" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-success-600 dark:text-success-400">
                <CheckCircle className="w-4 h-4" />
                설치가 완료되었습니다.
              </div>
              <button
                onClick={handleRelaunch}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
              >
                앱 재시작
              </button>
            </div>
          )}

          {updateState.status === "error" && (
            <div className="flex items-start gap-2">
              <div className="flex-1 flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{updateState.message}</span>
              </div>
              <button
                onClick={handleCheckUpdate}
                className="text-xs text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer shrink-0"
              >
                다시 시도
              </button>
            </div>
          )}
        </section>

        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-3">라이선스</h4>
          <p className="text-sm text-on-surface font-medium">MIT License</p>
          <p className="text-xs text-on-surface-muted mt-1">Copyright (c) 2026 siwoohyong</p>
        </section>
      </div>
    </div>
  );
}
