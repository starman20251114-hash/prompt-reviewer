import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../lib/api";

export function HealthPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  return (
    <div>
      <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>ヘルスチェック</h2>
      <p style={{ marginBottom: "16px", color: "#a6adc8" }}>
        サーバー（GET /health）との疎通確認を行います。
      </p>
      <div
        style={{
          padding: "16px",
          backgroundColor: "#313244",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        {isLoading && <p style={{ margin: 0 }}>確認中...</p>}
        {isError && (
          <div>
            <p style={{ margin: "0 0 8px", color: "#f38ba8" }}>サーバーに接続できません</p>
            <pre style={{ margin: 0, fontSize: "12px", color: "#f38ba8" }}>
              {error instanceof Error ? error.message : "不明なエラー"}
            </pre>
          </div>
        )}
        {data && (
          <div>
            <p style={{ margin: "0 0 8px", color: "#a6e3a1" }}>サーバーに接続できました</p>
            <pre
              style={{
                margin: 0,
                fontSize: "12px",
                color: "#a6e3a1",
                backgroundColor: "#1e1e2e",
                padding: "8px",
                borderRadius: "4px",
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => void refetch()}
        style={{
          padding: "8px 16px",
          backgroundColor: "#cba6f7",
          color: "#1e1e2e",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        再確認
      </button>
    </div>
  );
}
