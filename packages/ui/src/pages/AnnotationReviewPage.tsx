import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { AnnotationSectionTabs } from "../components/AnnotationSectionTabs";
import {
  type AnnotationCandidate,
  type AnnotationLabel,
  type CandidateStatus,
  type GoldAnnotation,
  createGoldAnnotation,
  deleteGoldAnnotation,
  getAnnotationCandidates,
  getAnnotationTask,
  getAnnotationTasks,
  getGoldAnnotations,
  getIndependentTestCase,
  getIndependentTestCases,
  getRunIndependent,
  updateAnnotationCandidate,
} from "../lib/api";
import styles from "./AnnotationReviewPage.module.css";

function statusLabel(status: CandidateStatus): string {
  switch (status) {
    case "pending":
      return "未処理";
    case "accepted":
      return "採用";
    case "rejected":
      return "却下";
  }
}

function statusClassName(status: CandidateStatus, s: typeof styles): string {
  switch (status) {
    case "pending":
      return s.badgePending ?? "";
    case "accepted":
      return s.badgeAccepted ?? "";
    case "rejected":
      return s.badgeRejected ?? "";
  }
}

// ラベルのカラーをもとにハイライト用 RGBA を生成
function labelColorRgba(color: string | null | undefined, alpha = 0.25): string {
  if (!color) return `rgba(137,180,250,${alpha})`;
  const hex = color.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// テキストを行番号付きで表示し候補範囲をハイライトするコンポーネント
function LineNumberedText({
  text,
  candidates,
  labels,
  activeRange,
}: {
  text: string;
  candidates: AnnotationCandidate[];
  labels: AnnotationLabel[];
  activeRange: { start: number; end: number } | null;
}) {
  const lines = text.split("\n");

  function getHighlightColor(lineIndex: number): string | null {
    const lineNum = lineIndex + 1;
    // アクティブ優先
    if (activeRange && lineNum >= activeRange.start && lineNum <= activeRange.end) {
      return "rgba(249,226,175,0.3)";
    }
    // 候補のハイライト（accepted のみ強調、pending は薄く）
    const matching = candidates.filter(
      (c) => c.status !== "rejected" && lineNum >= c.start_line && lineNum <= c.end_line,
    );
    if (matching.length === 0) return null;
    const first = matching[0];
    if (!first) return null;
    const label = labels.find((l) => l.key === first.label);
    return labelColorRgba(label?.color, first.status === "accepted" ? 0.35 : 0.15);
  }

  return (
    <div className={styles.lineViewer}>
      {lines.map((line, index) => {
        const bg = getHighlightColor(index);
        return (
          <div
            key={`line-${
              // biome-ignore lint/suspicious/noArrayIndexKey: 行番号は順序で管理
              index
            }`}
            id={`context-line-${index + 1}`}
            className={styles.lineRow}
            style={bg ? { backgroundColor: bg } : undefined}
          >
            <span className={styles.lineNumber}>{index + 1}</span>
            <span className={styles.lineContent}>{line || "\u00a0"}</span>
          </div>
        );
      })}
    </div>
  );
}

// 候補の編集フォーム
function CandidateEditForm({
  candidate,
  labels,
  onSave,
  onCancel,
  isSaving,
}: {
  candidate: AnnotationCandidate;
  labels: AnnotationLabel[];
  onSave: (data: {
    label: string;
    start_line: number;
    end_line: number;
    note: string | null;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [label, setLabel] = useState(candidate.label);
  const [startLine, setStartLine] = useState(String(candidate.start_line));
  const [endLine, setEndLine] = useState(String(candidate.end_line));
  const [note, setNote] = useState(candidate.note ?? "");

  function handleSubmit() {
    onSave({
      label,
      start_line: Number(startLine),
      end_line: Number(endLine),
      note: note.trim() || null,
    });
  }

  const cid = candidate.id;

  return (
    <div className={styles.editForm}>
      <div className={styles.editRow}>
        <label htmlFor={`edit-label-${cid}`} className={styles.editLabel}>
          ラベル
        </label>
        <select
          id={`edit-label-${cid}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={styles.editSelect}
          disabled={isSaving}
        >
          {labels.map((l) => (
            <option key={l.id} value={l.key}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.editRow}>
        <label htmlFor={`edit-start-${cid}`} className={styles.editLabel}>
          開始行
        </label>
        <input
          id={`edit-start-${cid}`}
          type="number"
          value={startLine}
          onChange={(e) => setStartLine(e.target.value)}
          className={styles.editInput}
          min={1}
          disabled={isSaving}
        />
        <label htmlFor={`edit-end-${cid}`} className={styles.editLabel}>
          終了行
        </label>
        <input
          id={`edit-end-${cid}`}
          type="number"
          value={endLine}
          onChange={(e) => setEndLine(e.target.value)}
          className={styles.editInput}
          min={1}
          disabled={isSaving}
        />
      </div>
      <div className={styles.editRow}>
        <label htmlFor={`edit-note-${cid}`} className={styles.editLabel}>
          ノート
        </label>
        <input
          id={`edit-note-${cid}`}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={styles.editInputWide}
          placeholder="任意のメモ"
          disabled={isSaving}
        />
      </div>
      <div className={styles.editActions}>
        <button type="button" onClick={handleSubmit} disabled={isSaving} className={styles.btnSave}>
          {isSaving ? "保存中..." : "保存"}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={styles.btnCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

// 候補カード
function CandidateCard({
  candidate,
  labels,
  onStatusChange,
  onEdit,
  isUpdating,
  onHover,
  isActive,
}: {
  candidate: AnnotationCandidate;
  labels: AnnotationLabel[];
  onStatusChange: (status: CandidateStatus) => void;
  onEdit: (data: {
    label: string;
    start_line: number;
    end_line: number;
    note: string | null;
  }) => void;
  isUpdating: boolean;
  onHover: (range: { start: number; end: number } | null) => void;
  isActive: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const label = labels.find((l) => l.key === candidate.label);
  const isDone = candidate.status !== "pending";

  return (
    <div
      className={`${styles.candidateCard} ${isActive ? styles.candidateCardActive : ""}`}
      onMouseEnter={() => onHover({ start: candidate.start_line, end: candidate.end_line })}
      onMouseLeave={() => onHover(null)}
      onClick={() =>
        document
          .getElementById(`context-line-${candidate.start_line}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ")
          document
            .getElementById(`context-line-${candidate.start_line}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      // biome-ignore lint/a11y/useSemanticElements: カード全体のクリック領域
      role="button"
      tabIndex={0}
    >
      <div className={styles.candidateHeader}>
        <span className={`${styles.badge} ${statusClassName(candidate.status, styles)}`}>
          {statusLabel(candidate.status)}
        </span>
        {label && (
          <span
            className={styles.labelChip}
            style={
              label.color
                ? {
                    background: labelColorRgba(label.color, 0.2),
                    borderColor: label.color,
                    color: label.color,
                  }
                : undefined
            }
          >
            {label.name}
          </span>
        )}
        <span className={styles.candidateLines}>
          L{candidate.start_line}–L{candidate.end_line}
        </span>
      </div>
      <p className={styles.candidateQuote}>&ldquo;{candidate.quote}&rdquo;</p>
      {candidate.note && <p className={styles.candidateNote}>{candidate.note}</p>}

      {editing ? (
        <CandidateEditForm
          candidate={candidate}
          labels={labels}
          onSave={(data) => {
            onEdit(data);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          isSaving={isUpdating}
        />
      ) : (
        <div className={styles.candidateActions}>
          <button
            type="button"
            onClick={() => onStatusChange("accepted")}
            disabled={isDone || isUpdating}
            className={`${styles.btnAccept} ${isDone ? styles.btnDone : ""}`}
          >
            採用
          </button>
          <button
            type="button"
            onClick={() => onStatusChange("rejected")}
            disabled={isDone || isUpdating}
            className={`${styles.btnReject} ${isDone ? styles.btnDone : ""}`}
          >
            却下
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isUpdating}
            className={styles.btnEdit}
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}

function AnnotationReviewStartPage({ projectId }: { projectId: number }) {
  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>抽出</h2>
        </div>
      </div>
      <AnnotationSectionTabs />
      <div className={styles.rightSection}>
        <h3 className={styles.panelTitle}>レビューの開始方法</h3>
        <p className={styles.emptyMsg}>
          Run ページで候補抽出を実行するか、既存の候補レビューリンクからこの画面を開いてください。
        </p>
        <div style={{ padding: "0 16px 16px" }}>
          <Link to={`/projects/${projectId}/runs`} className={styles.backLink}>
            ← Run に戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

function AnnotationReviewContent({
  projectId,
  runId,
  taskId,
}: {
  projectId: number;
  runId: number;
  taskId: number;
}) {
  const queryClient = useQueryClient();

  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);

  const { data: run, isLoading: isRunLoading } = useQuery({
    queryKey: ["runs-independent", runId],
    queryFn: () => getRunIndependent(runId),
    enabled: !Number.isNaN(runId),
  });

  const { data: annotationTask, isLoading: isTaskLoading } = useQuery({
    queryKey: ["annotation-tasks", taskId],
    queryFn: () => getAnnotationTask(taskId),
    enabled: !Number.isNaN(taskId),
  });

  const {
    data: candidates = [],
    isLoading: isCandidatesLoading,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ["annotation-candidates", { run_id: runId, annotation_task_id: taskId }],
    queryFn: () => getAnnotationCandidates({ run_id: runId, annotation_task_id: taskId }),
    enabled: !Number.isNaN(runId) && !Number.isNaN(taskId),
  });

  const {
    data: goldAnnotations = [],
    isLoading: isGoldLoading,
    refetch: refetchGold,
  } = useQuery({
    queryKey: ["gold-annotations", { annotation_task_id: taskId, test_case_id: run?.test_case_id }],
    queryFn: () =>
      getGoldAnnotations({
        annotation_task_id: taskId,
        test_case_id: run?.test_case_id,
      }),
    enabled: !Number.isNaN(taskId) && run !== undefined,
  });

  const { data: testCase, isLoading: isTestCaseLoading } = useQuery({
    queryKey: ["test-cases-independent", run?.test_case_id],
    queryFn: () => getIndependentTestCase(run?.test_case_id as number),
    enabled: run !== undefined && run.test_case_id !== undefined,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      candidateId,
      data,
    }: {
      candidateId: number;
      data: Parameters<typeof updateAnnotationCandidate>[1];
    }) => updateAnnotationCandidate(candidateId, data),
    onSuccess: () => {
      void refetchCandidates();
      void refetchGold();
      void queryClient.invalidateQueries({
        queryKey: ["annotation-candidates"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["gold-annotations"],
      });
    },
  });

  const deleteGoldMutation = useMutation({
    mutationFn: (goldId: number) => deleteGoldAnnotation(goldId),
    onSuccess: () => {
      void refetchCandidates();
      void refetchGold();
      void queryClient.invalidateQueries({ queryKey: ["annotation-candidates"] });
      void queryClient.invalidateQueries({ queryKey: ["gold-annotations"] });
    },
  });

  const labels = annotationTask?.labels ?? [];
  const isLoading = isRunLoading || isTaskLoading || isCandidatesLoading || isTestCaseLoading;

  if (isLoading) {
    return (
      <div className={styles.root}>
        <p className={styles.loadingMsg}>読み込み中...</p>
      </div>
    );
  }

  if (!run || !annotationTask) {
    return (
      <div className={styles.root}>
        <div className={styles.pageHeader}>
          <div>
            <Link to={`/projects/${projectId}/runs`} className={styles.backLink}>
              ← Run 一覧に戻る
            </Link>
            <h2 className={styles.pageTitle}>抽出</h2>
          </div>
        </div>
        <AnnotationSectionTabs />
        <p className={styles.errorMsg}>Run またはアノテーションタスクが見つかりません。</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ヘッダー */}
      <div className={styles.pageHeader}>
        <div>
          <Link to={`/projects/${projectId}/runs`} className={styles.backLink}>
            ← Run 一覧に戻る
          </Link>
          <h2 className={styles.pageTitle}>抽出</h2>
        </div>
      </div>
      <AnnotationSectionTabs />

      {/* 2カラムレイアウト */}
      <div className={styles.layout}>
        {/* 左パネル: 行番号付きコンテキスト */}
        <div className={styles.leftPanel}>
          <h3 className={styles.panelTitle}>コンテキスト</h3>
          {testCase?.context_content ? (
            <LineNumberedText
              text={testCase.context_content}
              candidates={candidates}
              labels={labels}
              activeRange={activeRange}
            />
          ) : (
            <p className={styles.emptyMsg}>コンテキストがありません。</p>
          )}
        </div>

        {/* 右パネル: 候補一覧 + Gold Annotation */}
        <div className={styles.rightPanel}>
          {/* 候補一覧 */}
          <div className={styles.rightSection}>
            <h3 className={styles.panelTitle}>
              候補一覧
              <span className={styles.countBadge}>{candidates.length}</span>
            </h3>
            {isCandidatesLoading ? (
              <p className={styles.loadingMsg}>読み込み中...</p>
            ) : candidates.length === 0 ? (
              <p className={styles.emptyMsg}>候補がありません。Run ページから抽出してください。</p>
            ) : (
              <div className={styles.candidateList}>
                {[...candidates]
                  .sort((a, b) => a.start_line - b.start_line)
                  .map((c) => (
                    <CandidateCard
                      key={c.id}
                      candidate={c}
                      labels={labels}
                      onStatusChange={(status) =>
                        updateMutation.mutate({ candidateId: c.id, data: { status } })
                      }
                      onEdit={(data) => updateMutation.mutate({ candidateId: c.id, data })}
                      isUpdating={updateMutation.isPending}
                      onHover={setActiveRange}
                      isActive={
                        activeRange?.start === c.start_line && activeRange?.end === c.end_line
                      }
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Gold Annotation */}
          <div className={styles.rightSection}>
            <h3 className={styles.panelTitle}>Gold Annotation</h3>
            {isGoldLoading ? (
              <p className={styles.loadingMsg}>読み込み中...</p>
            ) : goldAnnotations.length === 0 ? (
              <p className={styles.emptyMsg}>まだ Gold Annotation がありません</p>
            ) : (
              <div className={styles.goldList}>
                {[...goldAnnotations]
                  .sort((a, b) => a.start_line - b.start_line)
                  .map((g) => (
                    <GoldAnnotationCard
                      key={g.id}
                      gold={g}
                      labels={labels}
                      onDelete={() => deleteGoldMutation.mutate(g.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnotationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = Number(id);
  const runIdParam = searchParams.get("runId");
  const mode = searchParams.get("mode");
  const runId = Number(runIdParam);
  const taskId = Number(searchParams.get("taskId"));

  if (mode === "review" && !runIdParam) {
    return <AnnotationReviewStartPage projectId={projectId} />;
  }

  if (!runIdParam) {
    return <GoldAnnotationBrowse projectId={projectId} />;
  }

  return <AnnotationReviewContent projectId={projectId} runId={runId} taskId={taskId} />;
}

function GoldAnnotationCard({
  gold,
  labels,
  onHover,
  onLeave,
  onDelete,
}: {
  gold: GoldAnnotation;
  labels: AnnotationLabel[];
  onHover?: (range: { start: number; end: number }) => void;
  onLeave?: () => void;
  onDelete?: () => void;
}) {
  const label = labels.find((l) => l.key === gold.label);
  return (
    <div
      className={styles.goldCard}
      onMouseEnter={
        onHover ? () => onHover({ start: gold.start_line, end: gold.end_line }) : undefined
      }
      onMouseLeave={onLeave}
      onClick={() =>
        document
          .getElementById(`context-line-${gold.start_line}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ")
          document
            .getElementById(`context-line-${gold.start_line}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      // biome-ignore lint/a11y/useSemanticElements: カード全体のクリック領域
      role="button"
      tabIndex={0}
    >
      <div className={styles.candidateHeader}>
        {label && (
          <span
            className={styles.labelChip}
            style={
              label.color
                ? {
                    background: labelColorRgba(label.color, 0.2),
                    borderColor: label.color,
                    color: label.color,
                  }
                : undefined
            }
          >
            {label.name}
          </span>
        )}
        <span className={styles.candidateLines}>
          L{gold.start_line}–L{gold.end_line}
        </span>
        {onDelete && (
          <button type="button" className={styles.btnDelete} onClick={onDelete}>
            削除
          </button>
        )}
      </div>
      <p className={styles.candidateQuote}>&ldquo;{gold.quote}&rdquo;</p>
      {gold.note && <p className={styles.candidateNote}>{gold.note}</p>}
    </div>
  );
}

function GoldAnnotationBrowse({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<number | null>(null);
  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // 追加フォームの状態
  const [formLabel, setFormLabel] = useState("");
  const [formStartLine, setFormStartLine] = useState("");
  const [formEndLine, setFormEndLine] = useState("");
  const [formQuote, setFormQuote] = useState("");
  const [formNote, setFormNote] = useState("");

  const { data: tasks = [] } = useQuery({
    queryKey: ["annotation-tasks"],
    queryFn: () => getAnnotationTasks(),
  });

  const { data: selectedTaskDetail } = useQuery({
    queryKey: ["annotation-task", selectedTaskId],
    queryFn: () => getAnnotationTask(selectedTaskId as number),
    enabled: selectedTaskId !== null,
  });

  const { data: testCases = [] } = useQuery({
    queryKey: ["test-cases-independent", Number.isNaN(projectId) ? {} : { project_id: projectId }],
    queryFn: () =>
      Number.isNaN(projectId)
        ? getIndependentTestCases()
        : getIndependentTestCases({ project_id: projectId }),
  });

  const selectedTestCase = testCases.find((tc) => tc.id === selectedTestCaseId) ?? null;

  const { data: goldAnnotations = [], isLoading: isGoldLoading } = useQuery({
    queryKey: [
      "gold-annotations",
      { annotation_task_id: selectedTaskId, test_case_id: selectedTestCaseId },
    ],
    queryFn: () =>
      getGoldAnnotations({
        annotation_task_id: selectedTaskId ?? undefined,
        test_case_id: selectedTestCaseId ?? undefined,
      }),
    enabled: selectedTaskId !== null && selectedTestCaseId !== null,
  });

  const deleteGoldMutation = useMutation({
    mutationFn: (goldId: number) => deleteGoldAnnotation(goldId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gold-annotations"] });
    },
  });

  const createGoldMutation = useMutation({
    mutationFn: (data: Parameters<typeof createGoldAnnotation>[0]) => createGoldAnnotation(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gold-annotations"] });
      setShowAddForm(false);
      setFormLabel("");
      setFormStartLine("");
      setFormEndLine("");
      setFormQuote("");
      setFormNote("");
    },
  });

  const labels = selectedTaskDetail?.labels ?? [];

  function handleAddFormSave() {
    if (!selectedTaskId || !selectedTestCaseId || !formLabel) return;
    createGoldMutation.mutate({
      annotation_task_id: selectedTaskId,
      target_text_ref: `test_case:${selectedTestCaseId}`,
      label: formLabel,
      start_line: Number(formStartLine),
      end_line: Number(formEndLine),
      quote: formQuote,
      note: formNote.trim() || null,
    });
  }

  // GoldAnnotation を LineNumberedText の candidates 形式に変換
  const goldAsCandidates: AnnotationCandidate[] = goldAnnotations.map((g) => ({
    id: g.id,
    run_id: null,
    annotation_task_id: g.annotation_task_id,
    target_text_ref: g.target_text_ref,
    label: g.label,
    start_line: g.start_line,
    end_line: g.end_line,
    quote: g.quote,
    note: g.note,
    status: "accepted" as CandidateStatus,
    created_at: g.created_at,
    updated_at: g.updated_at,
  }));

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>抽出</h2>
        </div>
      </div>
      <AnnotationSectionTabs />

      <div className={styles.layout}>
        {/* 左パネル: 行番号付きテキスト */}
        <div className={styles.leftPanel}>
          <h3 className={styles.panelTitle}>コンテキスト</h3>
          {selectedTestCase ? (
            <LineNumberedText
              text={selectedTestCase.context_content}
              candidates={goldAsCandidates}
              labels={labels}
              activeRange={activeRange}
            />
          ) : (
            <p className={styles.emptyMsg}>テストケースを選択してください</p>
          )}
        </div>

        {/* 右パネル */}
        <div className={styles.rightPanel}>
          {/* タスクセレクター */}
          <div className={styles.rightSection}>
            <h3 className={styles.panelTitle}>フィルター</h3>
            <div className={styles.browseSelectors}>
              <select
                className={styles.taskSelector}
                value={selectedTaskId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTaskId(val === "" ? null : Number(val));
                  setFormLabel("");
                }}
              >
                <option value="">タスクを選択...</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* テストケース一覧 */}
              <div className={styles.testCaseList}>
                {testCases.length === 0 ? (
                  <p className={styles.emptyMsg}>テストケースがありません</p>
                ) : (
                  testCases.map((tc) => (
                    <div
                      key={tc.id}
                      className={`${styles.testCaseItem} ${selectedTestCaseId === tc.id ? styles.testCaseItemActive : ""}`}
                      onClick={() => setSelectedTestCaseId(tc.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedTestCaseId(tc.id);
                        }
                      }}
                      // biome-ignore lint/a11y/useSemanticElements: リスト項目はdivで実装
                      role="button"
                      tabIndex={0}
                    >
                      {tc.title}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Gold Annotation 一覧 + 手動追加 */}
          {selectedTaskId !== null && selectedTestCaseId !== null && (
            <div className={styles.rightSection}>
              <h3 className={styles.panelTitle}>
                Gold Annotation
                <span className={styles.countBadge}>{goldAnnotations.length}</span>
              </h3>
              {isGoldLoading ? (
                <p className={styles.loadingMsg}>読み込み中...</p>
              ) : goldAnnotations.length === 0 ? (
                <p className={styles.emptyMsg}>Gold Annotation がありません</p>
              ) : (
                <div className={styles.goldList}>
                  {[...goldAnnotations]
                    .sort((a, b) => a.start_line - b.start_line)
                    .map((g) => (
                      <GoldAnnotationCard
                        key={g.id}
                        gold={g}
                        labels={labels}
                        onHover={(range) => setActiveRange(range)}
                        onLeave={() => setActiveRange(null)}
                        onDelete={() => deleteGoldMutation.mutate(g.id)}
                      />
                    ))}
                </div>
              )}

              {/* 手動追加ボタン / フォーム */}
              {!showAddForm ? (
                <button
                  type="button"
                  className={styles.btnAddGold}
                  onClick={() => {
                    setShowAddForm(true);
                    if (labels.length > 0 && labels[0]) {
                      setFormLabel(labels[0].key);
                    }
                  }}
                >
                  + 追加
                </button>
              ) : (
                <div className={styles.addGoldForm}>
                  <div className={styles.editRow}>
                    <label htmlFor="add-gold-label" className={styles.editLabel}>
                      ラベル
                    </label>
                    <select
                      id="add-gold-label"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      className={styles.editSelect}
                      disabled={createGoldMutation.isPending}
                    >
                      <option value="">選択...</option>
                      {labels.map((l) => (
                        <option key={l.id} value={l.key}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.editRow}>
                    <label htmlFor="add-gold-start" className={styles.editLabel}>
                      開始行
                    </label>
                    <input
                      id="add-gold-start"
                      type="number"
                      value={formStartLine}
                      onChange={(e) => setFormStartLine(e.target.value)}
                      className={styles.editInput}
                      min={1}
                      disabled={createGoldMutation.isPending}
                    />
                    <label htmlFor="add-gold-end" className={styles.editLabel}>
                      終了行
                    </label>
                    <input
                      id="add-gold-end"
                      type="number"
                      value={formEndLine}
                      onChange={(e) => setFormEndLine(e.target.value)}
                      className={styles.editInput}
                      min={1}
                      disabled={createGoldMutation.isPending}
                    />
                  </div>
                  <div className={styles.editRow}>
                    <label htmlFor="add-gold-quote" className={styles.editLabel}>
                      引用
                    </label>
                    <input
                      id="add-gold-quote"
                      type="text"
                      value={formQuote}
                      onChange={(e) => setFormQuote(e.target.value)}
                      className={styles.editInputWide}
                      placeholder="対象テキストの引用"
                      disabled={createGoldMutation.isPending}
                    />
                  </div>
                  <div className={styles.editRow}>
                    <label htmlFor="add-gold-note" className={styles.editLabel}>
                      ノート
                    </label>
                    <input
                      id="add-gold-note"
                      type="text"
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                      className={styles.editInputWide}
                      placeholder="任意のメモ"
                      disabled={createGoldMutation.isPending}
                    />
                  </div>
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.btnSave}
                      onClick={handleAddFormSave}
                      disabled={
                        createGoldMutation.isPending || !formLabel || !formStartLine || !formEndLine
                      }
                    >
                      {createGoldMutation.isPending ? "保存中..." : "保存"}
                    </button>
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={() => setShowAddForm(false)}
                      disabled={createGoldMutation.isPending}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
