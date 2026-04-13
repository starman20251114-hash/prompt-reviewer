interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#313244",
        borderRadius: "8px",
        border: "1px solid #f38ba8",
      }}
    >
      <p
        style={{
          margin: onRetry ? "0 0 12px" : "0",
          color: "#f38ba8",
          fontSize: "14px",
        }}
      >
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
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
      )}
    </div>
  );
}
