import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Info } from "lucide-react";

export function AppInfoSettings() {
  const [version, setVersion] = useState("...");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Info className="w-5 h-5 text-on-surface-muted" />
        <h3 className="text-lg font-bold text-on-surface">앱 정보</h3>
      </div>

      <div className="space-y-6">
        <section className="bg-surface-card rounded-lg border border-border-default p-5">
          <h4 className="text-sm font-semibold text-on-surface mb-4">Sidekick</h4>
          <dl className="space-y-3 text-sm">
            <div className="flex">
              <dt className="w-24 text-on-surface-muted shrink-0">버전</dt>
              <dd className="text-on-surface">{version}</dd>
            </div>
            <div className="flex">
              <dt className="w-24 text-on-surface-muted shrink-0">프레임워크</dt>
              <dd className="text-on-surface">Tauri v2</dd>
            </div>
            <div className="flex">
              <dt className="w-24 text-on-surface-muted shrink-0">프론트엔드</dt>
              <dd className="text-on-surface">React 19 + TypeScript</dd>
            </div>
          </dl>
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
