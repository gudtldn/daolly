import { LayoutDashboard } from "lucide-react";

export function DashboardPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-secondary-400">
      <LayoutDashboard className="w-16 h-16 mb-4" />
      <h2 className="text-2xl font-bold text-secondary-600 mb-2">대시보드</h2>
      <p>준비 중입니다</p>
    </div>
  );
}
