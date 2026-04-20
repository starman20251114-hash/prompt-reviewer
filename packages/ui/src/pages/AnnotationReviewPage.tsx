import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  type AnnotationCandidate,
  type AnnotationLabel,
  type CandidateStatus,
  type GoldAnnotation,
  getAnnotationCandidates,
  getAnnotationTask,
  getGoldAnnotations,
  getProject,
  getRun,
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
      return s.badgePending;
    case "accepted":
      return s.badgeAccepted;
    case "rejected":
      return s.badgeRejected;
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

export function AnnotationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const projectId = Number(id);
  const runId = Number(searchParams.get("runId"));
  const taskId = Number(searchParams.get("taskId"));
  const queryClient = useQueryClient();

  const [activeRange, setActiveRange] = useState<{ start: number; end: number } | null>(null);

  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const { data: run, isLoading: isRunLoading } = useQuery({
    queryKey: ["runs", projectId, runId],
    queryFn: () => getRun(projectId, runId),
    enabled: !Number.isNaN(projectId) && !Number.isNaN(runId),
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

  // Run の最後の assistant メッセージを取得
  const assistantText = (() => {
    if (!run) return "";
    const msgs = [...run.conversation].reverse();
    return msgs.find((m) => m.role === "assistant")?.content ?? "";
  })();

  const labels = annotationTask?.labels ?? [];
  const isLoading = isRunLoading || isTaskLoading || isCandidatesLoading;

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
        <p className={styles.errorMsg}>Run またはアノテーションタスクが見つかりません。</p>
        <Link to={`/projects/${projectId}/runs`} className={styles.backLink}>
          ← Run 一覧に戻る
        </Link>
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
          <h2 className={styles.pageTitle}>Annotation レビュー</h2>
          <p className={styles.pageMeta}>
            {project?.name} / Run #{run.id} / {annotationTask.name}
          </p>
        </div>
      </div>

      {/* 2カラムレイアウト */}
      <div className={styles.layout}>
        {/* 左パネル: 行番号付きテキスト */}
        <div className={styles.leftPanel}>
          <h3 className={styles.panelTitle}>アシスタント応答</h3>
          {assistantText ? (
            <LineNumberedText
              text={assistantText}
              candidates={candidates}
              labels={labels}
              activeRange={activeRange}
            />
          ) : (
            <p className={styles.emptyMsg}>アシスタントの応答がありません。</p>
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
                {candidates.map((c) => (
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
                {goldAnnotations.map((g) => (
                  <GoldAnnotationCard key={g.id} gold={g} labels={labels} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoldAnnotationCard({
  gold,
  labels,
}: {
  gold: GoldAnnotation;
  labels: AnnotationLabel[];
}) {
  const label = labels.find((l) => l.key === gold.label);
  return (
    <div className={styles.goldCard}>
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
      </div>
      <p className={styles.candidateQuote}>&ldquo;{gold.quote}&rdquo;</p>
      {gold.note && <p className={styles.candidateNote}>{gold.note}</p>}
    </div>
  );
}
