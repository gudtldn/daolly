import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "대시보드",
  "/pos": "접수 / 출고",
  "/customers": "고객 관리",
  "/sales": "매출 관리",
  "/settings": "환경 설정",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

// 시계를 별도 컴포넌트로 분리하여 1초 리렌더링 범위를 격리
function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-right">
      <div className="text-lg font-bold text-on-surface leading-none">
        {formatTime(now)}
      </div>
      <div className="text-sm text-on-surface-muted mt-1">
        {formatDate(now)}
      </div>
    </div>
  );
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = pageTitles[location.pathname] ?? "";

  const state = location.state as { canGoBack?: boolean } | null;
  const canGoBack = state?.canGoBack === true;

  return (
    <header className="h-16 bg-surface-card shadow-sm flex items-center justify-between px-6 shrink-0 border-b border-border-default transition-colors duration-200">
      <div className="flex items-center gap-3">
        {canGoBack && (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 pl-1.5 pr-3 py-1.5 -ml-1 rounded-lg text-on-surface-muted hover:text-on-surface bg-surface border border-border-default hover:bg-surface-elevated transition-all cursor-pointer shadow-sm"
            aria-label="뒤로 가기"
          >
            <ChevronLeft className="w-5 h-5 -ml-0.5" />
            <span className="text-sm font-bold">이전</span>
          </button>
        )}
        <h2 className="text-xl font-bold text-on-surface">{title}</h2>
      </div>
      <Clock />
    </header>
  );
}
