import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { updateApi, isUpdateStatus } from "@/bindings/updates";
import type { UpdateStatus } from "@/types";
import { reportError } from "@/utils/logging";
import { errorMessage } from "@/utils/errors";

/**
 * 오류 화면에서도 받아 둔 새 버전을 설치할 수 있게 합니다.
 * (화면이 깨지는 버그는 고친 새 버전으로만 해결할 수 있음)
 */
function UpdateOffer() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    setInstalling(true);
    try {
      await updateApi.installNow();
    } catch (e) {
      const msg = errorMessage(e);
      if (!msg.includes("Could not connect") && !msg.includes("Disconnected")) setError(msg);
    } finally {
      setInstalling(false);
    }
  };

  if (status.state === "downloading") {
    return <p className="text-on-surface-muted mb-6">새 버전({status.version})을 받는 중입니다...</p>;
  }
  if (status.state !== "ready") return null;
  return (
    <div className="flex flex-col items-center gap-2 mb-6">
      <p className="text-on-surface">새 버전({status.version})이 준비되어 있습니다. 설치하면 문제가 해결될 수 있습니다.</p>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {installing ? "설치 중..." : "업데이트 설치"}
      </button>
      {error && <p className="text-danger-600 text-sm">{error}</p>}
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError("ErrorBoundary", `${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-surface text-on-surface">
          <div className="text-6xl mb-6 font-bold text-danger-500">!</div>
          <h1 className="text-2xl font-bold mb-2">오류가 발생했습니다</h1>
          <p className="text-on-surface-muted mb-6">
            예기치 않은 문제가 발생했습니다. 앱을 다시 시작해주세요.
          </p>
          <UpdateOffer />
          <button
            onClick={this.handleReload}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            앱 재시작
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
