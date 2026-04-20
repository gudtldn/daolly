import { Wrench } from "lucide-react";

export function GeneralSettings() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Wrench className="w-5 h-5 text-secondary-500" />
        <h3 className="text-lg font-bold text-secondary-800">일반 설정</h3>
      </div>

      <div className="space-y-6">
        {/* 테마 설정 placeholder */}
        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-3">테마</h4>
          <p className="text-sm text-secondary-500">준비 중입니다</p>
        </section>

        {/* 데이터 관리 placeholder */}
        <section className="bg-white rounded-lg border border-secondary-200 p-5">
          <h4 className="text-sm font-semibold text-secondary-700 mb-3">데이터 관리</h4>
          <p className="text-sm text-secondary-500">준비 중입니다</p>
        </section>
      </div>
    </div>
  );
}
