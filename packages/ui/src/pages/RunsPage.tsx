import { useParams } from "react-router";

export function RunsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>Run 一覧・採点</h2>
      <p style={{ color: "#a6adc8" }}>
        プロジェクト <code style={{ color: "#cba6f7" }}>{id}</code> の実行結果と採点。
      </p>
      <p style={{ color: "#6c7086", marginTop: "24px" }}>（実装予定）</p>
    </div>
  );
}
