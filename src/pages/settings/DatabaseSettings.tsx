import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, FolderOpen, DownloadCloud, UploadCloud, AlertTriangle, History } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/LoadingOverlay";

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
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
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
          <p className="text-sm text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded-lg mb-4 break-all">
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
        setError(msg);
      }
    }
  };

  const handleLegacyMigration = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        title: "이전 버전 customer.db 선택",
      });

      if (!selected) return;

      const confirmed = await showCustom({
        title: "데이터 가져오기 확인",
        isDestructive: false,
        confirmText: "가져오기 시작",
        cancelText: "취소",
        customContent: (
          <div className="space-y-3">
            <p className="text-sm text-on-surface">
              선택한 파일에서 데이터를 가져옵니다. 
              기존 데이터가 있는 경우 <strong className="text-primary-600 dark:text-primary-400">자동으로 백업</strong> 후 진행됩니다.
            </p>
            <p className="text-sm text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded-lg break-all">
              {selected}
            </p>
            <div className="flex items-start gap-2 bg-primary-50 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 rounded-lg px-4 py-3 text-sm text-primary-700 dark:text-primary-300">
              <History className="w-4 h-4 mt-0.5 shrink-0" />
              <span>가져오기 완료 후 데이터 확인을 위해 앱을 재시작하시기 바랍니다.</span>
            </div>
          </div>
        ),
      });

      if (!confirmed) return;

      setMigrationLoading(true);
      setError("");
      try {
        await invoke("migrate_from_legacy", { legacyPath: selected });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // 자동 재시작으로 인한 연결 끊김은 에러로 처리하지 않음
        if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) {
          throw e;
        }
      }
      toast.success("데이터 이관 완료. 앱을 재시작합니다.");
      await loadBackups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("마이그레이션 실패");
    } finally {
      setMigrationLoading(false);
    }
  };

  const handleClearAllData = async () => {
    const confirmed = await showCustom({
      title: "전체 데이터 삭제",
      isDestructive: true,
      confirmText: "모든 데이터 삭제",
      cancelText: "취소",
      customContent: (
        <div className="space-y-3">
          <div className="flex items-start gap-2 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 rounded-lg px-4 py-3 text-sm text-danger-700 dark:text-danger-300">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold">주의: 모든 데이터가 삭제됩니다.</p>
              <p className="text-sm">손님 정보, 작업 내역, 매출 기록, 단가 설정 등 모든 정보가 초기화됩니다.</p>
            </div>
          </div>
          <p className="text-sm text-on-surface">
            삭제 전 <strong className="text-primary-600 dark:text-primary-400">자동으로 백업</strong>이 생성되며, 
            삭제 완료 후 상태 초기화를 위해 <strong className="text-primary-600 dark:text-primary-400">앱이 재시작</strong>됩니다. 
            정말로 모든 데이터를 삭제하시겠습니까?
          </p>
        </div>
      ),
    });

    if (!confirmed) return;

    setClearLoading(true);
    setError("");
    setSuccess("");
    try {
      await invoke("clear_all_data");
      setSuccess("모든 데이터가 삭제되었습니다. (삭제 전 백업이 생성되었습니다)");
      await loadBackups();
      toast.success("초기화 완료");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("데이터 삭제 실패");
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto relative">
      <LoadingOverlay isLoading={migrationLoading} message="데이터를 가져오는 중입니다..." absolute={false} />
      <LoadingOverlay isLoading={backupLoading} message="데이터베이스 백업 중..." absolute={false} />
      <LoadingOverlay isLoading={clearLoading} message="모든 데이터를 삭제 중..." absolute={false} />
      
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

      <div className="space-y-6 pb-10">
        {/* DB 위치 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-on-surface mb-4">데이터베이스 위치</h4>
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded-lg break-all">
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

        {/* 레거시 데이터 가져오기 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-on-surface">이전 버전 데이터 가져오기</h4>
              <p className="text-sm text-on-surface-muted mt-1">
                WinForms 버전의 customer.db 파일을 선택하여 손님 및 작업 내역을 가져옵니다.
              </p>
            </div>
            <button
              onClick={handleLegacyMigration}
              disabled={migrationLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              <History className="w-4 h-4" />
              {migrationLoading ? "가져오는 중..." : "데이터 가져오기"}
            </button>
          </div>
        </section>

        {/* 백업 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-on-surface">백업 내역</h4>
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <DownloadCloud className="w-4 h-4" />
              {backupLoading ? "백업 중..." : "지금 백업"}
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-on-surface-muted text-center py-8">로딩 중...</p>
          ) : backups.length === 0 ? (
            <div className="py-12 border border-dashed border-border-default rounded-lg flex flex-col items-center justify-center">
              <Database className="w-8 h-8 text-on-surface-muted/30 mb-2" />
              <p className="text-sm text-on-surface-muted">백업 파일이 없습니다.</p>
            </div>
          ) : (
            <div className="border border-border-default rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-elevated text-on-surface-muted z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">생성 일시</th>
                    <th className="px-4 py-3 text-right font-medium w-24">크기</th>
                    <th className="w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default bg-surface-card">
                  {backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 text-on-surface">{b.createdAt}</td>
                      <td className="px-4 py-3 text-right text-on-surface-muted w-24">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-4 py-3 text-center w-24">
                        <button
                          onClick={() => handleRestoreClick(b.filename)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
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

        {/* 데이터 초기화 (Danger Zone) */}
        <section className="bg-surface-card rounded-lg border border-danger-200/60 dark:border-danger-900/50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-2 bg-danger-50 dark:bg-danger-950/50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-danger-600 dark:text-danger-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-danger-700 dark:text-danger-400">데이터 초기화</h4>
                <p className="text-sm text-on-surface-muted mt-1">
                  모든 데이터를 삭제하고 앱을 초기 상태로 되돌립니다. 삭제 전 백업이 자동으로 생성됩니다.
                </p>
              </div>
            </div>
            <button
              onClick={handleClearAllData}
              disabled={clearLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-danger-600 dark:text-danger-400 border border-danger-200 dark:border-danger-800 rounded-lg hover:bg-danger-50 dark:hover:bg-danger-950 transition-colors cursor-pointer disabled:opacity-50"
            >
              {clearLoading ? "삭제 중..." : "전체 데이터 삭제"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
