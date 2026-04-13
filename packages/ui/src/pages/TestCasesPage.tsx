import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  type TestCase,
  type Turn,
  createTestCase,
  deleteTestCase,
  getTestCases,
  updateTestCase,
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
};

// ターン操作ユーティリティ
function createEmptyTurn(): Turn {
  return { role: "user", content: "" };
}

// ターン編集フォームコンポーネント
type TurnEditorProps = {
  turns: Turn[];
  onChange: (turns: Turn[]) => void;
};

function TurnEditor({ turns, onChange }: TurnEditorProps) {
  function handleRoleChange(index: number, role: "user" | "assistant") {
    const updated = turns.map((t, i) => (i === index ? { ...t, role } : t));
    onChange(updated);
  }

  function handleContentChange(index: number, content: string) {
    const updated = turns.map((t, i) => (i === index ? { ...t, content } : t));
    onChange(updated);
  }

  function handleAddTurn() {
    onChange([...turns, createEmptyTurn()]);
  }

  function handleRemoveTurn(index: number) {
    onChange(turns.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const updated = turns.map((t, i) => {
      if (i === index - 1) return turns[index] ?? t;
      if (i === index) return turns[index - 1] ?? t;
      return t;
    });
    onChange(updated);
  }

  function handleMoveDown(index: number) {
    if (index === turns.length - 1) return;
    const updated = turns.map((t, i) => {
      if (i === index) return turns[index + 1] ?? t;
      if (i === index + 1) return turns[index] ?? t;
      return t;
    });
    onChange(updated);
  }

  return (
    <div>
      {turns.map((turn, index) => (
        <div
          key={`turn-${
            // biome-ignore lint/suspicious/noArrayIndexKey: ターン配列は順序で管理するため index をキーとして使用
            index
          }`}
          style={{
            marginBottom: "12px",
            padding: "12px",
            background: colors.bg,
            borderRadius: "8px",
            border: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "13px", color: colors.muted, minWidth: "40px" }}>
              #{index + 1}
            </span>
            <select
              value={turn.role}
              onChange={(e) => handleRoleChange(index, e.target.value as "user" | "assistant")}
              style={{
                padding: "4px 8px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: turn.role === "user" ? colors.accent : colors.green,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                style={{
                  padding: "2px 8px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  color: index === 0 ? colors.muted : colors.subtext,
                  fontSize: "12px",
                  cursor: index === 0 ? "not-allowed" : "pointer",
                }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === turns.length - 1}
                style={{
                  padding: "2px 8px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  color: index === turns.length - 1 ? colors.muted : colors.subtext,
                  fontSize: "12px",
                  cursor: index === turns.length - 1 ? "not-allowed" : "pointer",
                }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleRemoveTurn(index)}
                style={{
                  padding: "2px 8px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  color: colors.danger,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                削除
              </button>
            </div>
          </div>
          <textarea
            value={turn.content}
            onChange={(e) => handleContentChange(index, e.target.value)}
            placeholder={
              turn.role === "user" ? "ユーザーの入力を記述..." : "アシスタントの期待応答を記述..."
            }
            rows={3}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              color: colors.text,
              fontSize: "13px",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddTurn}
        style={{
          padding: "6px 14px",
          background: "transparent",
          border: `1px dashed ${colors.border}`,
          borderRadius: "6px",
          color: colors.subtext,
          fontSize: "13px",
          cursor: "pointer",
          width: "100%",
          marginTop: "4px",
        }}
      >
        + ターンを追加
      </button>
    </div>
  );
}

// テストケースフォームの状態型
type InputMode = "turns" | "context";

type TestCaseFormData = {
  title: string;
  inputMode: InputMode;
  turns: Turn[];
  context_content: string;
  expected_description: string;
};

function getInitialFormData(testCase?: TestCase): TestCaseFormData {
  if (testCase) {
    const inputMode: InputMode = testCase.turns.length === 0 ? "context" : "turns";
    return {
      title: testCase.title,
      inputMode,
      turns: testCase.turns,
      context_content: testCase.context_content ?? "",
      expected_description: testCase.expected_description ?? "",
    };
  }
  return {
    title: "",
    inputMode: "turns",
    turns: [createEmptyTurn()],
    context_content: "",
    expected_description: "",
  };
}

// 作成・編集モーダルコンポーネント
type TestCaseModalProps = {
  testCase?: TestCase;
  onClose: () => void;
  onSubmit: (data: TestCaseFormData) => void;
  isLoading: boolean;
};

function TestCaseModal({ testCase, onClose, onSubmit, isLoading }: TestCaseModalProps) {
  const [formData, setFormData] = useState<TestCaseFormData>(() =>
    getInitialFormData(testCase),
  );
  const isEdit = !!testCase;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    if (!trimmedTitle) return;
    if (formData.inputMode === "turns") {
      const validTurns = formData.turns.filter((t) => t.content.trim());
      onSubmit({ ...formData, title: trimmedTitle, turns: validTurns, context_content: "" });
    } else {
      onSubmit({ ...formData, title: trimmedTitle, turns: [] });
    }
  }

  const isSubmittable = formData.title.trim() !== "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 100,
        overflowY: "auto",
        padding: "40px 0",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: colors.overlay,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          padding: "28px",
          width: "600px",
          maxWidth: "90vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 20px",
            fontSize: "18px",
            color: colors.text,
          }}
        >
          {isEdit ? "テストケースを編集" : "テストケースを作成"}
        </h3>
        <form onSubmit={handleSubmit}>
          {/* タイトル */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="test-case-title"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "14px",
                color: colors.subtext,
              }}
            >
              タイトル
              <span style={{ color: colors.danger, marginLeft: "4px" }}>*</span>
            </label>
            <input
              id="test-case-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="例: 基本的な挨拶テスト"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 入力モード切替 */}
          <div style={{ marginBottom: "16px" }}>
            <p
              style={{
                fontSize: "14px",
                color: colors.subtext,
                margin: "0 0 8px",
              }}
            >
              入力モード
            </p>
            <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: `1px solid ${colors.border}` }}>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, inputMode: "turns" }))}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  background: formData.inputMode === "turns" ? colors.accent : "transparent",
                  border: "none",
                  color: formData.inputMode === "turns" ? colors.overlay : colors.subtext,
                  fontSize: "13px",
                  fontWeight: formData.inputMode === "turns" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                ターン形式
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, inputMode: "context" }))}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  background: formData.inputMode === "context" ? colors.accent : "transparent",
                  border: "none",
                  borderLeft: `1px solid ${colors.border}`,
                  color: formData.inputMode === "context" ? colors.overlay : colors.subtext,
                  fontSize: "13px",
                  fontWeight: formData.inputMode === "context" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                テキスト形式
              </button>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: colors.muted }}>
              {formData.inputMode === "turns"
                ? "会話をターンごとに分けて入力します（ターンは任意）。"
                : "会話履歴をまとめてテキストとして入力します（context_content）。"}
            </p>
          </div>

          {/* 入力内容 */}
          {formData.inputMode === "turns" ? (
            <div style={{ marginBottom: "16px" }}>
              <p
                style={{
                  fontSize: "14px",
                  color: colors.subtext,
                  margin: "0 0 8px",
                }}
              >
                会話ターン（任意）
              </p>
              <TurnEditor
                turns={formData.turns}
                onChange={(turns) => setFormData((prev) => ({ ...prev, turns }))}
              />
            </div>
          ) : (
            <div style={{ marginBottom: "16px" }}>
              <label
                htmlFor="test-case-context"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "14px",
                  color: colors.subtext,
                }}
              >
                コンテキスト（任意）
              </label>
              <textarea
                id="test-case-context"
                value={formData.context_content}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, context_content: e.target.value }))
                }
                placeholder="会話履歴や参照テキストをまとめて入力..."
                rows={6}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  color: colors.text,
                  fontSize: "13px",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                }}
              />
            </div>
          )}

          {/* 期待記述 */}
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="test-case-expected"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "14px",
                color: colors.subtext,
              }}
            >
              期待記述（任意）
            </label>
            <textarea
              id="test-case-expected"
              value={formData.expected_description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, expected_description: e.target.value }))
              }
              placeholder="期待するアシスタントの振る舞いを記述..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 20px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.subtext,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!isSubmittable || isLoading}
              style={{
                padding: "8px 20px",
                background: colors.accent,
                border: "none",
                borderRadius: "8px",
                color: colors.overlay,
                fontSize: "14px",
                fontWeight: 600,
                cursor: !isSubmittable || isLoading ? "not-allowed" : "pointer",
                opacity: !isSubmittable || isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? (isEdit ? "保存中..." : "作成中...") : isEdit ? "保存" : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 削除確認ダイアログ
type DeleteDialogProps = {
  testCase: TestCase;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
};

function DeleteDialog({ testCase, onClose, onConfirm, isLoading }: DeleteDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: colors.overlay,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          padding: "28px",
          width: "420px",
          maxWidth: "90vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: "18px",
            color: colors.text,
          }}
        >
          テストケースを削除
        </h3>
        <p style={{ margin: "0 0 8px", color: colors.subtext, fontSize: "14px" }}>
          以下のテストケースを削除してもよいですか？
        </p>
        <p
          style={{
            margin: "0 0 20px",
            color: colors.text,
            fontWeight: 600,
            fontSize: "15px",
            padding: "8px 12px",
            background: colors.card,
            borderRadius: "6px",
          }}
        >
          {testCase.title}
        </p>
        <p style={{ margin: "0 0 24px", color: colors.danger, fontSize: "13px" }}>
          この操作は取り消せません。
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              color: colors.subtext,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: "8px 20px",
              background: colors.danger,
              border: "none",
              borderRadius: "8px",
              color: colors.overlay,
              fontSize: "14px",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? "削除中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// テストケースカードコンポーネント
type TestCaseCardProps = {
  testCase: TestCase;
  onEdit: (testCase: TestCase) => void;
  onDelete: (testCase: TestCase) => void;
};

function TestCaseCard({ testCase, onEdit, onDelete }: TestCaseCardProps) {
  const isContextMode = testCase.turns.length === 0;
  const userTurns = testCase.turns.filter((t) => t.role === "user").length;
  const assistantTurns = testCase.turns.filter((t) => t.role === "assistant").length;

  return (
    <div
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 600,
            color: colors.text,
            wordBreak: "break-word",
            lineHeight: 1.4,
          }}
        >
          {testCase.title}
        </h3>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onEdit(testCase)}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              color: colors.accent,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(testCase)}
            style={{
              padding: "4px 10px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "6px",
              color: colors.danger,
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            削除
          </button>
        </div>
      </div>

      {/* ターン情報バッジ */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {isContextMode ? (
          <span
            style={{
              padding: "2px 8px",
              background: colors.overlay,
              borderRadius: "4px",
              fontSize: "12px",
              color: colors.accent,
              border: `1px solid ${colors.border}`,
            }}
          >
            テキスト形式
          </span>
        ) : (
          <>
            <span
              style={{
                padding: "2px 8px",
                background: colors.overlay,
                borderRadius: "4px",
                fontSize: "12px",
                color: colors.subtext,
                border: `1px solid ${colors.border}`,
              }}
            >
              計 {testCase.turns.length} ターン
            </span>
            {userTurns > 0 && (
              <span
                style={{
                  padding: "2px 8px",
                  background: colors.overlay,
                  borderRadius: "4px",
                  fontSize: "12px",
                  color: colors.accent,
                  border: `1px solid ${colors.border}`,
                }}
              >
                user × {userTurns}
              </span>
            )}
            {assistantTurns > 0 && (
              <span
                style={{
                  padding: "2px 8px",
                  background: colors.overlay,
                  borderRadius: "4px",
                  fontSize: "12px",
                  color: colors.green,
                  border: `1px solid ${colors.border}`,
                }}
              >
                assistant × {assistantTurns}
              </span>
            )}
          </>
        )}
        {testCase.expected_description && (
          <span
            style={{
              padding: "2px 8px",
              background: colors.overlay,
              borderRadius: "4px",
              fontSize: "12px",
              color: colors.yellow,
              border: `1px solid ${colors.border}`,
            }}
          >
            期待記述あり
          </span>
        )}
      </div>

      {/* プレビュー */}
      {isContextMode
        ? testCase.context_content && (
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: colors.muted,
                lineHeight: 1.5,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                fontFamily: "monospace",
              }}
            >
              {testCase.context_content}
            </p>
          )
        : testCase.turns[0] && (
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: colors.muted,
                lineHeight: 1.5,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {testCase.turns[0].content}
            </p>
          )}
    </div>
  );
}

// メインページコンポーネント
export function TestCasesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TestCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);

  const {
    data: testCases,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["test-cases", projectId],
    queryFn: () => getTestCases(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const createMutation = useMutation({
    mutationFn: (data: TestCaseFormData) =>
      createTestCase(projectId, {
        title: data.title,
        turns: data.turns,
        context_content: data.context_content || undefined,
        expected_description: data.expected_description || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id: tcId, data }: { id: number; data: TestCaseFormData }) =>
      updateTestCase(projectId, tcId, {
        title: data.title,
        turns: data.turns,
        context_content: data.context_content,
        expected_description: data.expected_description || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tcId: number) => deleteTestCase(projectId, tcId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", color: colors.text }}>テストケース管理</h2>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          style={{
            padding: "8px 18px",
            background: colors.accent,
            border: "none",
            borderRadius: "8px",
            color: colors.overlay,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + 新規作成
        </button>
      </div>

      <p style={{ color: colors.subtext, marginBottom: "24px", margin: "0 0 24px" }}>
        プロジェクトのテストケース一覧です。参照情報と期待記述を管理します。
      </p>

      {isLoading && (
        <p style={{ color: colors.muted, textAlign: "center", padding: "40px 0" }}>読み込み中...</p>
      )}

      {isError && (
        <p style={{ color: colors.danger, textAlign: "center", padding: "40px 0" }}>
          エラーが発生しました: {error instanceof Error ? error.message : "不明なエラー"}
        </p>
      )}

      {!isLoading && !isError && testCases && testCases.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: colors.muted,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: "16px" }}>テストケースがまだありません</p>
          <p style={{ margin: 0, fontSize: "14px" }}>
            「新規作成」ボタンから最初のテストケースを作成してください。
          </p>
        </div>
      )}

      {!isLoading && !isError && testCases && testCases.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {testCases.map((tc) => (
            <TestCaseCard
              key={tc.id}
              testCase={tc}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {isCreateOpen && (
        <TestCaseModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {editTarget && (
        <TestCaseModal
          testCase={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, data })}
          isLoading={updateMutation.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          testCase={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
