import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, FolderOpen, DownloadCloud, UploadCloud, AlertTriangle } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";

interface BackupInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatabaseSettings() {
  const [dbPath, setDbPath] = useState<string>("...");
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { showCustom } = useDialogStore();

  useEffect(() => {
    invoke<string>("get_db_path")
      .then(setDbPath)
      .catch(() => setDbPath("알 수 없음"));
    loadBackups();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const list = await invoke<BackupInfo[]>("list_backups");
      setBackups(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke("open_db_folder");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setError("");
    setSuccess("");
    try {
      const filename = await invoke<string>("backup_db");
      setSuccess(`백업 완료: ${filename}`);
      await loadBackups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreClick = async (filename: string) => {
    const confirmed = await showCustom({
      title: "복원 확인",
      isDestructive: false,
      confirmText: "복원 및 재시작",
      cancelText: "취소",
      customContent: (
        <div>
          <p className="text-sm text-on-surface mb-2">다음 백업 파일로 복원하시겠습니까?</p>
          <p className="text-xs text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded mb-4 break-all">
            {filename}
          </p>
          <div className="flex items-start gap-2 bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 rounded-lg px-4 py-3 text-sm text-warning-700 dark:text-warning-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>현재 데이터가 모두 교체됩니다. 복원 후 앱이 자동으로 재시작됩니다.</span>
          </div>
        </div>
      ),
    });
    if (!confirmed) return;
    setError("");
    try {
      await invoke("restore_db", { filename });
      // app.restart() triggers, response may not arrive
    } catch (e: unknown) {
      // restart() causes connection loss - ignore "Could not connect" type errors
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
        setError(msg);
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <Database className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">데이터 관리</h3>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 rounded-lg text-sm text-success-700 dark:text-success-300">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* DB 위치 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-4">데이터베이스 위치</h4>
          <div className="flex items-center gap-3">
            <span className="flex-1 text-xs text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded-lg break-all">
              {dbPath}
            </span>
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
            >
              <FolderOpen className="w-4 h-4" />
              폴더 열기
            </button>
          </div>
        </section>

        {/* 백업 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-on-surface">백업</h4>
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadCloud className="w-4 h-4" />
              {backupLoading ? "백업 중..." : "지금 백업"}
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-on-surface-muted text-center py-4">로딩 중...</p>
          ) : backups.length === 0 ? (
            <p className="text-sm text-on-surface-muted text-center py-4 border border-dashed border-border-default rounded-lg">
              백업 파일이 없습니다.
            </p>
          ) : (
            <div className="border border-border-default rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-elevated text-on-surface-muted z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">생성 일시</th>
                    <th className="px-3 py-2 text-right font-medium w-20">크기</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {backups.map((b) => (
                    <tr key={b.filename}>
                      <td className="px-3 py-2 text-on-surface">{b.createdAt}</td>
                      <td className="px-3 py-2 text-right text-on-surface-muted w-20">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-2 py-2 text-center w-20">
                        <button
                          onClick={() => handleRestoreClick(b.filename)}
                          className="flex items-center gap-1 px-2 py-1 text-xs border border-border-default rounded hover:bg-surface-elevated transition-colors cursor-pointer mx-auto"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          복원
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
