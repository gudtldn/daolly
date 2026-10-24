import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Info, RefreshCw, Download, CheckCircle, AlertCircle, FileArchive } from "lucide-react";
import { updateApi, isUpdateStatus } from "@/bindings/updates";
import { databaseApi } from "@/bindings/database";
import type { UpdateStatus } from "@/types";
import { errorMessage } from "@/utils/errors";
import { flushUsage } from "@/utils/usage";

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function AppInfoSettings() {
  const [version, setVersion] = useState("...");
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));

    updateApi
      .getStatus()
      .then((s) => {
        if (isUpdateStatus(s)) setStatus(s);
      })
      .catch(() => {});
    const unlisten = updateApi.onStatus(setStatus).catch(() => undefined);
    return () => {
      void unlisten.then((fn) => fn?.());
    };
  }, []);

  const handleCheckUpdate = async () => {
    setInstallError("");
    setStatus({ state: "checking" });
    try {
      setStatus(await updateApi.check());
    } catch (e: unknown) {
      setStatus({ state: "failed", message: errorMessage(e) });
    }
  };

  const handleInstallNow = async () => {
    setInstallError("");
    setInstalling(true);
    try {
      // 설치 프로그램이 실행되며 앱이 종료되고, 설치가 끝나면 다시 열립니다.
      await updateApi.installNow();
    } catch (e: unknown) {
      const msg = errorMessage(e);
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
        setInstallError(msg);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleExportLogs = async () => {
    try {
      const path = await save({
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        defaultPath: `다올리-기록-${todayStamp()}.zip`,
      });
      if (!path) return;
      setExporting(true);
      await flushUsage();
      await databaseApi.exportUsageLogs(path);
      toast.success("기록을 저장했습니다. 이 파일을 보내 주세요.");
    } catch (e: unknown) {
      toast.error(`기록을 저장하지 못했습니다: ${errorMessage(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const busy = status.state === "checking" || status.state === "downloading";

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
        <section className="bg-surface-card rounded-lg border border-border-default p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-sm font-semibold text-on-surface">업데이트</h4>
            {status.state !== "ready" && (
              <button
                onClick={handleCheckUpdate}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
                업데이트 확인
              </button>
            )}
          </div>

          {status.state === "checking" && (
            <p className="text-sm text-on-surface-muted">최신 버전을 확인하는 중...</p>
          )}

          {status.state === "upToDate" && (
            <div className="flex items-center gap-2 text-sm text-success-600 dark:text-success-400">
              <CheckCircle className="w-4 h-4" />
              최신 버전입니다.
            </div>
          )}

          {status.state === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-on-surface-muted">
                <span>새 버전 {status.version} 받는 중...</span>
                {status.progress !== null && <span>{status.progress}%</span>}
              </div>
              <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-200"
                  style={{ width: `${status.progress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {status.state === "ready" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-on-surface">
                  <CheckCircle className="w-4 h-4 text-success-600 dark:text-success-400 shrink-0" />
                  <span>
                    새 버전 <span className="font-semibold text-primary-600 dark:text-primary-400">{status.version}</span> 준비
                    완료. 프로그램을 끄면 설치됩니다.
                  </span>
                </div>
                <button
                  onClick={handleInstallNow}
                  disabled={installing}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {installing ? "설치 중..." : "지금 설치"}
                </button>
              </div>
              {status.notes && (
                <pre className="text-sm text-on-surface-muted bg-surface-elevated px-3 py-2 rounded-lg whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {status.notes}
                </pre>
              )}
            </div>
          )}

          {status.state === "failed" && (
            <div className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.</span>
            </div>
          )}

          {installError && (
            <div className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{installError}</span>
            </div>
          )}
        </section>

        {/* 사용 기록 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-on-surface">사용 기록</h4>
              <p className="text-sm text-on-surface-muted mt-1">
                프로그램을 더 편하게 고치려고 어떤 화면과 버튼을 쓰는지 이 컴퓨터에만 남깁니다.
                고객 이름·전화번호·금액·입력한 내용은 남기지 않습니다.
              </p>
            </div>
            <button
              onClick={handleExportLogs}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <FileArchive className="w-4 h-4" />
              {exporting ? "저장 중..." : "기록 내보내기"}
            </button>
          </div>
        </section>

        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-3">라이선스</h4>
          <p className="text-sm text-on-surface font-medium">MIT License</p>
          <p className="text-sm text-on-surface-muted mt-1">Copyright (c) 2026 siwoohyong</p>
        </section>
      </div>
    </div>
  );
}
