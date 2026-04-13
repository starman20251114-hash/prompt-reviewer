import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: "24px",
            backgroundColor: "#313244",
            borderRadius: "8px",
            border: "1px solid #f38ba8",
          }}
        >
          <h3 style={{ margin: "0 0 12px", color: "#f38ba8", fontSize: "16px" }}>
            予期しないエラーが発生しました
          </h3>
          {this.state.error && (
            <pre
              style={{
                margin: "0 0 16px",
                fontSize: "12px",
                color: "#f38ba8",
                backgroundColor: "#1e1e2e",
                padding: "8px",
                borderRadius: "4px",
                overflow: "auto",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: "6px 14px",
              backgroundColor: "#f38ba8",
              color: "#1e1e2e",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
            }}
          >
            再試行
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
