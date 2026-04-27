import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  absolute?: boolean;
}

export function LoadingOverlay({
  isLoading,
  message = "데이터를 불러오는 중...",
  absolute = true,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className={`${
        absolute ? "absolute inset-0" : "fixed inset-0"
      } bg-surface/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg`}
    >
      <div className="bg-surface-card p-4 rounded-xl shadow-lg flex flex-col items-center gap-3 border border-border-default">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="text-sm font-medium text-on-surface">{message}</span>
      </div>
    </div>
  );
}
