import { useParams } from "react-router";

export function TestCasesPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>テストケース管理</h2>
      <p style={{ color: "#a6adc8" }}>
        プロジェクト <code style={{ color: "#cba6f7" }}>{id}</code> のテストケース一覧。
      </p>
      <p style={{ color: "#6c7086", marginTop: "24px" }}>（実装予定）</p>
    </div>
  );
}
