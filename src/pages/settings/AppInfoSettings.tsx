import { Info } from "lucide-react";

export function AppInfoSettings() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Info className="w-5 h-5 text-secondary-500" />
        <h3 className="text-lg font-bold text-secondary-800">앱 정보</h3>
      </div>

      <div className="space-y-6">
        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-4">Sidekick</h4>
          <dl className="space-y-3 text-sm">
            <div className="flex">
              <dt className="w-24 text-secondary-500 shrink-0">버전</dt>
              <dd className="text-secondary-800">0.1.0</dd>
            </div>
            <div className="flex">
              <dt className="w-24 text-secondary-500 shrink-0">프레임워크</dt>
              <dd className="text-secondary-800">Tauri v2</dd>
            </div>
            <div className="flex">
              <dt className="w-24 text-secondary-500 shrink-0">프론트엔드</dt>
              <dd className="text-secondary-800">React 19 + TypeScript</dd>
            </div>
          </dl>
        </section>

        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-3">라이선스</h4>
          <p className="text-sm text-secondary-800 font-medium">MIT License</p>
          <p className="text-xs text-secondary-500 mt-1">Copyright (c) 2026 siwoohyong</p>
        </section>
      </div>
    </div>
  );
}
