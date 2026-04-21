import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { RunCompareView } from "../components/RunCompareView";
import {
  type Run,
  type Score,
  createScore,
  getProject,
  getPromptVersions,
  getRuns,
  getScore,
  updateScore,
} from "../lib/api";
import { ScoreSectionTabs } from "../components/ScoreSectionTabs";
import styles from "./ScorePage.module.css";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLastAssistantMessage(run: Run): string {
  const msgs = run.conversation.filter((m) => m.role === "assistant");
  return msgs[msgs.length - 1]?.content ?? "";
}

type StructuredComment = {
  generalComment: string;
  stepComments: Record<string, string>;
};

function createEmptyStepComments(run: Run): Record<string, string> {
  return Object.fromEntries((run.execution_trace ?? []).map((step) => [step.id, ""]));
}

function parseStructuredComment(run: Run, comment: string | null): StructuredComment {
  const raw = comment ?? "";
  const stepComments = createEmptyStepComments(run);

  if (!run.execution_trace?.length || !raw.includes("[[[") || !raw.includes("]]]")) {
    return { generalComment: raw, stepComments };
  }

  const lines = raw.split("\n");
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  function flushCurrent() {
    if (currentKey === null) {
      return;
    }

    sections.push({
      key: currentKey,
      body: currentLines.join("\n").trim(),
    });
  }

  for (const line of lines) {
    const match = line.match(/^\[\[\[(overall|step:[^\]]+)\]\]\]$/);
    if (match) {
      const matchedKey = match[1];
      if (!matchedKey) {
        continue;
      }

      flushCurrent();
      currentKey = matchedKey;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  flushCurrent();

  if (sections.length === 0) {
    return { generalComment: raw, stepComments };
  }

  let generalComment = "";
  for (const section of sections) {
    if (section.key === "overall") {
      generalComment = section.body;
      continue;
    }

    if (section.key.startsWith("step:")) {
      const stepId = section.key.slice("step:".length);
      if (stepId in stepComments) {
        stepComments[stepId] = section.body;
      }
    }
  }

  return { generalComment, stepComments };
}

function serializeStructuredComment(run: Run, comment: StructuredComment): string {
  if (!run.execution_trace?.length) {
    return comment.generalComment.trim();
  }

  const sections: string[] = [];
  const general = comment.generalComment.trim();

  if (general) {
    sections.push(`[[[overall]]]\n${general}`);
  }

  for (const step of run.execution_trace) {
    const stepComment = comment.stepComments[step.id]?.trim() ?? "";
    if (!stepComment) {
      continue;
    }

    sections.push(`[[[step:${step.id}]]]\n${stepComment}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return sections.join("\n\n");
}

function ExecutionTraceSection({
  run,
  stepComments,
  onStepCommentChange,
}: {
  run: Run;
  stepComments?: Record<string, string>;
  onStepCommentChange?: (stepId: string, value: string) => void;
}) {
  if (!run.execution_trace?.length) {
    return null;
  }

  return (
    <div className={styles.traceBlock}>
      <div className={styles.traceBlockHeader}>
        <h4 className={styles.traceBlockTitle}>実行ステップ</h4>
        <span className={styles.traceBlockCount}>{run.execution_trace.length} ステップ</span>
      </div>
      <div className={styles.traceList}>
        {run.execution_trace.map((step, index) => (
          <div key={step.id} className={styles.traceCard}>
            <div className={styles.traceHeader}>
              <span className={styles.traceIndex}>Step {index + 1}</span>
              <span className={styles.traceTitle}>{step.title}</span>
            </div>
            <div className={styles.traceSection}>
              <p className={styles.traceLabel}>テンプレート</p>
              <pre className={styles.tracePre}>{step.prompt}</pre>
            </div>
            <div className={styles.traceSection}>
              <p className={styles.traceLabel}>実行時プロンプト</p>
              <pre className={styles.tracePre}>{step.renderedPrompt}</pre>
            </div>
            <div className={styles.traceSection}>
              <p className={styles.traceLabel}>出力</p>
              <pre className={styles.traceOutput}>{step.output}</pre>
            </div>
            {stepComments && onStepCommentChange ? (
              <div className={styles.traceSection}>
                <p className={styles.traceLabel}>このステップへのコメント</p>
                <textarea
                  className={`${styles.commentTextarea} ${styles.traceCommentTextarea}`}
                  value={stepComments[step.id] ?? ""}
                  onChange={(e) => onStepCommentChange(step.id, e.target.value)}
                  placeholder="例: ここで抽出してほしかった点、判定の過不足など"
                  rows={3}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------- Types ---------------
type ScoreMode = "star" | "numeric";

// --------------- StarRating ---------------
function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className={styles.starRow}>
      <span className={styles.starLabel}>スコア</span>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (hovered ?? value ?? 0) >= star;
        return (
          <button
            key={star}
            type="button"
            className={`${styles.starBtn} ${filled ? styles.starFilled : styles.starEmpty}`}
            onClick={() => !disabled && onChange(star)}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(null)}
            aria-label={`${star}点`}
            disabled={disabled}
          >
            ★
          </button>
        );
      })}
      {value !== null && (
        <span style={{ fontSize: "13px", color: "var(--c-subtext)", marginLeft: "4px" }}>
          {value}/5
        </span>
      )}
    </div>
  );
}

// --------------- NumericScore ---------------
function NumericScore({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.numericRow}>
      <span className={styles.numericLabel}>スコア</span>
      <input
        type="number"
        min="1"
        max="100"
        step="1"
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") {
            onChange(null);
            return;
          }
          const n = Math.min(100, Math.max(1, Math.round(Number(e.target.value))));
          onChange(n);
        }}
        disabled={disabled}
        className={styles.numericInput}
        placeholder="1〜100"
      />
      <span className={styles.numericSuffix}>/ 100</span>
    </div>
  );
}

// --------------- ScoreInput ---------------
function ScoreInput({
  mode,
  value,
  onChange,
  disabled,
}: {
  mode: ScoreMode;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  if (mode === "numeric") {
    return <NumericScore value={value} onChange={onChange} disabled={disabled} />;
  }
  return <StarRating value={value} onChange={(v) => onChange(v)} disabled={disabled} />;
}

// --------------- StatusBadge ---------------
function StatusBadge({ score }: { score: Score | null }) {
  if (!score) {
    return <span className={`${styles.statusBadge} ${styles.statusUnscored}`}>未採点</span>;
  }
  if (score.is_discarded) {
    return <span className={`${styles.statusBadge} ${styles.statusDiscarded}`}>破棄済み</span>;
  }
  if (score.human_score !== null) {
    return <span className={`${styles.statusBadge} ${styles.statusScored}`}>採点済み</span>;
  }
  return <span className={`${styles.statusBadge} ${styles.statusUnscored}`}>未採点</span>;
}

// --------------- useRunScore hook ---------------
function useRunScore(runId: number) {
  return useQuery<Score | null>({
    queryKey: ["score", runId],
    queryFn: async () => {
      try {
        return await getScore(runId);
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 30,
  });
}

// --------------- IndividualRunRow ---------------
function IndividualRunRow({
  run,
  versionName,
  testCaseTitle,
  autoFocus,
  scoreMode,
}: {
  run: Run;
  versionName: string;
  testCaseTitle: string;
  autoFocus?: boolean;
  scoreMode: ScoreMode;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(autoFocus ?? false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [autoFocus]);
  const [starValue, setStarValue] = useState<number | null>(null);
  const [generalComment, setGeneralComment] = useState("");
  const [stepComments, setStepComments] = useState<Record<string, string>>(() =>
    createEmptyStepComments(run),
  );
  const [saved, setSaved] = useState(false);

  const { data: score } = useRunScore(run.id);

  // スコアが取得されたら初期値を設定（一度だけ）
  const [initialized, setInitialized] = useState(false);
  if (score !== undefined && !initialized) {
    setInitialized(true);
    if (score) {
      setStarValue(score.human_score);
      const parsed = parseStructuredComment(run, score.human_comment);
      setGeneralComment(parsed.generalComment);
      setStepComments(parsed.stepComments);
    } else {
      setGeneralComment("");
      setStepComments(createEmptyStepComments(run));
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const humanComment = serializeStructuredComment(run, { generalComment, stepComments });
      if (score) {
        return updateScore(run.id, {
          human_score: starValue,
          human_comment: humanComment || null,
        });
      }
      return createScore(run.id, {
        human_score: starValue ?? undefined,
        human_comment: humanComment || undefined,
      });
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void queryClient.invalidateQueries({ queryKey: ["score", run.id] });
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      if (score) {
        return updateScore(run.id, { is_discarded: !score.is_discarded });
      }
      return createScore(run.id, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["score", run.id] });
    },
  });

  const lastResponse = getLastAssistantMessage(run);
  const isDiscarded = score?.is_discarded ?? false;

  return (
    <div ref={cardRef} className={`${styles.runCard} ${autoFocus ? styles.runCardFocused : ""}`}>
      <button
        type="button"
        className={styles.runCardHeader}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{ width: "100%", textAlign: "left" }}
      >
        <span className={styles.runId}>Run #{run.id}</span>
        <span className={styles.runMeta}>
          {versionName} × {testCaseTitle} · {formatDate(run.created_at)}
        </span>
        <StatusBadge score={score ?? null} />
        <span style={{ color: "var(--c-subtext)", fontSize: "12px" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className={styles.runCardBody}>
          {lastResponse && <p className={styles.responsePreview}>{lastResponse}</p>}
          <ExecutionTraceSection
            run={run}
            stepComments={stepComments}
            onStepCommentChange={(stepId, value) =>
              setStepComments((prev) => ({ ...prev, [stepId]: value }))
            }
          />

          {isDiscarded ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ color: "var(--c-danger)", fontSize: "13px" }}>
                この Run は破棄済みです
              </span>
              <button
                type="button"
                className={styles.btnRestore}
                onClick={() => discardMutation.mutate()}
                disabled={discardMutation.isPending}
              >
                破棄を取り消す
              </button>
            </div>
          ) : (
            <>
              <ScoreInput mode={scoreMode} value={starValue} onChange={setStarValue} />
              <textarea
                className={styles.commentTextarea}
                value={generalComment}
                onChange={(e) => setGeneralComment(e.target.value)}
                placeholder={
                  run.execution_trace?.length ? "全体コメント（任意）" : "コメント（任意）"
                }
                rows={2}
              />
              <div className={styles.scoreActions}>
                <button
                  type="button"
                  className={styles.btnSave}
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  className={styles.btnDiscard}
                  onClick={() => discardMutation.mutate()}
                  disabled={discardMutation.isPending}
                >
                  破棄
                </button>
                {saved && <p className={styles.savedMsg}>保存しました</p>}
                {saveMutation.isError && <p className={styles.errorMsg}>保存に失敗しました</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --------------- BulkScoreState ---------------
type BulkState = {
  starValue: number | null;
  generalComment: string;
  stepComments: Record<string, string>;
  isDiscarded: boolean;
  dirty: boolean;
};

// --------------- BulkRunRow ---------------
function BulkRunRow({
  run,
  versionName,
  testCaseTitle,
  score,
  bulkState,
  onBulkChange,
  onCompare,
  isCompareSelected,
  scoreMode,
}: {
  run: Run;
  versionName: string;
  testCaseTitle: string;
  score: Score | null;
  bulkState: BulkState;
  onBulkChange: (patch: Partial<BulkState>) => void;
  onCompare: () => void;
  isCompareSelected: boolean;
  scoreMode: ScoreMode;
}) {
  const lastResponse = getLastAssistantMessage(run);

  return (
    <div className={`${styles.runCard} ${isCompareSelected ? styles.runCardCompareSelected : ""}`}>
      <div className={styles.runCardHeader}>
        <span className={styles.runId}>Run #{run.id}</span>
        <span className={styles.runMeta}>
          {versionName} × {testCaseTitle} · {formatDate(run.created_at)}
        </span>
        <StatusBadge
          score={
            bulkState.isDiscarded
              ? {
                  ...(score ?? {
                    id: 0,
                    run_id: run.id,
                    human_score: null,
                    human_comment: null,
                    judge_score: null,
                    judge_reason: null,
                    created_at: 0,
                    updated_at: 0,
                  }),
                  is_discarded: true,
                }
              : score
          }
        />
        <button
          type="button"
          className={`${styles.btnCompare} ${isCompareSelected ? styles.btnCompareActive : ""}`}
          onClick={onCompare}
        >
          {isCompareSelected ? "比較解除" : "比較"}
        </button>
      </div>

      <div className={styles.runCardBody}>
        {lastResponse && <p className={styles.responsePreview}>{lastResponse}</p>}
        <ExecutionTraceSection
          run={run}
          stepComments={bulkState.stepComments}
          onStepCommentChange={(stepId, value) =>
            onBulkChange({
              stepComments: { ...bulkState.stepComments, [stepId]: value },
            })
          }
        />

        {bulkState.isDiscarded ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "var(--c-danger)", fontSize: "13px" }}>
              破棄対象としてマークされています
            </span>
            <button
              type="button"
              className={styles.btnRestore}
              onClick={() => onBulkChange({ isDiscarded: false })}
            >
              取り消す
            </button>
          </div>
        ) : (
          <>
            <ScoreInput
              mode={scoreMode}
              value={bulkState.starValue}
              onChange={(v) => onBulkChange({ starValue: v })}
            />
            <textarea
              className={styles.commentTextarea}
              value={bulkState.generalComment}
              onChange={(e) => onBulkChange({ generalComment: e.target.value })}
              placeholder={
                run.execution_trace?.length ? "全体コメント（任意）" : "コメント（任意）"
              }
              rows={2}
            />
            <button
              type="button"
              className={styles.btnDiscard}
              onClick={() => onBulkChange({ isDiscarded: true })}
            >
              この Run を破棄
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --------------- ScorePage ---------------
export function ScorePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const focusedRunId = searchParams.get("runId") ? Number(searchParams.get("runId")) : null;

  const [tab, setTab] = useState<"individual" | "bulk">("individual");
  const [scoreMode, setScoreMode] = useState<ScoreMode>("star");
  const [filterVersionId, setFilterVersionId] = useState<number | "">("");
  const [bulkSaved, setBulkSaved] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  function toggleCompare(runId: number) {
    setCompareIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) {
        const previousSecond = prev[1];
        return previousSecond === undefined ? [runId] : [previousSecond, runId];
      }
      return [...prev, runId];
    });
  }

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

  const { data: runs = [] } = useQuery({
    queryKey: ["runs", projectId, { prompt_version_id: filterVersionId }],
    queryFn: () =>
      getRuns(projectId, {
        prompt_version_id: filterVersionId !== "" ? filterVersionId : undefined,
      }),
    enabled: !Number.isNaN(projectId),
  });

  // 全 Run のスコアを並列取得
  const scoreQueries = useQuery({
    queryKey: ["scores-bulk", runs.map((r) => r.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        runs.map(async (run) => {
          try {
            const s = await getScore(run.id);
            return [run.id, s] as [number, Score];
          } catch {
            return [run.id, null] as [number, null];
          }
        }),
      );
      return new Map<number, Score | null>(entries);
    },
    enabled: runs.length > 0,
    staleTime: 1000 * 30,
  });

  const scoresMap = scoreQueries.data ?? new Map<number, Score | null>();

  // 一括採点用の状態管理
  const [bulkEdits, setBulkEdits] = useState<Map<number, BulkState>>(new Map());

  function getBulkState(runId: number): BulkState {
    if (bulkEdits.has(runId)) return bulkEdits.get(runId) as BulkState;
    const score = scoresMap.get(runId) ?? null;
    const run = runs.find((current) => current.id === runId);
    const parsed = run
      ? parseStructuredComment(run, score?.human_comment ?? "")
      : { generalComment: score?.human_comment ?? "", stepComments: {} };
    return {
      starValue: score?.human_score ?? null,
      generalComment: parsed.generalComment,
      stepComments: parsed.stepComments,
      isDiscarded: score?.is_discarded ?? false,
      dirty: false,
    };
  }

  function updateBulkEdit(runId: number, patch: Partial<BulkState>) {
    setBulkEdits((prev) => {
      const next = new Map(prev);
      next.set(runId, { ...getBulkState(runId), ...patch, dirty: true });
      return next;
    });
  }

  async function handleBulkSave() {
    setBulkSaving(true);
    const dirty = runs.filter((r) => bulkEdits.get(r.id)?.dirty);

    await Promise.all(
      dirty.map(async (run) => {
        const edit = getBulkState(run.id);
        const existingScore = scoresMap.get(run.id) ?? null;
        const humanComment = serializeStructuredComment(run, {
          generalComment: edit.generalComment,
          stepComments: edit.stepComments,
        });
        if (existingScore) {
          await updateScore(run.id, {
            human_score: edit.isDiscarded ? null : (edit.starValue ?? null),
            human_comment: edit.isDiscarded ? null : humanComment || null,
            is_discarded: edit.isDiscarded,
          });
        } else {
          await createScore(run.id, {
            human_score: edit.isDiscarded ? undefined : (edit.starValue ?? undefined),
            human_comment: edit.isDiscarded ? undefined : humanComment || undefined,
          });
          if (edit.isDiscarded) {
            const created = await getScore(run.id);
            await updateScore(run.id, { is_discarded: true, human_score: created.human_score });
          }
        }
      }),
    );

    await queryClient.invalidateQueries({ queryKey: ["scores-bulk"] });
    await queryClient.invalidateQueries({ queryKey: ["score"] });
    setBulkEdits(new Map());
    setBulkSaving(false);
    setBulkSaved(true);
    setTimeout(() => setBulkSaved(false), 2500);
  }

  function getVersionName(versionId: number): string {
    const v = promptVersions.find((pv) => pv.id === versionId);
    if (!v) return `v${versionId}`;
    return `v${v.version}${v.name ? ` - ${v.name}` : ""}`;
  }

  const dirtyCount = runs.filter((r) => bulkEdits.get(r.id)?.dirty).length;

  const compareRunA = compareIds[0] != null ? runs.find((r) => r.id === compareIds[0]) : undefined;
  const compareRunB = compareIds[1] != null ? runs.find((r) => r.id === compareIds[1]) : undefined;

  return (
    <div className={styles.root}>
      {/* ヘッダー */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>採点</h2>
          {project && <p className={styles.projectName}>{project.name}</p>}
        </div>
      </div>

      <ScoreSectionTabs />

      {/* タブ */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === "individual" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("individual")}
        >
          個別採点
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === "bulk" ? styles.tabBtnActive : ""}`}
          onClick={() => setTab("bulk")}
        >
          一括採点
        </button>
      </div>

      {/* フィルター・モード切替 */}
      <div className={styles.filters}>
        <label htmlFor="filter-version" className={styles.filterLabel}>
          バージョン
        </label>
        <select
          id="filter-version"
          value={filterVersionId}
          onChange={(e) => setFilterVersionId(e.target.value === "" ? "" : Number(e.target.value))}
          className={styles.filterSelect}
        >
          <option value="">すべて</option>
          {promptVersions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version}
              {v.name ? ` - ${v.name}` : ""}
            </option>
          ))}
        </select>

        <div className={styles.scoreModeToggle}>
          <span className={styles.scoreModeLabel}>採点モード</span>
          <div className={styles.scoreModeButtons}>
            <button
              type="button"
              className={`${styles.scoreModeBtn} ${scoreMode === "star" ? styles.scoreModeBtnActive : ""}`}
              onClick={() => setScoreMode("star")}
            >
              ★ 5段階
            </button>
            <button
              type="button"
              className={`${styles.scoreModeBtn} ${scoreMode === "numeric" ? styles.scoreModeBtnActive : ""}`}
              onClick={() => setScoreMode("numeric")}
            >
              # 100点
            </button>
          </div>
        </div>
      </div>

      {runs.length === 0 && (
        <p className={styles.emptyMsg}>Run がありません。まず Run を作成してください。</p>
      )}

      {/* 個別採点タブ */}
      {tab === "individual" && runs.length > 0 && (
        <div>
          {runs.map((run) => (
            <IndividualRunRow
              key={run.id}
              run={run}
              versionName={getVersionName(run.prompt_version_id)}
              testCaseTitle={`テストケース #${run.test_case_id}`}
              autoFocus={focusedRunId === run.id}
              scoreMode={scoreMode}
            />
          ))}
        </div>
      )}

      {/* 一括採点タブ */}
      {tab === "bulk" && runs.length > 0 && (
        <div>
          <div className={styles.bulkHeader}>
            <span className={styles.bulkCount}>
              {runs.length} 件の Run
              {dirtyCount > 0 && ` （${dirtyCount} 件に変更あり）`}
            </span>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              {bulkSaved && <p className={styles.bulkSavedMsg}>保存しました</p>}
              <button
                type="button"
                className={styles.btnBulkSave}
                onClick={handleBulkSave}
                disabled={dirtyCount === 0 || bulkSaving}
              >
                {bulkSaving ? "保存中..." : "まとめて保存"}
              </button>
            </div>
          </div>

          {/* 比較バー */}
          {compareIds.length > 0 && (
            <div className={styles.compareBar}>
              <span className={styles.compareBarLabel}>比較:</span>
              <span className={styles.compareBarSelected}>Run #{compareIds[0]}</span>
              {compareIds.length === 2 && (
                <>
                  <span className={styles.compareBarVs}>vs</span>
                  <span className={styles.compareBarSelected}>Run #{compareIds[1]}</span>
                  <button
                    type="button"
                    className={styles.btnOpenCompare}
                    onClick={() => setShowCompare(true)}
                  >
                    比較を開く
                  </button>
                </>
              )}
              {compareIds.length === 1 && (
                <span className={styles.compareBarHint}>もう1件選択してください</span>
              )}
              <button
                type="button"
                className={styles.btnClearCompare}
                onClick={() => setCompareIds([])}
              >
                クリア
              </button>
            </div>
          )}

          {runs.map((run) => (
            <BulkRunRow
              key={run.id}
              run={run}
              versionName={getVersionName(run.prompt_version_id)}
              testCaseTitle={`テストケース #${run.test_case_id}`}
              score={scoresMap.get(run.id) ?? null}
              bulkState={getBulkState(run.id)}
              onBulkChange={(patch) => updateBulkEdit(run.id, patch)}
              onCompare={() => toggleCompare(run.id)}
              isCompareSelected={compareIds.includes(run.id)}
              scoreMode={scoreMode}
            />
          ))}

          {dirtyCount > 0 && (
            <div style={{ textAlign: "right", marginTop: "16px" }}>
              <button
                type="button"
                className={styles.btnBulkSave}
                onClick={handleBulkSave}
                disabled={bulkSaving}
              >
                {bulkSaving ? "保存中..." : "まとめて保存"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 比較ウィンドウ */}
      {showCompare && compareRunA && compareRunB && (
        <RunCompareView
          runA={compareRunA}
          runB={compareRunB}
          versionLabelA={getVersionName(compareRunA.prompt_version_id)}
          versionLabelB={getVersionName(compareRunB.prompt_version_id)}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
