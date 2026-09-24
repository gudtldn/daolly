import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { AlertTriangle, Download, FileText, RotateCcw, UploadCloud } from "lucide-react";
import { databaseApi } from "@/bindings/database";
import { updateApi, isUpdateStatus } from "@/bindings/updates";
import { useDialogStore } from "@/stores/dialogStore";
import { reportError } from "@/utils/logging";
import { errorMessage } from "@/utils/errors";
import type { BackupInfo, BackupKind, UpdateStatus } from "@/types";

const KIND_LABELS: Record<BackupKind, string> = {
  manual: "직접 백업",
  daily: "자동",
  preMigration: "업데이트 전",
  preRestore: "복원 전",
  preClear: "초기화 전",
  preImport: "가져오기 전",
  legacy: "이전 버전",
};

/**
 * DB를 열지 못했을 때(손상, 업데이트 실패 등) 앱을 종료하는 대신 보여주는 화면.
 * 백업으로 복원하거나, 로그 폴더를 열어 개발자에게 보낼 수 있습니다.
 */
export function RecoveryScreen({ message }: { message: string }) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<UpdateStatus>({ state: "idle" });
  const [installing, setInstalling] = useState(false);
  const { showConfirm } = useDialogStore();

  useEffect(() => {
    databaseApi
      .listBackups()
      .then(setBackups)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));

    // 문제를 고친 새 버전이 있으면 바로 설치할 수 있게 함
    updateApi
      .getStatus()
      .then((s) => {
        if (isUpdateStatus(s)) setUpdate(s);
      })
      .catch(() => {});
    const unlisten = updateApi.onStatus(setUpdate).catch(() => undefined);
    return () => {
      void unlisten.then((fn) => fn?.());
    };
  }, []);

  const handleInstallUpdate = async () => {
    setError("");
    setInstalling(true);
    try {
      await updateApi.installNow();
    } catch (e) {
      const msg = errorMessage(e);
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
        setError(msg);
        reportError("RecoveryScreen.installUpdate", e);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleRestore = async (backup: BackupInfo) => {
    const confirmed = await showConfirm({
      title: "백업으로 복원",
      message: `${backup.createdAt} 백업으로 복원합니다. 지금 파일은 따로 보관되며, 복원 후 프로그램이 다시 시작됩니다.`,
      confirmText: "복원",
    });
    if (!confirmed) return;

    setError("");
    setRestoring(backup.filename);
    try {
      await databaseApi.restore(backup.filename);
    } catch (e) {
      const msg = errorMessage(e);
      // 재시작으로 인한 연결 끊김은 에러로 처리하지 않음
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
        setError(msg);
        reportError("RecoveryScreen.restore", e);
      }
    } finally {
      setRestoring(null);
    }
  };

  const handleOpenLogs = async () => {
    try {
      await databaseApi.openLogFolder();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-surface-card border border-border-default rounded-xl shadow-lg p-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-danger-50 dark:bg-danger-950 rounded-xl shrink-0">
            <AlertTriangle className="w-8 h-8 text-danger-600 dark:text-danger-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">데이터를 열지 못했습니다</h1>
            <p className="text-base text-on-surface-muted leading-relaxed">
              프로그램을 시작하는 중 문제가 생겼습니다. 원래 데이터 파일은 지우지 않고 그대로 두었습니다.
              아래 백업 중 하나로 복원하거나, 로그 폴더의 파일을 개발자에게 보내 주세요.
            </p>
          </div>
        </div>

        {update.state === "ready" && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-lg">
            <p className="text-base text-primary-700 dark:text-primary-300">
              새 버전({update.version})이 준비되어 있습니다. 업데이트하면 문제가 해결될 수 있습니다.
            </p>
            <button
              onClick={handleInstallUpdate}
              disabled={installing}
              className="flex items-center gap-2 px-4 py-2.5 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Download className="w-5 h-5" />
              {installing ? "설치 중..." : "업데이트 설치"}
            </button>
          </div>
        )}
        {update.state === "downloading" && (
          <p className="text-base text-on-surface-muted">
            새 버전({update.version})을 받는 중입니다{update.progress !== null ? ` (${update.progress}%)` : ""}...
          </p>
        )}

        {error && (
          <div className="px-4 py-3 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 rounded-lg text-base text-danger-700 dark:text-danger-300">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">백업으로 복원</h2>
          {loading ? (
            <p className="text-base text-on-surface-muted">백업 목록을 불러오는 중...</p>
          ) : backups.length === 0 ? (
            <p className="text-base text-on-surface-muted">복원할 수 있는 백업이 없습니다.</p>
          ) : (
            <ul className="border border-border-default rounded-lg divide-y divide-border-default max-h-72 overflow-y-auto">
              {backups.map((b, i) => (
                <li key={b.filename} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-base font-medium">
                      {b.createdAt}
                      {i === 0 && <span className="ml-2 text-sm text-primary-600 dark:text-primary-400">가장 최근</span>}
                    </p>
                    <p className="text-sm text-on-surface-muted">{KIND_LABELS[b.kind]}</p>
                  </div>
                  <button
                    onClick={() => handleRestore(b)}
                    disabled={restoring !== null}
                    className="flex items-center gap-2 px-4 py-2.5 text-base font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <UploadCloud className="w-5 h-5" />
                    {restoring === b.filename ? "복원 중..." : "이 백업으로 복원"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void relaunch()}
            className="flex items-center gap-2 px-5 py-3 text-base font-medium border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            다시 시작
          </button>
          <button
            onClick={handleOpenLogs}
            className="flex items-center gap-2 px-5 py-3 text-base font-medium border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <FileText className="w-5 h-5" />
            로그 폴더 열기
          </button>
        </div>

        <details className="text-sm text-on-surface-muted">
          <summary className="cursor-pointer select-none">자세한 오류 내용 (개발자용)</summary>
          <pre className="mt-2 p-3 bg-surface-elevated rounded-lg whitespace-pre-wrap break-all font-mono">{message}</pre>
        </details>
      </div>
    </div>
  );
}
