import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  type TestCase,
  type Turn,
  createTestCase,
  deleteTestCase,
  getContextAsset,
  getContextAssets,
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

type TestCaseFormData = {
  title: string;
  turns: Turn[];
  context_content: string;
  expected_description: string;
};

function getInitialFormData(testCase?: TestCase): TestCaseFormData {
  if (testCase) {
    return {
      title: testCase.title,
      turns: testCase.turns,
      context_content: testCase.context_content ?? "",
      expected_description: testCase.expected_description ?? "",
    };
  }
  return {
    title: "",
    turns: [createEmptyTurn()],
    context_content: "",
    expected_description: "",
  };
}

// 作成・編集モーダルコンポーネント
type TestCaseModalProps = {
  projectId: number;
  testCase?: TestCase;
  onClose: () => void;
  onSubmit: (data: TestCaseFormData) => void;
  isLoading: boolean;
};

function TestCaseModal({ projectId, testCase, onClose, onSubmit, isLoading }: TestCaseModalProps) {
  const [formData, setFormData] = useState<TestCaseFormData>(() => getInitialFormData(testCase));
  const [selectedContextAssetId, setSelectedContextAssetId] = useState<number | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const isEdit = !!testCase;

  const contextAssetsQuery = useQuery({
    queryKey: ["context-assets", { project_id: projectId }],
    queryFn: () => getContextAssets({ project_id: projectId }),
    enabled: !Number.isNaN(projectId),
  });

  useEffect(() => {
    const assets = contextAssetsQuery.data ?? [];
    if (assets.length === 0) {
      setSelectedContextAssetId(null);
      return;
    }
    if (!selectedContextAssetId || !assets.some((a) => a.id === selectedContextAssetId)) {
      setSelectedContextAssetId(assets[0]?.id ?? null);
    }
  }, [contextAssetsQuery.data, selectedContextAssetId]);

  const importContextMutation = useMutation({
    mutationFn: (assetId: number) => getContextAsset(assetId),
    onSuccess: (asset) => {
      setFormData((prev) => ({ ...prev, context_content: asset.content }));
      setImportNotice(
        `${asset.name} の内容を取り込みました。保存するとこのスナップショットがテストケースに保存されます。`,
      );
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = formData.title.trim();
    if (!trimmedTitle) return;
    const validTurns = formData.turns.filter((t) => t.content.trim());
    onSubmit({
      ...formData,
      title: trimmedTitle,
      turns: validTurns,
      context_content: formData.context_content.trim(),
    });
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

          <div className={styles.fieldGroup}>
            <label htmlFor="test-case-context" className={styles.fieldLabel}>
              コンテキスト（任意）
            </label>
            <div className={styles.contextImportRow}>
              <div className={styles.contextImportControls}>
                <select
                  value={selectedContextAssetId ?? ""}
                  onChange={(e) => {
                    setImportNotice(null);
                    setSelectedContextAssetId(e.target.value ? Number(e.target.value) : null);
                  }}
                  disabled={
                    (contextAssetsQuery.data?.length ?? 0) === 0 || importContextMutation.isPending
                  }
                  className={styles.contextFileSelect}
                >
                  {(contextAssetsQuery.data?.length ?? 0) === 0 ? (
                    <option value="">利用可能なコンテキスト素材はありません</option>
                  ) : (
                    (contextAssetsQuery.data ?? []).map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedContextAssetId) return;
                    importContextMutation.mutate(selectedContextAssetId);
                  }}
                  disabled={!selectedContextAssetId || importContextMutation.isPending}
                  className={`${styles.btnSecondary} ${styles.contextImportButton}`}
                >
                  {importContextMutation.isPending ? "取込中..." : "取り込む"}
                </button>
              </div>
              <p className={styles.modeHint}>
                コンテキスト素材管理で登録した素材をここへコピーします。取り込み後に編集して保存できます。
              </p>
              {contextAssetsQuery.isError && (
                <p className={styles.contextImportError}>
                  コンテキスト素材一覧の取得に失敗しました。
                </p>
              )}
              {importContextMutation.isError && (
                <p className={styles.contextImportError}>
                  選択したコンテキストファイルの取り込みに失敗しました。
                </p>
              )}
              {importNotice && <p className={styles.contextImportNotice}>{importNotice}</p>}
            </div>
            <textarea
              id="test-case-context"
              value={formData.context_content}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, context_content: e.target.value }))
              }
              placeholder="参照テキストや前提条件を入力..."
              rows={6}
              className={styles.fieldTextareaContext}
            />
          </div>

          <div className={styles.fieldGroup}>
            <p className={styles.fieldLabel}>会話ターン（任意）</p>
            <p className={styles.modeHint}>
              実行時の補足情報は上のコンテキスト欄に入力し、会話として固定したい内容はターンで入力します。
            </p>
            <TurnEditor
              turns={formData.turns}
              onChange={(turns) => setFormData((prev) => ({ ...prev, turns }))}
            />
          </div>

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
  const userTurns = testCase.turns.filter((t) => t.role === "user").length;
  const assistantTurns = testCase.turns.filter((t) => t.role === "assistant").length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{testCase.title}</h3>
        <div className={styles.cardActions}>
          <button type="button" onClick={() => onEdit(testCase)} className={styles.btnCardEdit}>
            編集
          </button>
          <button type="button" onClick={() => onDelete(testCase)} className={styles.btnCardDelete}>
            削除
          </button>
        </div>
      </div>

      {/* ターン情報バッジ */}
      <div className={styles.badgeRow}>
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
        {testCase.context_content && (
          <span className={`${styles.badge} ${styles.badgeTextMode}`}>コンテキストあり</span>
        )}
        {testCase.expected_description && (
          <span className={`${styles.badge} ${styles.badgeExpected}`}>期待記述あり</span>
        )}
      </div>

      {/* プレビュー */}
      {testCase.turns[0] ? (
        <p className={styles.preview}>{testCase.turns[0].content}</p>
      ) : testCase.context_content ? (
        <p className={`${styles.preview} ${styles.previewMono}`}>{testCase.context_content}</p>
      ) : null}
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
        <button type="button" onClick={() => setIsCreateOpen(true)} className={styles.btnPrimary}>
          + 新規作成
        </button>
      </div>

      <p className={styles.pageDescription}>
        プロジェクトのテストケース一覧です。会話ターン、コンテキスト、期待記述をまとめて管理します。
      </p>

      {isLoading && <p className={`${styles.statusText} ${styles.loading}`}>読み込み中...</p>}

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
          projectId={projectId}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {editTarget && (
        <TestCaseModal
          projectId={projectId}
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
