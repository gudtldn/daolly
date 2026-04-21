import { useEffect } from "react";
import { useDialogStore } from "@/stores/dialogStore";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export function GlobalDialog() {
  const { isOpen, config, close } = useDialogStore();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (
        e.key === "Enter" &&
        config?.type !== "custom" &&
        !config?.isDestructive &&
        document.activeElement?.tagName !== "BUTTON"
      ) {
        close(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, config, close]);

  if (!isOpen && !config) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-secondary-900/40 backdrop-blur-sm"
        onClick={() => close(false)}
      />

      {/* dialog card */}
      <div
        className={`relative bg-surface-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border-default transform transition-all duration-200 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center space-x-2">
            {config?.isDestructive && <AlertCircle className="w-5 h-5 text-danger-500" />}
            {!config?.isDestructive && config?.type === "alert" && (
              <Info className="w-5 h-5 text-primary-500" />
            )}
            {!config?.isDestructive && config?.type === "confirm" && (
              <CheckCircle2 className="w-5 h-5 text-success-500" />
            )}
            <h2 className="text-lg font-bold text-on-surface">{config?.title}</h2>
          </div>
          <button
            onClick={() => close(false)}
            className="text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* body */}
        <div className="px-6 py-4 text-on-surface-muted">
          {config?.type === "custom" ? config.customContent : <p>{config?.message}</p>}
        </div>

        {/* footer - hideFooter: true 이면 렌더링 생략 */}
        {!config?.hideFooter && (
          <div className="px-6 py-4 bg-surface-elevated flex justify-end space-x-3 rounded-b-xl border-t border-border-default">
            {config?.type !== "alert" && (
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface bg-surface-card border border-border-default rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                {config?.cancelText || "취소"}
              </button>
            )}
            <button
              onClick={() => close(true)}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                config?.isDestructive
                  ? "bg-danger-600 hover:bg-danger-700 focus:ring-danger-500"
                  : "bg-primary-600 hover:bg-primary-700 focus:ring-primary-500"
              }`}
            >
              {config?.confirmText || "확인"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
