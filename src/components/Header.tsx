import { useEffect, useState } from "react";
import { useLocation } from "react-router";

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
      <div className="text-lg font-bold text-secondary-700 leading-none">
        {formatTime(now)}
      </div>
      <div className="text-xs text-secondary-400 mt-1">
        {formatDate(now)}
      </div>
    </div>
  );
}

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "";

  return (
    <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 shrink-0 border-b border-secondary-200">
      <h2 className="text-xl font-bold text-secondary-800">{title}</h2>
      <Clock />
    </header>
  );
}
