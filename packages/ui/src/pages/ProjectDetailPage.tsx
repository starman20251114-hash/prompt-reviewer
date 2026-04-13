import { Link, useParams } from "react-router";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>プロジェクト詳細</h2>
      <p style={{ marginBottom: "16px", color: "#a6adc8" }}>
        プロジェクト ID: <code style={{ color: "#cba6f7" }}>{id}</code>
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "12px",
        }}
      >
        {[
          { to: "test-cases", label: "テストケース管理" },
          { to: "prompts", label: "プロンプト管理" },
          { to: "runs", label: "Run 一覧・採点" },
          { to: "settings", label: "プロジェクト設定" },
        ].map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            style={{
              display: "block",
              padding: "16px",
              backgroundColor: "#313244",
              borderRadius: "8px",
              textDecoration: "none",
              color: "#cdd6f4",
              border: "1px solid #45475a",
            }}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
