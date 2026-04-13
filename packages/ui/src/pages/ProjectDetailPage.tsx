import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { getProject } from "../lib/api";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const title = isLoading
    ? "読み込み中..."
    : isError
      ? "プロジェクト詳細"
      : (project?.name ?? "プロジェクト詳細");

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>{title}</h2>
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
