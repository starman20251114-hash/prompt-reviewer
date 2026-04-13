import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  type ConversationMessage,
  type Run,
  createRun,
  getProject,
  getPromptVersions,
  getRuns,
  getTestCases,
  setBestRun,
} from "../lib/api";

const colors = {
  bg: "#1e1e2e",
  card: "#313244",
  border: "#45475a",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  accent: "#cba6f7",
  danger: "#f38ba8",
  overlay: "#181825",
  surface: "#45475a",
  muted: "#6c7086",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Step = "select" | "input" | "saved";

export function RunsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("select");
  const [selectedVersionId, setSelectedVersionId] = useState<number | "">("");
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<number | "">("");
  const [llmResponse, setLlmResponse] = useState("");
  const [savedRun, setSavedRun] = useState<Run | null>(null);

  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const { data: promptVersions = [] } = useQuery({
    queryKey: ["prompt-versions", projectId],
    queryFn: () => getPromptVersions(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const { data: testCases = [] } = useQuery({
    queryKey: ["test-cases", projectId],
    queryFn: () => getTestCases(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const { data: existingRuns = [] } = useQuery({
    queryKey: [
      "runs",
      projectId,
      { prompt_version_id: selectedVersionId, test_case_id: selectedTestCaseId },
    ],
    queryFn: () =>
      getRuns(projectId, {
        prompt_version_id: selectedVersionId !== "" ? selectedVersionId : undefined,
        test_case_id: selectedTestCaseId !== "" ? selectedTestCaseId : undefined,
      }),
    enabled: step === "saved" && selectedVersionId !== "" && selectedTestCaseId !== "",
  });

  const createRunMutation = useMutation({
    mutationFn: (data: {
      prompt_version_id: number;
      test_case_id: number;
      conversation: ConversationMessage[];
    }) =>
      createRun(projectId, {
        ...data,
        model: "manual",
        temperature: 0,
        api_provider: "manual",
      }),
    onSuccess: (run) => {
      setSavedRun(run);
      setStep("saved");
      void queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
    },
  });

  const setBestMutation = useMutation({
    mutationFn: (runId: number) => setBestRun(projectId, runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs", projectId] });
    },
  });

  const selectedVersion =
    selectedVersionId !== "" ? promptVersions.find((v) => v.id === selectedVersionId) : undefined;
  const selectedTestCase =
    selectedTestCaseId !== "" ? testCases.find((tc) => tc.id === selectedTestCaseId) : undefined;

  function handleStartRun() {
    if (selectedVersionId === "" || selectedTestCaseId === "") return;
    setLlmResponse("");
    setStep("input");
  }

  function handleSaveRun() {
    if (!selectedTestCase || selectedVersionId === "" || selectedTestCaseId === "") return;
    if (!llmResponse.trim()) return;

    const conversation: ConversationMessage[] = [
      ...selectedTestCase.turns,
      { role: "assistant", content: llmResponse.trim() },
    ];

    createRunMutation.mutate({
      prompt_version_id: selectedVersionId,
      test_case_id: selectedTestCaseId,
      conversation,
    });
  }

  function handleNewRun() {
    setSavedRun(null);
    setStep("select");
  }

  function getLastAssistantMessage(conversation: ConversationMessage[]): string {
    const assistantMessages = conversation.filter((m) => m.role === "assistant");
    return assistantMessages[assistantMessages.length - 1]?.content ?? "";
  }

  return (
    <div style={{ color: colors.text }}>
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px" }}>Run 実行・管理</h2>
          {project && (
            <p style={{ margin: 0, color: colors.subtext, fontSize: "14px" }}>{project.name}</p>
          )}
        </div>
      </div>

      {/* Step 1: 選択フォーム */}
      {step === "select" && (
        <div
          style={{
            backgroundColor: colors.card,
            borderRadius: "8px",
            border: `1px solid ${colors.border}`,
            padding: "24px",
            maxWidth: "600px",
          }}
        >
          <h3 style={{ margin: "0 0 20px", fontSize: "16px", color: colors.accent }}>
            Run を開始する
          </h3>

          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="select-version"
              style={{
                display: "block",
                fontSize: "13px",
                color: colors.subtext,
                marginBottom: "6px",
                fontWeight: 600,
              }}
            >
              プロンプトバージョン
            </label>
            <select
              id="select-version"
              value={selectedVersionId}
              onChange={(e) =>
                setSelectedVersionId(e.target.value === "" ? "" : Number(e.target.value))
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                backgroundColor: colors.overlay,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.text,
                fontSize: "14px",
              }}
            >
              <option value="">-- 選択してください --</option>
              {promptVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version}
                  {v.name ? ` - ${v.name}` : ""}
                </option>
              ))}
            </select>
            {promptVersions.length === 0 && (
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: colors.muted }}>
                プロンプトバージョンがありません。先にバージョンを作成してください。
              </p>
            )}
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="select-test-case"
              style={{
                display: "block",
                fontSize: "13px",
                color: colors.subtext,
                marginBottom: "6px",
                fontWeight: 600,
              }}
            >
              テストケース
            </label>
            <select
              id="select-test-case"
              value={selectedTestCaseId}
              onChange={(e) =>
                setSelectedTestCaseId(e.target.value === "" ? "" : Number(e.target.value))
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                backgroundColor: colors.overlay,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.text,
                fontSize: "14px",
              }}
            >
              <option value="">-- 選択してください --</option>
              {testCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.title}
                </option>
              ))}
            </select>
            {testCases.length === 0 && (
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: colors.muted }}>
                テストケースがありません。先にテストケースを作成してください。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleStartRun}
            disabled={selectedVersionId === "" || selectedTestCaseId === ""}
            style={{
              padding: "8px 20px",
              backgroundColor:
                selectedVersionId === "" || selectedTestCaseId === ""
                  ? colors.muted
                  : colors.accent,
              color: colors.overlay,
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor:
                selectedVersionId === "" || selectedTestCaseId === "" ? "not-allowed" : "pointer",
            }}
          >
            Run を開始
          </button>
        </div>
      )}

      {/* Step 2: Run 実行UI */}
      {step === "input" && selectedVersion && selectedTestCase && (
        <div>
          <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={() => setStep("select")}
              style={{
                padding: "6px 12px",
                backgroundColor: "transparent",
                color: colors.subtext,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ← 戻る
            </button>
            <span style={{ color: colors.subtext, fontSize: "14px" }}>
              v{selectedVersion.version}
              {selectedVersion.name ? ` - ${selectedVersion.name}` : ""} × {selectedTestCase.title}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {/* 左カラム: テストケース表示 */}
            <div
              style={{
                backgroundColor: colors.card,
                borderRadius: "8px",
                border: `1px solid ${colors.border}`,
                padding: "20px",
              }}
            >
              <h3
                style={{
                  margin: "0 0 16px",
                  fontSize: "15px",
                  color: colors.accent,
                }}
              >
                テストケース: {selectedTestCase.title}
              </h3>

              {/* 会話ターン表示 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {selectedTestCase.turns.map((turn, index) => (
                  <div
                    key={`turn-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: ターン配列は順序で管理するため index をキーとして使用
                      index
                    }`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: turn.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: colors.muted,
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {turn.role === "user" ? "User" : "Assistant"}
                    </span>
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "10px 14px",
                        borderRadius:
                          turn.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                        backgroundColor:
                          turn.role === "user" ? `${colors.accent}33` : colors.surface,
                        border: `1px solid ${
                          turn.role === "user" ? `${colors.accent}55` : colors.border
                        }`,
                        fontSize: "14px",
                        lineHeight: "1.5",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {turn.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* 期待される説明 */}
              {selectedTestCase.expected_description && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    backgroundColor: `${colors.yellow}22`,
                    border: `1px solid ${colors.yellow}44`,
                    borderRadius: "6px",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: "12px",
                      color: colors.yellow,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    期待される応答の説明
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      color: colors.subtext,
                      lineHeight: "1.5",
                    }}
                  >
                    {selectedTestCase.expected_description}
                  </p>
                </div>
              )}
            </div>

            {/* 右カラム: 手動入力エリア */}
            <div
              style={{
                backgroundColor: colors.card,
                borderRadius: "8px",
                border: `1px solid ${colors.border}`,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "15px",
                  color: colors.accent,
                }}
              >
                LLM 応答の入力
              </h3>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "13px",
                  color: colors.subtext,
                }}
              >
                LLM 応答を手動で入力してください
              </p>

              <textarea
                value={llmResponse}
                onChange={(e) => setLlmResponse(e.target.value)}
                placeholder="LLM の応答をここにペーストまたは入力してください..."
                style={{
                  flex: 1,
                  minHeight: "200px",
                  padding: "12px",
                  backgroundColor: colors.overlay,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "6px",
                  color: colors.text,
                  fontSize: "14px",
                  lineHeight: "1.5",
                  resize: "vertical",
                  fontFamily: "inherit",
                  marginBottom: "16px",
                }}
              />

              <div style={{ display: "flex", gap: "8px", flexDirection: "column" }}>
                <button
                  type="button"
                  onClick={handleSaveRun}
                  disabled={!llmResponse.trim() || createRunMutation.isPending}
                  style={{
                    padding: "10px 20px",
                    backgroundColor:
                      !llmResponse.trim() || createRunMutation.isPending
                        ? colors.muted
                        : colors.green,
                    color: colors.overlay,
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor:
                      !llmResponse.trim() || createRunMutation.isPending
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {createRunMutation.isPending ? "保存中..." : "Run を保存"}
                </button>

                {/* TODO: Phase 2 - LLM実行ボタン */}
                <button
                  type="button"
                  disabled
                  title="Phase 2 で実装予定"
                  style={{
                    padding: "10px 20px",
                    backgroundColor: colors.muted,
                    color: colors.overlay,
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "not-allowed",
                    opacity: 0.5,
                  }}
                >
                  LLM 実行（Phase 2）
                </button>
              </div>

              {createRunMutation.isError && (
                <p
                  style={{
                    marginTop: "12px",
                    color: colors.danger,
                    fontSize: "13px",
                  }}
                >
                  保存に失敗しました。もう一度お試しください。
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: 保存後の表示 */}
      {step === "saved" && savedRun && selectedVersion && selectedTestCase && (
        <div>
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: `${colors.green}22`,
              border: `1px solid ${colors.green}44`,
              borderRadius: "6px",
              marginBottom: "20px",
              color: colors.green,
              fontSize: "14px",
            }}
          >
            Run を保存しました（ID: {savedRun.id}）
          </div>

          <div style={{ marginBottom: "20px", display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={handleNewRun}
              style={{
                padding: "8px 20px",
                backgroundColor: colors.accent,
                color: colors.overlay,
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              新しい Run を作成
            </button>
          </div>

          {/* 保存したRunの内容 */}
          <div
            style={{
              backgroundColor: colors.card,
              borderRadius: "8px",
              border: `1px solid ${colors.border}`,
              padding: "20px",
              marginBottom: "20px",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: "15px",
                color: colors.accent,
              }}
            >
              保存した Run の内容
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: colors.muted }}>
              v{selectedVersion.version}
              {selectedVersion.name ? ` - ${selectedVersion.name}` : ""} × {selectedTestCase.title}{" "}
              · {formatDate(savedRun.created_at)}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {savedRun.conversation.map((msg, index) => (
                <div
                  key={`msg-${
                    // biome-ignore lint/suspicious/noArrayIndexKey: 会話配列は順序で管理するため index をキーとして使用
                    index
                  }`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color: colors.muted,
                      marginBottom: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {msg.role === "user" ? "User" : "Assistant"}
                  </span>
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius:
                        msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      backgroundColor: msg.role === "user" ? `${colors.accent}33` : colors.surface,
                      border: `1px solid ${
                        msg.role === "user" ? `${colors.accent}55` : colors.border
                      }`,
                      fontSize: "14px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 既存のRun一覧 */}
          <div
            style={{
              backgroundColor: colors.card,
              borderRadius: "8px",
              border: `1px solid ${colors.border}`,
              padding: "20px",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: "15px",
                color: colors.accent,
              }}
            >
              過去の Run 一覧
            </h3>
            {existingRuns.length === 0 ? (
              <p style={{ color: colors.muted, fontSize: "14px" }}>まだ Run がありません。</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {existingRuns.map((run) => {
                  const lastResponse = getLastAssistantMessage(run.conversation);
                  return (
                    <div
                      key={run.id}
                      style={{
                        padding: "14px",
                        backgroundColor: colors.overlay,
                        borderRadius: "6px",
                        border: `1px solid ${run.is_best ? colors.yellow : colors.border}`,
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "6px",
                          }}
                        >
                          <span style={{ fontSize: "13px", color: colors.muted }}>
                            Run #{run.id}
                          </span>
                          {run.is_best && (
                            <span
                              style={{
                                padding: "2px 8px",
                                backgroundColor: `${colors.yellow}33`,
                                border: `1px solid ${colors.yellow}55`,
                                borderRadius: "4px",
                                fontSize: "11px",
                                color: colors.yellow,
                                fontWeight: 600,
                              }}
                            >
                              ベスト回答
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "12px",
                              color: colors.muted,
                              marginLeft: "auto",
                            }}
                          >
                            {formatDate(run.created_at)}
                          </span>
                        </div>
                        {lastResponse && (
                          <p
                            style={{
                              margin: 0,
                              fontSize: "13px",
                              color: colors.subtext,
                              lineHeight: "1.5",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {lastResponse}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setBestMutation.mutate(run.id)}
                        disabled={setBestMutation.isPending || run.is_best}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: run.is_best ? `${colors.yellow}22` : "transparent",
                          color: run.is_best ? colors.yellow : colors.muted,
                          border: `1px solid ${run.is_best ? `${colors.yellow}55` : colors.border}`,
                          borderRadius: "6px",
                          fontSize: "12px",
                          cursor:
                            run.is_best || setBestMutation.isPending ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {run.is_best ? "ベスト済み" : "ベストに設定"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
