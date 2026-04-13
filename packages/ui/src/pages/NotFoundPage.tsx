import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: "48px",
          fontWeight: "bold",
          color: "#cba6f7",
        }}
      >
        404
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: "18px", color: "#cdd6f4" }}>
        ページが見つかりません
      </p>
      <p style={{ margin: "0 0 24px", color: "#a6adc8" }}>
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        to="/"
        style={{
          padding: "8px 20px",
          backgroundColor: "#cba6f7",
          color: "#1e1e2e",
          textDecoration: "none",
          borderRadius: "4px",
          fontWeight: "bold",
        }}
      >
        トップに戻る
      </Link>
    </div>
  );
}
