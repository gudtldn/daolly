import { invoke } from "@tauri-apps/api/core";
import type {
  BackupInfo,
  BackupOutcome,
  BackupSettings,
  StartupNotice,
  StartupStatus,
} from "@/types";

export const databaseApi = {
  getDbPath(): Promise<string> {
    return invoke("get_db_path");
  },

  openDbFolder(): Promise<void> {
    return invoke("open_db_folder");
  },

  listBackups(): Promise<BackupInfo[]> {
    return invoke("list_backups");
  },

  /** 지금 백업 (추가 백업 폴더가 지정되어 있으면 복사까지) */
  backup(): Promise<BackupOutcome> {
    return invoke("backup_db");
  },

  /** 검증 → 현재 데이터 백업 → 앱 재시작하면서 복원 */
  restore(filename: string): Promise<void> {
    return invoke("restore_db", { filename });
  },

  getBackupSettings(): Promise<BackupSettings> {
    return invoke("get_backup_settings");
  },

  /** 추가 백업 폴더 지정(path) 또는 해제(null). 지정하면 바로 백업을 하나 복사해 봅니다. */
  setBackupMirrorDir(path: string | null): Promise<BackupOutcome | null> {
    return invoke("set_backup_mirror_dir", { path });
  },

  /** 기동 결과 (DB를 열지 못했으면 failed) */
  getStartupStatus(): Promise<StartupStatus> {
    return invoke("get_startup_status");
  },

  openLogFolder(): Promise<void> {
    return invoke("open_log_folder");
  },

  /** 기동 중 발생한 알림(복원 결과 등). 한 번 가져가면 비워집니다. */
  takeStartupNotices(): Promise<StartupNotice[]> {
    return invoke("take_startup_notices");
  },

  migrateFromLegacy(legacyPath: string): Promise<void> {
    return invoke("migrate_from_legacy", { legacyPath });
  },

  clearAllData(): Promise<void> {
    return invoke("clear_all_data");
  },
};
