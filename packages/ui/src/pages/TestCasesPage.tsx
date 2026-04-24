import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { getStoredActiveLabelId } from "../lib/useActiveLabel";
import {
  type ContextAssetSummary,
  type Project,
  type TestCase,
  type TestCaseFilters,
  type Turn,
  createIndependentTestCase,
  deleteIndependentTestCase,
  getContextAsset,
  getContextAssets,
  getIndependentTestCases,
  getProjects,
  setTestCaseContextAssets,
  setTestCaseProjects,
  updateIndependentTestCase,
} from "../lib/api";
import styles from "./TestCasesPage.module.css";

function createEmptyTurn(): Turn {
  return { role: "user", content: "" };
}

function formatProjectNames(projectIds: number[], projects: Project[]): string[] {
  return projectIds
    .map((projectId) => projects.find((project) => project.id === projectId)?.name)
    .filter((name): name is string => Boolean(name));
}

type TestCaseFormData = {
  title: string;
  turns: Turn[];
  context_content: string;
  expected_description: string;
  project_ids: number[];
  context_asset_ids: number[];
};

function getInitialFormData(
  testCase?: TestCase,
  defaultProjectId?: number | null,
  initialProjectIds: number[] = [],
  initialContextAssetIds: number[] = [],
): TestCaseFormData {
  if (testCase) {
    return {
      title: testCase.title,
      turns: testCase.turns,
      context_content: testCase.context_content ?? "",
      expected_description: testCase.expected_description ?? "",
      project_ids: initialProjectIds,
      context_asset_ids: initialContextAssetIds,
    };
  }

  return {
    title: "",
    turns: [createEmptyTurn()],
    context_content: "",
    expected_description: "",
    project_ids:
      defaultProjectId !== null && defaultProjectId !== undefined ? [defaultProjectId] : [],
    context_asset_ids: [],
  };
}

type TurnEditorProps = {
  turns: Turn[];
  onChange: (turns: Turn[]) => void;
};

function TurnEditor({ turns, onChange }: TurnEditorProps) {
  function handleRoleChange(index: number, role: "user" | "assistant") {
    onChange(
      turns.map((turn, currentIndex) => (currentIndex === index ? { ...turn, role } : turn)),
    );
  }

  function handleContentChange(index: number, content: string) {
    onChange(
      turns.map((turn, currentIndex) => (currentIndex === index ? { ...turn, content } : turn)),
    );
  }

  function handleAddTurn() {
    onChange([...turns, createEmptyTurn()]);
  }

  function handleRemoveTurn(index: number) {
    onChange(turns.filter((_, currentIndex) => currentIndex !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const nextTurns = [...turns];
    const current = nextTurns[index];
    const previous = nextTurns[index - 1];
    if (!current || !previous) return;
    nextTurns[index] = previous;
    nextTurns[index - 1] = current;
    onChange(nextTurns);
  }

  function handleMoveDown(index: number) {
    if (index === turns.length - 1) return;
    const nextTurns = [...turns];
    const current = nextTurns[index];
    const next = nextTurns[index + 1];
    if (!current || !next) return;
    nextTurns[index] = next;
    nextTurns[index + 1] = current;
    onChange(nextTurns);
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
              onChange={(event) =>
                handleRoleChange(index, event.target.value as "user" | "assistant")
              }
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
            onChange={(event) => handleContentChange(index, event.target.value)}
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

type ProjectTagEditorProps = {
  projects: Project[];
  selectedProjectIds: number[];
  onChange: (projectIds: number[]) => void;
};

function ProjectTagEditor({ projects, selectedProjectIds, onChange }: ProjectTagEditorProps) {
  function handleToggle(projectId: number) {
    onChange(
      selectedProjectIds.includes(projectId)
        ? selectedProjectIds.filter((id) => id !== projectId)
        : [...selectedProjectIds, projectId],
    );
  }

  if (projects.length === 0) {
    return <p className={styles.modeHint}>利用可能なプロジェクトはありません。</p>;
  }

  return (
    <div className={styles.tagGroup}>
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => handleToggle(project.id)}
          className={`${styles.tagButton} ${selectedProjectIds.includes(project.id) ? styles.tagButtonActive : ""}`}
        >
          {project.name}
        </button>
      ))}
    </div>
  );
}

type ContextAssetPickerProps = {
  selectedIds: number[];
  availableAssets: ContextAssetSummary[];
  linkedAssets: ContextAssetSummary[];
  selectedImportId: number | null;
  isImporting: boolean;
  onImportSelectionChange: (id: number | null) => void;
  onImport: () => void;
  onToggleLink: (assetId: number) => void;
};

function ContextAssetPicker({
  selectedIds,
  availableAssets,
  linkedAssets,
  selectedImportId,
  isImporting,
  onImportSelectionChange,
  onImport,
  onToggleLink,
}: ContextAssetPickerProps) {
  const assetMap = new Map<number, ContextAssetSummary>();
  for (const asset of linkedAssets) {
    assetMap.set(asset.id, asset);
  }
  for (const asset of availableAssets) {
    assetMap.set(asset.id, asset);
  }

  const selectedAssets = selectedIds
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is ContextAssetSummary => Boolean(asset));

  return (
    <div className={styles.assetSection}>
      <div className={styles.contextImportControls}>
        <select
          value={selectedImportId ?? ""}
          onChange={(event) =>
            onImportSelectionChange(event.target.value ? Number(event.target.value) : null)
          }
          disabled={availableAssets.length === 0 || isImporting}
          className={styles.contextFileSelect}
        >
          {availableAssets.length === 0 ? (
            <option value="">利用可能なコンテキスト素材はありません</option>
          ) : (
            <>
              <option value="">取り込む素材を選択</option>
              {availableAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.path}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          type="button"
          onClick={onImport}
          disabled={!selectedImportId || isImporting}
          className={`${styles.btnSecondary} ${styles.contextImportButton}`}
        >
          {isImporting ? "取込中..." : "内容を取り込む"}
        </button>
      </div>

      <p className={styles.modeHint}>
        `context_assets` の内容をスナップショットとして `context_content`
        に取り込みます。関連付けだけ残したい場合は下のタグを切り替えてください。
      </p>

      {selectedAssets.length > 0 ? (
        <div className={styles.selectedAssets}>
          <p className={styles.selectedAssetsLabel}>関連付け中の素材</p>
          <div className={styles.assetTagList}>
            {selectedAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onToggleLink(asset.id)}
                className={`${styles.assetTag} ${styles.assetTagSelected}`}
              >
                {asset.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.modeHint}>関連付け中の素材はありません。</p>
      )}

      {availableAssets.length > 0 && (
        <div className={styles.availableAssets}>
          <p className={styles.selectedAssetsLabel}>候補から関連付けを切り替える</p>
          <div className={styles.assetTagList}>
            {availableAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onToggleLink(asset.id)}
                className={`${styles.assetTag} ${selectedIds.includes(asset.id) ? styles.assetTagSelected : ""}`}
              >
                {asset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type TestCaseModalProps = {
  testCase?: TestCase;
  defaultProjectId: number | null;
  initialProjectIds: number[];
  projects: Project[];
  availableAssets: ContextAssetSummary[];
  linkedAssets: ContextAssetSummary[];
  onClose: () => void;
  onSubmit: (data: TestCaseFormData) => void;
  isLoading: boolean;
};

function TestCaseModal({
  testCase,
  defaultProjectId,
  initialProjectIds,
  projects,
  availableAssets,
  linkedAssets,
  onClose,
  onSubmit,
  isLoading,
}: TestCaseModalProps) {
  const [formData, setFormData] = useState<TestCaseFormData>(() =>
    getInitialFormData(
      testCase,
      defaultProjectId,
      initialProjectIds,
      linkedAssets.map((asset) => asset.id),
    ),
  );
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const isEdit = Boolean(testCase);

  useEffect(() => {
    setFormData(
      getInitialFormData(
        testCase,
        defaultProjectId,
        initialProjectIds,
        linkedAssets.map((asset) => asset.id),
      ),
    );
  }, [defaultProjectId, initialProjectIds, testCase, linkedAssets]);

  useEffect(() => {
    if (availableAssets.length === 0) {
      setSelectedImportId(null);
      return;
    }

    if (!selectedImportId || !availableAssets.some((asset) => asset.id === selectedImportId)) {
      setSelectedImportId(availableAssets[0]?.id ?? null);
    }
  }, [availableAssets, selectedImportId]);

  const importContextMutation = useMutation({
    mutationFn: (assetId: number) => getContextAsset(assetId),
    onSuccess: (asset) => {
      setFormData((prev) => ({
        ...prev,
        context_content: asset.content,
        context_asset_ids: prev.context_asset_ids.includes(asset.id)
          ? prev.context_asset_ids
          : [...prev.context_asset_ids, asset.id],
      }));
      setImportNotice(
        `${asset.name} の内容を取り込みました。保存するとこのスナップショットがテストケースに保存されます。`,
      );
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedTitle = formData.title.trim();
    if (!trimmedTitle) return;

    onSubmit({
      ...formData,
      title: trimmedTitle,
      turns: formData.turns.filter((turn) => turn.content.trim()),
      context_content: formData.context_content.trim(),
      expected_description: formData.expected_description.trim(),
      project_ids: [...new Set(formData.project_ids)].sort((a, b) => a - b),
      context_asset_ids: [...new Set(formData.context_asset_ids)].sort((a, b) => a - b),
    });
  }

  function handleToggleAsset(assetId: number) {
    setImportNotice(null);
    setFormData((prev) => ({
      ...prev,
      context_asset_ids: prev.context_asset_ids.includes(assetId)
        ? prev.context_asset_ids.filter((id) => id !== assetId)
        : [...prev.context_asset_ids, assetId],
    }));
  }

  const isSubmittable = formData.title.trim() !== "";

  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className={styles.modalContent}>
        <h3 className={styles.modalTitle}>
          {isEdit ? "テストケースを編集" : "テストケースを作成"}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="test-case-title" className={styles.fieldLabel}>
              タイトル
              <span className={styles.requiredMark}>*</span>
            </label>
            <input
              id="test-case-title"
              type="text"
              value={formData.title}
              onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例: 基本的な挨拶テスト"
              className={styles.fieldInput}
            />
          </div>

          <div className={styles.fieldGroup}>
            <p className={styles.fieldLabel}>プロジェクトラベル</p>
            <p className={styles.modeHint}>
              project 親子ではなく独立資産として管理しつつ、必要な project にタグ付けできます。
            </p>
            <ProjectTagEditor
              projects={projects}
              selectedProjectIds={formData.project_ids}
              onChange={(projectIds) =>
                setFormData((prev) => ({ ...prev, project_ids: projectIds }))
              }
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="test-case-context" className={styles.fieldLabel}>
              コンテキスト（任意）
            </label>
            <ContextAssetPicker
              selectedIds={formData.context_asset_ids}
              availableAssets={availableAssets}
              linkedAssets={linkedAssets}
              selectedImportId={selectedImportId}
              isImporting={importContextMutation.isPending}
              onImportSelectionChange={setSelectedImportId}
              onImport={() => {
                if (!selectedImportId) return;
                importContextMutation.mutate(selectedImportId);
              }}
              onToggleLink={handleToggleAsset}
            />
            {importContextMutation.isError && (
              <p className={styles.contextImportError}>
                選択したコンテキスト素材の取り込みに失敗しました。
              </p>
            )}
            {importNotice && <p className={styles.contextImportNotice}>{importNotice}</p>}
            <textarea
              id="test-case-context"
              value={formData.context_content}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, context_content: event.target.value }))
              }
              placeholder="参照テキストや前提条件を入力..."
              rows={6}
              className={styles.fieldTextareaContext}
            />
          </div>

          <div className={styles.fieldGroup}>
            <p className={styles.fieldLabel}>会話ターン（任意）</p>
            <p className={styles.modeHint}>
              実行時の補足情報は上のコンテキスト欄へ、会話として固定したい内容はターンで入力します。
            </p>
            <TurnEditor
              turns={formData.turns}
              onChange={(turns) => setFormData((prev) => ({ ...prev, turns }))}
            />
          </div>

          <div className={styles.fieldGroupLg}>
            <label htmlFor="test-case-expected" className={styles.fieldLabel}>
              期待記述（任意）
            </label>
            <textarea
              id="test-case-expected"
              value={formData.expected_description}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, expected_description: event.target.value }))
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
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
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

type TestCaseCardProps = {
  testCase: TestCase;
  projects: Project[];
  linkedAssets: ContextAssetSummary[];
  linkedProjectIds: number[];
  onEdit: (testCase: TestCase) => void;
  onDelete: (testCase: TestCase) => void;
};

function TestCaseCard({
  testCase,
  projects,
  linkedAssets,
  linkedProjectIds,
  onEdit,
  onDelete,
}: TestCaseCardProps) {
  const userTurns = testCase.turns.filter((turn) => turn.role === "user").length;
  const assistantTurns = testCase.turns.filter((turn) => turn.role === "assistant").length;
  const projectNames = formatProjectNames(linkedProjectIds, projects);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{testCase.title}</h3>
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
            {linkedAssets.length > 0 && (
              <span className={`${styles.badge} ${styles.badgeLinkedAsset}`}>
                素材関連付け {linkedAssets.length} 件
              </span>
            )}
            {testCase.expected_description && (
              <span className={`${styles.badge} ${styles.badgeExpected}`}>期待記述あり</span>
            )}
          </div>
        </div>
        <div className={styles.cardActions}>
          <button type="button" onClick={() => onEdit(testCase)} className={styles.btnCardEdit}>
            編集
          </button>
          <button type="button" onClick={() => onDelete(testCase)} className={styles.btnCardDelete}>
            削除
          </button>
        </div>
      </div>

      {projectNames.length > 0 && (
        <div className={styles.metaGroup}>
          <span className={styles.metaLabel}>プロジェクト</span>
          <div className={styles.assetTagList}>
            {projectNames.map((projectName) => (
              <span key={`${testCase.id}-${projectName}`} className={styles.projectPill}>
                {projectName}
              </span>
            ))}
          </div>
        </div>
      )}

      {linkedAssets.length > 0 && (
        <div className={styles.metaGroup}>
          <span className={styles.metaLabel}>関連素材</span>
          <div className={styles.assetTagList}>
            {linkedAssets.map((asset) => (
              <span key={`${testCase.id}-asset-${asset.id}`} className={styles.assetPill}>
                {asset.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {testCase.turns[0] ? (
        <p className={styles.preview}>{testCase.turns[0].content}</p>
      ) : testCase.context_content ? (
        <p className={`${styles.preview} ${styles.previewMono}`}>{testCase.context_content}</p>
      ) : null}
    </div>
  );
}

type ProjectMembershipMap = Record<number, number[]>;
type LinkedAssetMap = Record<number, ContextAssetSummary[]>;

export function TestCasesPage() {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TestCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  const legacyProjectId = id !== undefined ? Number(id) : null;
  const selectedProjectId =
    searchParams.get("project_id") !== null
      ? Number(searchParams.get("project_id"))
      : legacyProjectId !== null && !Number.isNaN(legacyProjectId)
        ? legacyProjectId
        : null;
  const selectedUnclassified = searchParams.get("unclassified") === "true";
  const searchQuery = searchParams.get("q")?.trim() ?? "";

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (
      legacyProjectId === null ||
      Number.isNaN(legacyProjectId) ||
      searchParams.get("project_id") !== null
    ) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set("project_id", String(legacyProjectId));
    setSearchParams(next, { replace: true });
  }, [legacyProjectId, searchParams, setSearchParams]);

  useEffect(() => {
    if (searchParams.get("project_id") !== null || legacyProjectId !== null) return;
    const activeId = getStoredActiveLabelId();
    if (activeId === null) return;
    const next = new URLSearchParams(searchParams);
    next.set("project_id", String(activeId));
    setSearchParams(next, { replace: true });
  // 初回マウント時のみ実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters: TestCaseFilters = {
    q: searchQuery || undefined,
    project_id:
      selectedProjectId !== null && !Number.isNaN(selectedProjectId)
        ? selectedProjectId
        : undefined,
    unclassified: selectedUnclassified || undefined,
  };

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const testCasesQuery = useQuery({
    queryKey: ["independent-test-cases", filters],
    queryFn: () => getIndependentTestCases(filters),
  });

  const projects = projectsQuery.data ?? [];
  const testCases = testCasesQuery.data ?? [];

  const projectMembershipQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["test-case-membership", project.id],
      queryFn: () => getIndependentTestCases({ project_id: project.id }),
      staleTime: 1000 * 60,
    })),
  });

  const linkedAssetQueries = useQueries({
    queries: testCases.map((testCase) => ({
      queryKey: ["test-case-linked-assets", testCase.id],
      queryFn: () => getContextAssets({ linked_to: `test_case:${testCase.id}` }),
      staleTime: 1000 * 60,
    })),
  });

  const editLinkedAssetsQuery = useQuery({
    queryKey: ["test-case-linked-assets", editTarget?.id ?? null, "edit"],
    queryFn: () => {
      if (!editTarget) throw new Error("testCase is required");
      return getContextAssets({ linked_to: `test_case:${editTarget.id}` });
    },
    enabled: editTarget !== null,
  });

  const availableAssetsQuery = useQuery({
    queryKey: ["test-case-available-assets", selectedProjectId],
    queryFn: () =>
      getContextAssets(
        selectedProjectId !== null && !Number.isNaN(selectedProjectId)
          ? { project_id: selectedProjectId }
          : undefined,
      ),
  });

  const projectMembershipMap: ProjectMembershipMap = {};
  projects.forEach((project, index) => {
    const linkedCases = projectMembershipQueries[index]?.data ?? [];
    for (const linkedCase of linkedCases) {
      projectMembershipMap[linkedCase.id] = [
        ...(projectMembershipMap[linkedCase.id] ?? []),
        project.id,
      ];
    }
  });

  const linkedAssetMap: LinkedAssetMap = {};
  testCases.forEach((testCase, index) => {
    linkedAssetMap[testCase.id] = linkedAssetQueries[index]?.data ?? [];
  });

  const isEditAssociationsLoading =
    editTarget !== null &&
    (projectsQuery.isLoading ||
      projectMembershipQueries.some((query) => query.isPending) ||
      editLinkedAssetsQuery.isLoading);

  function updateSearchParams(nextValues: {
    project_id?: number | null;
    unclassified?: boolean;
    q?: string;
  }) {
    const next = new URLSearchParams(searchParams);

    if (nextValues.project_id === null || nextValues.project_id === undefined) {
      next.delete("project_id");
    } else {
      next.set("project_id", String(nextValues.project_id));
    }

    if (!nextValues.unclassified) {
      next.delete("unclassified");
    } else {
      next.set("unclassified", "true");
    }

    if (!nextValues.q) {
      next.delete("q");
    } else {
      next.set("q", nextValues.q);
    }

    setSearchParams(next, { replace: true });
  }

  function handleProjectFilterChange(projectId: number) {
    updateSearchParams({
      project_id: selectedProjectId === projectId ? null : projectId,
      unclassified: false,
      q: searchQuery || undefined,
    });
  }

  function handleUnclassifiedToggle() {
    updateSearchParams({
      project_id: null,
      unclassified: !selectedUnclassified,
      q: searchQuery || undefined,
    });
  }

  function handleSearchSubmit() {
    updateSearchParams({
      project_id: selectedProjectId,
      unclassified: selectedUnclassified,
      q: searchInput.trim() || undefined,
    });
  }

  async function saveRelationships(testCaseId: number, data: TestCaseFormData) {
    await setTestCaseProjects(testCaseId, { project_ids: data.project_ids });
    await setTestCaseContextAssets(testCaseId, { context_asset_ids: data.context_asset_ids });
  }

  const createMutation = useMutation({
    mutationFn: async (data: TestCaseFormData) => {
      const created = await createIndependentTestCase({
        title: data.title,
        turns: data.turns,
        context_content: data.context_content || undefined,
        expected_description: data.expected_description || undefined,
        project_ids: data.project_ids,
      });
      await saveRelationships(created.id, data);
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["independent-test-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-membership"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-linked-assets"] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: TestCaseFormData }) => {
      const updated = await updateIndependentTestCase(id, {
        title: data.title,
        turns: data.turns,
        context_content: data.context_content,
        expected_description: data.expected_description || null,
      });
      await saveRelationships(id, data);
      return updated;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["independent-test-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-membership"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-linked-assets"] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (testCaseId: number) => deleteIndependentTestCase(testCaseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["independent-test-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-membership"] });
      await queryClient.invalidateQueries({ queryKey: ["test-case-linked-assets"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>テストケース管理</h2>
          <p className={styles.pageDescription}>
            独立資産としてテストケースを管理し、必要な project や context assets
            をあとから関連付けます。
          </p>
        </div>
        <button type="button" onClick={() => setIsCreateOpen(true)} className={styles.btnPrimary}>
          + 新規作成
        </button>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.searchRow}>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSearchSubmit();
              }
            }}
            placeholder="タイトルで検索"
            className={styles.fieldInput}
          />
          <button type="button" onClick={handleSearchSubmit} className={styles.btnSecondary}>
            検索
          </button>
        </div>

        <div className={styles.filterTags}>
          <button
            type="button"
            onClick={handleUnclassifiedToggle}
            className={`${styles.filterTag} ${selectedUnclassified ? styles.filterTagActive : ""}`}
          >
            未分類のみ
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => handleProjectFilterChange(project.id)}
              className={`${styles.filterTag} ${selectedProjectId === project.id ? styles.filterTagActive : ""}`}
            >
              {project.name}
            </button>
          ))}
        </div>
      </div>

      {testCasesQuery.isLoading && (
        <p className={`${styles.statusText} ${styles.loading}`}>読み込み中...</p>
      )}

      {testCasesQuery.isError && (
        <p className={`${styles.statusText} ${styles.error}`}>
          エラーが発生しました。テストケース一覧を取得できませんでした。
        </p>
      )}

      {!testCasesQuery.isLoading && !testCasesQuery.isError && testCases.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>条件に合うテストケースがありません</p>
          <p className={styles.emptyStateSubtext}>
            フィルタを変えるか、「新規作成」から最初のテストケースを追加してください。
          </p>
        </div>
      )}

      {!testCasesQuery.isLoading && !testCasesQuery.isError && testCases.length > 0 && (
        <div className={styles.listContainer}>
          {testCases.map((testCase) => (
            <TestCaseCard
              key={testCase.id}
              testCase={testCase}
              projects={projects}
              linkedAssets={linkedAssetMap[testCase.id] ?? []}
              linkedProjectIds={projectMembershipMap[testCase.id] ?? []}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {isCreateOpen && (
        <TestCaseModal
          defaultProjectId={selectedProjectId}
          initialProjectIds={
            selectedProjectId !== null && !Number.isNaN(selectedProjectId)
              ? [selectedProjectId]
              : []
          }
          projects={projects}
          availableAssets={availableAssetsQuery.data ?? []}
          linkedAssets={[]}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {editTarget &&
        (isEditAssociationsLoading ? (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContentSm}>
              <h3 className={styles.modalTitle}>テストケースを編集</h3>
              <p className={styles.statusText}>関連情報を読み込み中...</p>
            </div>
          </div>
        ) : (
          <TestCaseModal
            key={`edit-${editTarget.id}`}
            testCase={editTarget}
            defaultProjectId={selectedProjectId}
            initialProjectIds={projectMembershipMap[editTarget.id] ?? []}
            projects={projects}
            availableAssets={availableAssetsQuery.data ?? []}
            linkedAssets={editLinkedAssetsQuery.data ?? []}
            onClose={() => setEditTarget(null)}
            onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, data })}
            isLoading={updateMutation.isPending}
          />
        ))}

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
