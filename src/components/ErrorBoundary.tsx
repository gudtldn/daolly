import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { updateApi, isUpdateStatus } from "@/bindings/updates";
import type { UpdateStatus } from "@/types";
import { reportError } from "@/utils/logging";
import { errorDetail, errorMessage, isRestartDisconnect } from "@/utils/errors";
import { ErrorDetails } from "@/components/ErrorDetails";

/**
 * 오류 화면에서도 받아 둔 새 버전을 설치할 수 있게 합니다.
 * (화면이 깨지는 버그는 고친 새 버전으로만 해결할 수 있음)
 */
function UpdateOffer() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    updateApi
      .getStatus()
      .then((s) => {
        if (isUpdateStatus(s)) setStatus(s);
      })
      .catch(() => {});
    const unlisten = updateApi.onStatus(setStatus).catch(() => undefined);
    return () => {
      void unlisten.then((fn) => fn?.());
    };
  }, []);

  const handleInstall = async () => {
    setError(null);
    setInstalling(true);
    try {
      await updateApi.installNow();
    } catch (e) {
      if (!isRestartDisconnect(e)) setError(e);
    } finally {
      setInstalling(false);
    }
  };

  if (status.state === "downloading") {
    return <p className="text-on-surface-muted mb-6">새 버전 받는 중...</p>;
  }
  if (status.state !== "ready") return null;
  return (
    <div className="flex flex-col items-center gap-2 mb-6">
      <p className="text-on-surface">새 버전으로 업데이트하면 해결될 수 있습니다.</p>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {installing ? "설치 중..." : "업데이트 설치"}
      </button>
      {error != null && (
        <div className="text-danger-600 text-sm text-center">
          <p>{errorMessage(error)}</p>
          <ErrorDetails detail={errorDetail(error)} className="mt-1 text-left" />
        </div>
      )}
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  /** 화면이 깨진 원인 (개발자용 '자세한 내용'에 보여줌) */
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError("ErrorBoundary", `${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-on-surface">
          <div className="text-6xl mb-6 font-bold text-danger-500">!</div>
          <h1 className="text-2xl font-bold mb-2">오류가 발생했습니다</h1>
          <p className="text-on-surface-muted mb-6 max-w-xl text-center">
            화면을 그리는 중 프로그램 오류가 생겼습니다. 저장해 둔 데이터에는 영향이 없지만, 입력 중이던 내용은
            다시 입력해야 할 수 있습니다. 다시 시작해도 계속되면 새 버전이 나올 때까지 기다려 주세요.
          </p>
          <UpdateOffer />
          <button
            onClick={this.handleReload}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            다시 시작
          </button>
          <ErrorDetails detail={this.state.error.stack ?? this.state.error.message} className="mt-6 w-full max-w-xl" />
        </div>
      );
    }

    return this.props.children;
  }
}
