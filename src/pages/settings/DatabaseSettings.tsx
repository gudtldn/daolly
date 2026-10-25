import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, FolderOpen, DownloadCloud, UploadCloud, AlertTriangle, History, HardDrive } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { databaseApi } from "@/bindings";
import type { BackupInfo, BackupKind, BackupSettings } from "@/types";
import { isRestartDisconnect } from "@/utils/errors";
import { ErrorNotice } from "@/components/ErrorDetails";
import { CreditPaymentReview } from "@/pages/settings/CreditPaymentReview";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_BADGES: Record<BackupKind, { label: string; cls: string }> = {
  manual: { label: "직접 백업", cls: "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300" },
  daily: { label: "자동", cls: "bg-surface-elevated text-on-surface-muted" },
  preMigration: { label: "업데이트 전", cls: "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300" },
  preRestore: { label: "복원 전", cls: "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300" },
  preClear: { label: "초기화 전", cls: "bg-danger-50 text-danger-700 dark:bg-danger-950 dark:text-danger-300" },
  preImport: { label: "가져오기 전", cls: "bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300" },
  legacy: { label: "이전 버전", cls: "bg-surface-elevated text-on-surface-muted" },
};

const MIRROR_HINT = "폴더가 연결되어 있는지 확인해 주세요.";
const MIRROR_FAILED = `추가 백업 폴더에 저장하지 못했습니다. ${MIRROR_HINT}`;

export function DatabaseSettings() {
  const [dbPath, setDbPath] = useState<string>("...");
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({ mirrorDir: null, lastMirror: null });
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const { showCustom } = useDialogStore();

  useEffect(() => {
    databaseApi.getDbPath()
      .then(setDbPath)
      .catch(() => setDbPath("알 수 없음"));
    loadBackups();
    loadBackupSettings();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      setBackups(await databaseApi.listBackups());
    } catch (e: unknown) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const loadBackupSettings = async () => {
    try {
      setBackupSettings(await databaseApi.getBackupSettings());
    } catch (e: unknown) {
      setError(e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await databaseApi.openDbFolder();
    } catch (e: unknown) {
      setError(e);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setError(null);
    setSuccess("");
    try {
      const outcome = await databaseApi.backup();
      setSuccess(`백업 완료: ${outcome.info.createdAt}`);
      if (outcome.mirror && !outcome.mirror.ok) setError(MIRROR_FAILED);
      await Promise.all([loadBackups(), loadBackupSettings()]);
    } catch (e: unknown) {
      setError(e);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleChooseMirror = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "추가 백업 폴더 선택",
    });
    if (!selected) return;

    setMirrorLoading(true);
    setError(null);
    setSuccess("");
    try {
      const outcome = await databaseApi.setBackupMirrorDir(selected);
      if (outcome?.mirror?.ok) {
        setSuccess("추가 백업 폴더를 지정했습니다.");
      } else if (outcome?.mirror) {
        setError(MIRROR_FAILED);
      }
      await Promise.all([loadBackups(), loadBackupSettings()]);
    } catch (e: unknown) {
      setError(e);
    } finally {
      setMirrorLoading(false);
    }
  };

  const handleClearMirror = async () => {
    setError(null);
    try {
      await databaseApi.setBackupMirrorDir(null);
      await loadBackupSettings();
      setSuccess("추가 백업 폴더를 해제했습니다.");
    } catch (e: unknown) {
      setError(e);
    }
  };

  const handleRestoreClick = async (backup: BackupInfo) => {
    const confirmed = await showCustom({
      title: "복원 확인",
      isDestructive: false,
      confirmText: "복원 및 재시작",
      cancelText: "취소",
      customContent: (
        <div>
          <p className="text-sm text-on-surface mb-2">다음 백업 시점으로 복원하시겠습니까?</p>
          <div className="bg-surface-elevated px-3 py-2 rounded-lg mb-4">
            <p className="text-sm font-semibold text-on-surface">
              {backup.createdAt} · {KIND_BADGES[backup.kind].label}
            </p>
          </div>
          <div className="flex items-start gap-2 bg-warning-50 dark:bg-warning-950 border border-warning-200 dark:border-warning-800 rounded-lg px-4 py-3 text-sm text-warning-700 dark:text-warning-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>현재 데이터는 자동으로 백업된 뒤 교체됩니다. 복원 후 앱이 자동으로 재시작됩니다.</span>
          </div>
        </div>
      ),
    });
    if (!confirmed) return;
    setError(null);
    setRestoreLoading(true);
    try {
      await databaseApi.restore(backup.filename);
    } catch (e: unknown) {
      // 재시작으로 인한 연결 끊김은 에러로 처리하지 않음
      if (!isRestartDisconnect(e)) setError(e);
    } finally {
      setRestoreLoading(false);
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
      setError(null);
      try {
        await databaseApi.migrateFromLegacy(selected);
      } catch (e: unknown) {
        // 자동 재시작으로 인한 연결 끊김은 에러로 처리하지 않음
        if (!isRestartDisconnect(e)) throw e;
      }
      toast.success("데이터 이관 완료. 앱을 재시작합니다.");
      await loadBackups();
    } catch (e: unknown) {
      setError(e);
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
    setError(null);
    setSuccess("");
    try {
      await databaseApi.clearAllData();
      setSuccess("모든 데이터가 삭제되었습니다. (삭제 전 백업이 생성되었습니다)");
      await loadBackups();
      toast.success("초기화 완료");
    } catch (e: unknown) {
      setError(e);
    } finally {
      setClearLoading(false);
    }
  };

  const lastMirror = backupSettings.lastMirror;

  return (
    <div className="h-full overflow-y-auto relative">
      <LoadingOverlay isLoading={migrationLoading} message="데이터를 가져오는 중입니다..." absolute={false} />
      <LoadingOverlay isLoading={backupLoading || mirrorLoading} message="데이터베이스 백업 중..." absolute={false} />
      <LoadingOverlay isLoading={restoreLoading} message="복원 중..." absolute={false} />
      <LoadingOverlay isLoading={clearLoading} message="모든 데이터를 삭제 중..." absolute={false} />

      <div className="flex items-center gap-2 mb-6">
        <Database className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">데이터 관리</h3>
      </div>

      {error != null && (
        <ErrorNotice
          error={error}
          className="mb-4 px-4 py-3 bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 rounded-lg text-sm text-danger-700 dark:text-danger-300"
        />
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 rounded-lg text-sm text-success-700 dark:text-success-300">
          {success}
        </div>
      )}

      <div className="space-y-6 pb-10">
        {/* 예전 버전이 남긴 외상 결제 점검 (있을 때만 표시) */}
        <CreditPaymentReview />

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
                예전에 쓰던 고객관리 프로그램의 데이터 파일(customer.db)을 골라 손님과 작업 내역을 가져옵니다.
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

        {/* 추가 백업 폴더 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-on-surface">추가 백업 폴더</h4>
              <p className="text-sm text-on-surface-muted mt-1">
                백업을 USB나 클라우드 폴더에도 함께 저장합니다.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleChooseMirror}
                disabled={mirrorLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors cursor-pointer disabled:opacity-50"
              >
                <HardDrive className="w-4 h-4" />
                {backupSettings.mirrorDir ? "폴더 변경" : "폴더 선택"}
              </button>
              {backupSettings.mirrorDir && (
                <button
                  onClick={handleClearMirror}
                  disabled={mirrorLoading}
                  className="px-4 py-2 text-sm text-on-surface-muted border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50"
                >
                  해제
                </button>
              )}
            </div>
          </div>
          {backupSettings.mirrorDir && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-on-surface-muted font-mono bg-surface-elevated px-3 py-2 rounded-lg break-all">
                {backupSettings.mirrorDir}
              </p>
              {lastMirror && (
                <p className={`text-sm ${lastMirror.ok ? "text-success-700 dark:text-success-300" : "text-danger-700 dark:text-danger-300"}`}>
                  {lastMirror.ok ? `마지막 저장: ${lastMirror.at}` : `${lastMirror.at} 저장 실패. ${MIRROR_HINT}`}
                </p>
              )}
            </div>
          )}
        </section>

        {/* 백업 */}
        <section className="bg-surface-card rounded-lg border border-border-default p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-semibold text-on-surface">백업 내역</h4>
              <p className="text-sm text-on-surface-muted mt-1">
                매일 자동 백업되며, 원하는 시점으로 데이터를 안전하게 복원할 수 있습니다.
              </p>
            </div>
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors cursor-pointer disabled:opacity-50 shadow-sm shrink-0"
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
                    <th className="px-4 py-3 text-left font-medium w-32">종류</th>
                    <th className="px-4 py-3 text-right font-medium w-24">크기</th>
                    <th className="w-28"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default bg-surface-card">
                  {backups.map((b) => (
                    <tr key={b.filename} className="hover:bg-surface-elevated/50 transition-colors">
                      <td className="px-4 py-3 text-on-surface">{b.createdAt}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-sm font-medium whitespace-nowrap ${KIND_BADGES[b.kind].cls}`}>
                          {KIND_BADGES[b.kind].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-on-surface-muted w-24">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-4 py-3 text-center w-28">
                        <button
                          onClick={() => handleRestoreClick(b)}
                          disabled={restoreLoading}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium whitespace-nowrap border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-50"
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
