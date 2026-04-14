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
import styles from "./TestCasesPage.module.css";

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
          className={styles.turnItem}
        >
          <div className={styles.turnHeader}>
            <span className={styles.turnNumber}>#{index + 1}</span>
            <select
              value={turn.role}
              onChange={(e) => handleRoleChange(index, e.target.value as "user" | "assistant")}
              className={`${styles.turnSelect} ${turn.role === "user" ? styles.turnSelectUser : styles.turnSelectAssistant}`}
            >
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
            <div className={styles.turnControls}>
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className={`${styles.btnTurnBase} ${index === 0 ? styles.btnTurnMoveDisabled : styles.btnTurnMove}`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === turns.length - 1}
                className={`${styles.btnTurnBase} ${index === turns.length - 1 ? styles.btnTurnMoveDisabled : styles.btnTurnMove}`}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleRemoveTurn(index)}
                className={`${styles.btnTurnBase} ${styles.btnTurnDelete}`}
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
            className={styles.turnTextarea}
          />
        </div>
      ))}
      <button type="button" onClick={handleAddTurn} className={styles.btnAddTurn}>
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
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.modalContent}>
        <h3 className={styles.modalTitle}>
          {isEdit ? "テストケースを編集" : "テストケースを作成"}
        </h3>
        <form onSubmit={handleSubmit}>
          {/* タイトル */}
          <div className={styles.fieldGroup}>
            <label htmlFor="test-case-title" className={styles.fieldLabel}>
              タイトル
              <span className={styles.requiredMark}>*</span>
            </label>
            <input
              id="test-case-title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="例: 基本的な挨拶テスト"
              className={styles.fieldInput}
            />
          </div>

          {/* 入力モード切替 */}
          <div className={styles.fieldGroup}>
            <p className={styles.modeLabel}>入力モード</p>
            <div className={styles.modeToggle}>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, inputMode: "turns" }))}
                className={`${styles.btnModeBase} ${formData.inputMode === "turns" ? styles.btnModeActive : styles.btnModeInactive}`}
              >
                ターン形式
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, inputMode: "context" }))}
                className={`${styles.btnModeBase} ${styles.btnModeRight} ${formData.inputMode === "context" ? styles.btnModeActive : styles.btnModeInactive}`}
              >
                テキスト形式
              </button>
            </div>
            <p className={styles.modeHint}>
              {formData.inputMode === "turns"
                ? "会話をターンごとに分けて入力します（ターンは任意）。"
                : "会話履歴をまとめてテキストとして入力します（context_content）。"}
            </p>
          </div>

          {/* 入力内容 */}
          {formData.inputMode === "turns" ? (
            <div className={styles.fieldGroup}>
              <p className={styles.fieldLabel}>会話ターン（任意）</p>
              <TurnEditor
                turns={formData.turns}
                onChange={(turns) => setFormData((prev) => ({ ...prev, turns }))}
              />
            </div>
          ) : (
            <div className={styles.fieldGroup}>
              <label htmlFor="test-case-context" className={styles.fieldLabel}>
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
                className={styles.fieldTextareaContext}
              />
            </div>
          )}

          {/* 期待記述 */}
          <div className={styles.fieldGroupLg}>
            <label htmlFor="test-case-expected" className={styles.fieldLabel}>
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
              className={styles.fieldTextarea}
            />
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!isSubmittable || isLoading}
              className={`${styles.btnPrimary} ${!isSubmittable || isLoading ? styles.btnDisabled : ""}`}
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
      className={styles.modalOverlayCentered}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.modalContentSm}>
        <h3 className={styles.modalTitle}>テストケースを削除</h3>
        <p className={styles.deleteDescription}>以下のテストケースを削除してもよいですか？</p>
        <p className={styles.deleteName}>{testCase.title}</p>
        <p className={styles.deleteWarning}>この操作は取り消せません。</p>
        <div className={styles.formActions}>
          <button type="button" onClick={onClose} className={styles.btnSecondary}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`${styles.btnDanger} ${isLoading ? styles.btnDisabled : ""}`}
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
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{testCase.title}</h3>
        <div className={styles.cardActions}>
          <button
            type="button"
            onClick={() => onEdit(testCase)}
            className={styles.btnCardEdit}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => onDelete(testCase)}
            className={styles.btnCardDelete}
          >
            削除
          </button>
        </div>
      </div>

      {/* ターン情報バッジ */}
      <div className={styles.badgeRow}>
        {isContextMode ? (
          <span className={`${styles.badge} ${styles.badgeTextMode}`}>テキスト形式</span>
        ) : (
          <>
            <span className={`${styles.badge} ${styles.badgeTurnCount}`}>
              計 {testCase.turns.length} ターン
            </span>
            {userTurns > 0 && (
              <span className={`${styles.badge} ${styles.badgeUser}`}>user × {userTurns}</span>
            )}
            {assistantTurns > 0 && (
              <span className={`${styles.badge} ${styles.badgeAssistant}`}>
                assistant × {assistantTurns}
              </span>
            )}
          </>
        )}
        {testCase.expected_description && (
          <span className={`${styles.badge} ${styles.badgeExpected}`}>期待記述あり</span>
        )}
      </div>

      {/* プレビュー */}
      {isContextMode
        ? testCase.context_content && (
            <p className={`${styles.preview} ${styles.previewMono}`}>
              {testCase.context_content}
            </p>
          )
        : testCase.turns[0] && (
            <p className={styles.preview}>{testCase.turns[0].content}</p>
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
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>テストケース管理</h2>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className={styles.btnPrimary}
        >
          + 新規作成
        </button>
      </div>

      <p className={styles.pageDescription}>
        プロジェクトのテストケース一覧です。参照情報と期待記述を管理します。
      </p>

      {isLoading && (
        <p className={`${styles.statusText} ${styles.loading}`}>読み込み中...</p>
      )}

      {isError && (
        <p className={`${styles.statusText} ${styles.error}`}>
          エラーが発生しました: {error instanceof Error ? error.message : "不明なエラー"}
        </p>
      )}

      {!isLoading && !isError && testCases && testCases.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>テストケースがまだありません</p>
          <p className={styles.emptyStateSubtext}>
            「新規作成」ボタンから最初のテストケースを作成してください。
          </p>
        </div>
      )}

      {!isLoading && !isError && testCases && testCases.length > 0 && (
        <div className={styles.listContainer}>
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
