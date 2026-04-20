import { Component, type ErrorInfo, type ReactNode } from "react";

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
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // NOTE: CSS 로드 실패 시에도 동작하도록 인라인 스타일 사용 권장 (현재 시맨틱 토큰 사용 중)
      return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", color: "#1e293b" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>!</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>오류가 발생했습니다</h1>
          <p style={{ color: "#64748b", marginBottom: "1.5rem" }}>
            예기치 않은 문제가 발생했습니다. 앱을 다시 시작해주세요.
          </p>
          <button
            onClick={this.handleReload}
            style={{ padding: "0.5rem 1.5rem", backgroundColor: "#2563eb", color: "white", borderRadius: "0.5rem", border: "none", cursor: "pointer" }}
          >
            앱 재시작
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
