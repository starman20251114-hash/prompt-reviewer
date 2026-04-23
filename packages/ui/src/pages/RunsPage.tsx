import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { RunCompareView } from "../components/RunCompareView";
import { useApiKey } from "../hooks/useApiKey";
import {
  type AnnotationTask,
  type ConversationMessage,
  type ExecutionProfile,
  type ExecutionTraceStep,
  type PromptFamily,
  type PromptVersion,
  type Run,
  type TestCase,
  createRun,
  createRunIndependent,
  discardRun,
  discardRunIndependent,
  executeRunStream,
  executeRunStreamIndependent,
  extractAnnotationCandidates,
  extractAnnotationCandidatesIndependent,
  getAnnotationTasks,
  getExecutionProfiles,
  getIndependentTestCases,
  getProject,
  getPromptFamilies,
  getPromptVersionsByFamily,
  getRunsIndependent,
  setBestRun,
  setBestRunIndependent,
} from "../lib/api";
import styles from "./RunsPage.module.css";

function buildFullPrompt(version: PromptVersion, testCase?: TestCase | null): string {
  const contextBlock = testCase?.context_content
    ? `[Context]\n${testCase.context_content}\n[/Context]`
    : "";
  const systemPrompt = testCase?.context_content
    ? version.content.includes("{{context}}")
      ? version.content.replace("{{context}}", contextBlock)
      : `${version.content}\n\n${contextBlock}`
    : version.content;

  const turnsText = (testCase?.turns ?? [])
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  return turnsText
    ? `${systemPrompt}\n\n[Conversation]\n${turnsText}\n[/Conversation]`
    : systemPrompt;
}

function buildWorkflowPreview(version: PromptVersion, testCase?: TestCase | null): string {
  const turnsText = (testCase?.turns ?? [])
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n\n");
  const baseContext = testCase?.context_content || "(なし)";
  const stepsText = [
    `## Step 1: プロンプト本文\nid: __base_prompt__\ncontext: テストケースの context_content\n\n${version.content}`,
    ...(version.workflow_definition?.steps ?? []).map(
      (step, index) =>
        `## Step ${index + 2}: ${step.title}\nid: ${step.id}\ncontext: 直前ステップの出力\n\n${step.prompt}`,
    ),
  ].join("\n\n");

  return [
    "[Test Case Context]",
    baseContext,
    "",
    "[Conversation]",
    turnsText || "(なし)",
    "",
    "[Workflow Steps]",
    stepsText,
  ].join("\n");
}

function CopyPromptPanel({
  version,
  testCase,
}: {
  version: PromptVersion;
  testCase?: TestCase | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasWorkflow = (version.workflow_definition?.steps.length ?? 0) > 0;
  const panelText = hasWorkflow
    ? buildWorkflowPreview(version, testCase)
    : buildFullPrompt(version, testCase);

  function handleCopy() {
    navigator.clipboard.writeText(panelText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={styles.copyPromptPanel}>
      <div className={styles.copyPromptHeader}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={styles.btnCopyPromptToggle}
          aria-expanded={open}
        >
          {open
            ? hasWorkflow
              ? "▲ ステップ構成を閉じる"
              : "▲ プロンプト全文を閉じる"
            : hasWorkflow
              ? "▼ ステップ構成を表示"
              : "▼ プロンプト全文を表示"}
        </button>
        <button type="button" onClick={handleCopy} className={styles.btnCopy}>
          {copied ? "✓ コピー済み" : hasWorkflow ? "構成をコピー" : "コピー"}
        </button>
      </div>
      {hasWorkflow && (
        <div className={styles.workflowSummary}>
          <p className={styles.workflowSummaryText}>
            この Run は段階実行です。プロンプト本文が Step 1、追加ステップが Step 2
            以降として実行されます。
          </p>
        </div>
      )}
      {open && (
        <textarea readOnly value={panelText} className={styles.copyPromptTextarea} rows={12} />
      )}
    </div>
  );
}

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
type PageTab = "create" | "list";

function ExecutionTraceView({
  trace,
  streamingStepId,
}: {
  trace: ExecutionTraceStep[];
  streamingStepId?: string | null;
}) {
  if (trace.length === 0) {
    return null;
  }

  return (
    <div className={styles.traceList}>
      {trace.map((step, index) => (
        <div key={step.id} className={styles.traceCard}>
          <div className={styles.traceHeader}>
            <div>
              <span className={styles.traceIndex}>Step {index + 1}</span>
              <span className={styles.traceTitle}>{step.title}</span>
            </div>
            <span className={styles.traceStatus}>
              {streamingStepId === step.id ? "実行中..." : "完了"}
            </span>
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
            <pre className={styles.traceOutput}>{step.output || " "}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunConversation({ conversation }: { conversation: ConversationMessage[] }) {
  return (
    <div className={styles.chatList}>
      {conversation.map((msg, index) => (
        <div
          key={`msg-${
            // biome-ignore lint/suspicious/noArrayIndexKey: 会話配列は順序で管理するため index をキーとして使用
            index
          }`}
          className={`${styles.bubbleWrapper} ${msg.role === "user" ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}
        >
          <span className={styles.bubbleRole}>{msg.role === "user" ? "User" : "Assistant"}</span>
          <div
            className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
          >
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function AnnotationExtractPanel({
  run,
  projectId,
  annotationTasks,
}: {
  run: Run;
  projectId: number | null;
  annotationTasks: AnnotationTask[];
}) {
  const [selectedTaskId, setSelectedTaskId] = useState<number | "">("");
  const [extractResult, setExtractResult] = useState<{
    candidates_created: number;
    annotation_task_id: number;
  } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const hasStructuredOutput = run.structured_output !== null;
  const lastAssistantMsg = [...run.conversation].reverse().find((m) => m.role === "assistant");
  const lastMsgIsJson = (() => {
    if (!lastAssistantMsg) return false;
    const text = lastAssistantMsg.content;
    try {
      JSON.parse(text);
      return true;
    } catch {
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try {
          JSON.parse(text.slice(first, last + 1));
          return true;
        } catch {
          // ignore
        }
      }
      return false;
    }
  })();
  const canExtract = hasStructuredOutput || lastMsgIsJson;

  const extractMutation = useMutation({
    mutationFn: () => {
      if (selectedTaskId === "") throw new Error("タスクを選択してください");
      const params = {
        annotation_task_id: selectedTaskId,
        source_type: hasStructuredOutput ? "structured_json" : "final_answer",
      } as const;
      return projectId !== null
        ? extractAnnotationCandidates(projectId, run.id, params)
        : extractAnnotationCandidatesIndependent(run.id, params);
    },
    onSuccess: (result) => {
      setExtractResult(result);
      setExtractError(null);
    },
    onError: (error) => {
      setExtractError(error instanceof Error ? error.message : "抽出に失敗しました");
    },
  });

  return (
    <div className={styles.annotationPanel}>
      {!canExtract && (
        <p className={styles.annotationWarning}>
          このRunのアシスタント応答がJSON形式と判定できませんでした。抽出を実行しますが、サーバー側でJSONが見つからない場合はエラーになります。
        </p>
      )}
      <div className={styles.annotationPanelRow}>
        <label htmlFor={`task-select-${run.id}`} className={styles.annotationLabel}>
          アノテーションタスク
        </label>
        <select
          id={`task-select-${run.id}`}
          value={selectedTaskId}
          onChange={(e) => {
            setSelectedTaskId(e.target.value === "" ? "" : Number(e.target.value));
            setExtractResult(null);
          }}
          className={styles.annotationSelect}
          disabled={extractMutation.isPending}
        >
          <option value="">-- タスクを選択 --</option>
          {annotationTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => extractMutation.mutate()}
          disabled={selectedTaskId === "" || extractMutation.isPending}
          className={styles.btnAnnotationExtract}
        >
          {extractMutation.isPending ? "抽出中..." : "抽出実行"}
        </button>
      </div>
      {extractError && <p className={styles.annotationError}>{extractError}</p>}
      {extractResult && (
        <div className={styles.annotationSuccess}>
          <span>{extractResult.candidates_created} 件の候補を抽出しました。</span>
          <Link
            to={`${projectId !== null ? `/projects/${projectId}/annotation-review` : "/annotation-review"}?runId=${run.id}&taskId=${extractResult.annotation_task_id}`}
            className={styles.annotationReviewLink}
          >
            レビューページへ
          </Link>
        </div>
      )}
      {!extractResult && selectedTaskId !== "" && (
        <div className={styles.annotationReviewLinkRow}>
          <Link
            to={`${projectId !== null ? `/projects/${projectId}/annotation-review` : "/annotation-review"}?runId=${run.id}&taskId=${selectedTaskId}`}
            className={styles.annotationReviewLinkSmall}
          >
            既存の候補をレビュー
          </Link>
        </div>
      )}
    </div>
  );
}

function RunCard({
  run,
  projectId,
  scorePath,
  versionLabel,
  versionNumber,
  testCaseLabel,
  annotationTasks,
  onSetBest,
  isBestPending,
  onCompare,
  isCompareSelected,
  onDiscard,
  isDiscardPending,
}: {
  run: Run;
  projectId: number | null;
  scorePath: string;
  versionLabel: string;
  versionNumber: number;
  testCaseLabel: string;
  annotationTasks: AnnotationTask[];
  onSetBest: (unset: boolean) => void;
  isBestPending: boolean;
  onCompare?: () => void;
  isCompareSelected?: boolean;
  onDiscard: () => void;
  isDiscardPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const hasTrace = (run.execution_trace?.length ?? 0) > 0;
  const isQuickRun = run.run_mode === "quick";

  return (
    <div
      className={`${styles.runCard} ${run.is_best ? styles.runCardBest : ""} ${isCompareSelected ? styles.runCardCompareSelected : ""}`}
    >
      <div className={styles.runCardTop}>
        <div className={styles.runCardHeader}>
          <span className={styles.runId}>Run #{run.id}</span>
          {run.is_best && (
            <span className={styles.badgeBest} title={`${versionLabel} のベスト回答`}>
              ★ v{versionNumber} のベスト
            </span>
          )}
          <span className={styles.runMeta}>
            {versionLabel} &times; {testCaseLabel}
            {isQuickRun && run.ad_hoc_input ? " / 直接入力あり" : ""}
          </span>
          <span className={styles.runDate}>{formatDate(run.created_at)}</span>
        </div>

        <div className={styles.runCardActions}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className={styles.btnToggle}
            aria-expanded={expanded}
          >
            {expanded ? "▲ 折りたたむ" : hasTrace ? "▼ 会話とステップを表示" : "▼ 会話を表示"}
          </button>
          {onCompare && (
            <button
              type="button"
              onClick={onCompare}
              className={`${styles.btnCompare} ${isCompareSelected ? styles.btnCompareActive : ""}`}
            >
              {isCompareSelected ? "比較解除" : "比較"}
            </button>
          )}
          <Link to={`${scorePath}?runId=${run.id}`} className={styles.btnScore}>
            採点
          </Link>
          {annotationTasks.length > 0 && !isQuickRun && (
            <button
              type="button"
              onClick={() => setShowAnnotation((prev) => !prev)}
              className={styles.btnAnnotation}
            >
              {showAnnotation ? "Annotation を閉じる" : "Annotation候補を抽出"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const unset = run.is_best;
              onSetBest(unset);
            }}
            disabled={isBestPending || isQuickRun}
            className={`${styles.btnBest} ${run.is_best ? styles.btnBestActive : styles.btnBestInactive}`}
          >
            {isQuickRun
              ? "かんたん実行ではベスト設定不可"
              : run.is_best
                ? "ベスト設定済み（解除）"
                : "バージョンのベストに設定"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isDiscardPending}
            className={`${styles.btnDiscard} ${styles.btnDiscardActive}`}
          >
            破棄
          </button>
        </div>
      </div>

      {showAnnotation && (
        <AnnotationExtractPanel run={run} projectId={projectId} annotationTasks={annotationTasks} />
      )}

      {expanded && (
        <div className={styles.runConversation}>
          <RunConversation conversation={run.conversation} />
          {hasTrace && (
            <div className={styles.traceBlock}>
              <h4 className={styles.traceBlockTitle}>実行ステップ</h4>
              <ExecutionTraceView trace={run.execution_trace ?? []} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunCompareBar({
  compareRunA,
  compareRunB,
  getVersionLabel,
  onOpenCompare,
  onClearFirst,
  onClearAll,
  className,
}: {
  compareRunA: Run | null;
  compareRunB: Run | null;
  getVersionLabel: (versionId: number) => string;
  onOpenCompare: () => void;
  onClearFirst: () => void;
  onClearAll: () => void;
  className?: string;
}) {
  if (!compareRunA && !compareRunB) {
    return null;
  }

  return (
    <div className={`${styles.compareBar} ${className ?? ""}`.trim()}>
      <span className={styles.compareBarLabel}>比較:</span>
      {compareRunA && (
        <span className={styles.compareBarSelected}>
          Run #{compareRunA.id} ({getVersionLabel(compareRunA.prompt_version_id)})
        </span>
      )}
      {compareRunB ? (
        <>
          <span className={styles.compareBarVs}>vs</span>
          <span className={styles.compareBarComparing}>
            Run #{compareRunB.id} ({getVersionLabel(compareRunB.prompt_version_id)})
          </span>
          <button type="button" onClick={onOpenCompare} className={styles.btnOpenCompare}>
            比較を表示
          </button>
          <button type="button" onClick={onClearAll} className={styles.btnClearCompare}>
            クリア
          </button>
        </>
      ) : (
        <>
          <span className={styles.compareBarHint}>もう1つ「比較」をクリックしてください</span>
          <button type="button" onClick={onClearFirst} className={styles.btnClearCompare}>
            クリア
          </button>
        </>
      )}
    </div>
  );
}

export function RunsPage() {
  const { id } = useParams<{ id?: string }>();
  const projectId = id !== undefined ? Number(id) : null;
  const queryClient = useQueryClient();

  const apiKeyScope = projectId ?? "shared";
  const { apiKey, hasApiKey } = useApiKey(apiKeyScope);

  const [activeTab, setActiveTab] = useState<PageTab>("create");

  const [step, setStep] = useState<Step>("select");
  const [selectedVersionId, setSelectedVersionId] = useState<number | "">("");
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<number | "">("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | "">("");
  const [adHocInput, setAdHocInput] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [executionTrace, setExecutionTrace] = useState<ExecutionTraceStep[]>([]);
  const [streamingStepId, setStreamingStepId] = useState<string | null>(null);
  const [savedRun, setSavedRun] = useState<Run | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const [filterVersionId, setFilterVersionId] = useState<number | "">("");
  const [filterTestCaseId, setFilterTestCaseId] = useState<number | "">("");

  const [compareRunA, setCompareRunA] = useState<Run | null>(null);
  const [compareRunB, setCompareRunB] = useState<Run | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const scorePath = projectId !== null ? `/projects/${projectId}/score` : "/score";

  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId as number),
    enabled: projectId !== null && !Number.isNaN(projectId),
  });

  const { data: promptFamilies = [] } = useQuery({
    queryKey: ["prompt-families"],
    queryFn: () => getPromptFamilies(),
  });

  const { data: allVersions = [] } = useQuery({
    queryKey: ["prompt-versions-by-family", filterVersionId !== "" ? undefined : "all"],
    queryFn: () => {
      if (promptFamilies.length === 0) return Promise.resolve([]);
      return Promise.all(
        promptFamilies.map((f: PromptFamily) => getPromptVersionsByFamily(f.id)),
      ).then((arrays) => arrays.flat());
    },
    enabled: promptFamilies.length > 0,
  });

  const { data: testCases = [] } = useQuery({
    queryKey: ["test-cases-independent", projectId],
    queryFn: () =>
      getIndependentTestCases(projectId !== null ? { project_id: projectId } : undefined),
  });

  const { data: executionProfiles = [] } = useQuery({
    queryKey: ["execution-profiles"],
    queryFn: () => getExecutionProfiles(),
  });

  const { data: annotationTasks = [] } = useQuery({
    queryKey: ["annotation-tasks"],
    queryFn: () => getAnnotationTasks(),
  });

  const { data: relatedRuns = [] } = useQuery({
    queryKey: [
      "runs-independent",
      { prompt_version_id: selectedVersionId, test_case_id: selectedTestCaseId },
    ],
    queryFn: () =>
      getRunsIndependent({
        prompt_version_id: selectedVersionId !== "" ? selectedVersionId : undefined,
        test_case_id: selectedTestCaseId !== "" ? selectedTestCaseId : undefined,
        project_id: projectId ?? undefined,
      }),
    enabled: step === "saved" && selectedVersionId !== "",
  });

  useEffect(() => {
    if (selectedVersionId !== "" || allVersions.length === 0) {
      return;
    }

    const selectedVersion =
      [...allVersions]
        .filter((version) => version.is_selected)
        .sort((a, b) => b.created_at - a.created_at)[0] ??
      [...allVersions].sort((a, b) => b.created_at - a.created_at)[0];

    if (selectedVersion) {
      setSelectedVersionId(selectedVersion.id);
    }
  }, [allVersions, selectedVersionId]);

  const { data: allRuns = [], isLoading: isRunsLoading } = useQuery({
    queryKey: [
      "runs-independent",
      { prompt_version_id: filterVersionId, test_case_id: filterTestCaseId, project_id: projectId },
    ],
    queryFn: () =>
      getRunsIndependent({
        prompt_version_id: filterVersionId !== "" ? filterVersionId : undefined,
        test_case_id: filterTestCaseId !== "" ? filterTestCaseId : undefined,
        project_id: projectId ?? undefined,
      }),
    enabled: activeTab === "list",
  });

  const createRunMutation = useMutation({
    mutationFn: (data: {
      prompt_version_id: number;
      test_case_id?: number;
      ad_hoc_input?: string;
      conversation: ConversationMessage[];
    }) => {
      const profileId = selectedProfileId !== "" ? selectedProfileId : executionProfiles[0]?.id;
      if (!profileId) throw new Error("実行プロファイルを選択してください");
      if (projectId !== null) {
        return createRun(projectId, {
          ...data,
          execution_trace: executionTrace.length > 0 ? executionTrace : undefined,
          execution_profile_id: profileId,
        });
      }
      return createRunIndependent({
        ...data,
        execution_trace: executionTrace.length > 0 ? executionTrace : undefined,
        execution_profile_id: profileId,
      });
    },
    onSuccess: (run) => {
      setSavedRun(run);
      setStep("saved");
      void queryClient.invalidateQueries({ queryKey: ["runs-independent"] });
    },
  });

  const executeRunMutation = useMutation({
    mutationFn: (data: { prompt_version_id: number; test_case_id?: number; ad_hoc_input?: string }) => {
      const profileId = selectedProfileId !== "" ? selectedProfileId : executionProfiles[0]?.id;
      if (!profileId) throw new Error("実行プロファイルを選択してください");
      const options = {
        ...data,
        api_key: apiKey,
        execution_profile_id: profileId,
        onDelta: (text: string) => {
          setLlmResponse((prev) => `${prev}${text}`);
        },
        onStepStart: (stepInfo: Omit<ExecutionTraceStep, "output">) => {
          setStreamingStepId(stepInfo.id);
          setExecutionTrace((prev) => [...prev, { ...stepInfo, output: "" }]);
          setLlmResponse("");
        },
        onStepDelta: (stepDelta: { id: string; title: string; text: string }) => {
          setExecutionTrace((prev) =>
            prev.map((s) =>
              s.id === stepDelta.id ? { ...s, output: `${s.output}${stepDelta.text}` } : s,
            ),
          );
          setLlmResponse((prev) => `${prev}${stepDelta.text}`);
        },
        onStepComplete: (stepInfo: ExecutionTraceStep) => {
          setExecutionTrace((prev) => prev.map((s) => (s.id === stepInfo.id ? stepInfo : s)));
          setStreamingStepId(null);
          setLlmResponse(stepInfo.output);
        },
      };
      if (projectId !== null) {
        return executeRunStream(projectId, options);
      }
      return executeRunStreamIndependent(options);
    },
    onMutate: () => {
      setExecuteError(null);
      setLlmResponse("");
      setExecutionTrace([]);
      setStreamingStepId(null);
    },
    onSuccess: (run) => {
      setSavedRun(run);
      setExecutionTrace(run.execution_trace ?? []);
      setStreamingStepId(null);
      setStep("saved");
      void queryClient.invalidateQueries({ queryKey: ["runs-independent"] });
    },
    onError: (error) => {
      setExecuteError(error instanceof Error ? error.message : "LLM 実行に失敗しました。");
    },
  });

  const setBestMutation = useMutation({
    mutationFn: ({ runId, unset }: { runId: number; unset: boolean }) => {
      if (projectId !== null) {
        return setBestRun(projectId, runId, unset);
      }
      return setBestRunIndependent(runId, unset);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs-independent"] });
    },
  });

  const discardMutation = useMutation({
    mutationFn: (runId: number) => {
      if (projectId !== null) {
        return discardRun(projectId, runId);
      }
      return discardRunIndependent(runId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs-independent"] });
    },
  });

  const selectedVersion =
    selectedVersionId !== "" ? allVersions.find((v) => v.id === selectedVersionId) : undefined;
  const selectedTestCase =
    selectedTestCaseId !== "" ? testCases.find((tc) => tc.id === selectedTestCaseId) : undefined;

  function getVersionLabel(versionId: number): string {
    const v = allVersions.find((pv: PromptVersion) => pv.id === versionId);
    if (!v) return "v?";
    const family = promptFamilies.find((f: PromptFamily) => f.id === v.prompt_family_id);
    const familyName = family?.name ?? `Family ${v.prompt_family_id}`;
    return `${familyName} v${v.version}${v.name ? ` - ${v.name}` : ""}`;
  }

  function getVersionNumber(versionId: number): number {
    return allVersions.find((pv: PromptVersion) => pv.id === versionId)?.version ?? 0;
  }

  function getTestCaseLabel(testCaseId: number | null): string {
    if (testCaseId === null) return "かんたん実行";
    const tc = testCases.find((t: TestCase) => t.id === testCaseId);
    return tc?.title ?? "不明";
  }

  const hasProfile = selectedProfileId !== "" || executionProfiles.length > 0;
  const isStartDisabled = selectedVersionId === "" || !hasApiKey || !hasProfile;
  const isSaveDisabled =
    !llmResponse.trim() || createRunMutation.isPending || executeRunMutation.isPending;
  const isExecuteDisabled =
    selectedVersionId === "" ||
    !hasApiKey ||
    !hasProfile ||
    executeRunMutation.isPending ||
    createRunMutation.isPending;

  function handleStartRun() {
    if (isStartDisabled) return;
    setLlmResponse("");
    setExecutionTrace([]);
    setStreamingStepId(null);
    setExecuteError(null);
    setStep("input");
  }

  function handleSaveRun() {
    if (selectedVersionId === "") return;
    if (!llmResponse.trim()) return;

    const conversation: ConversationMessage[] = selectedTestCase
      ? [...selectedTestCase.turns, { role: "assistant", content: llmResponse.trim() }]
      : adHocInput.trim()
        ? [
            { role: "user", content: adHocInput.trim() },
            { role: "assistant", content: llmResponse.trim() },
          ]
        : [{ role: "assistant", content: llmResponse.trim() }];

    createRunMutation.mutate({
      prompt_version_id: selectedVersionId,
      test_case_id: selectedTestCaseId !== "" ? selectedTestCaseId : undefined,
      ad_hoc_input: adHocInput.trim() || undefined,
      conversation,
    });
  }

  function handleNewRun() {
    if (savedRun) {
      setSelectedVersionId(savedRun.prompt_version_id);
      setSelectedTestCaseId(savedRun.test_case_id ?? "");
      setAdHocInput(savedRun.ad_hoc_input ?? "");
    }
    setSavedRun(null);
    setLlmResponse("");
    setExecutionTrace([]);
    setStreamingStepId(null);
    setExecuteError(null);
    setStep("select");
  }

  function handleExecuteRun() {
    if (isExecuteDisabled) return;
    executeRunMutation.mutate({
      prompt_version_id: selectedVersionId as number,
      test_case_id: selectedTestCaseId !== "" ? (selectedTestCaseId as number) : undefined,
      ad_hoc_input: adHocInput.trim() || undefined,
    });
  }

  function handleCompareRun(run: Run) {
    if (compareRunA?.id === run.id) {
      setCompareRunA(compareRunB);
      setCompareRunB(null);
      return;
    }
    if (compareRunB?.id === run.id) {
      setCompareRunB(null);
      return;
    }
    if (!compareRunA) {
      setCompareRunA(run);
    } else if (!compareRunB) {
      setCompareRunB(run);
    } else {
      setCompareRunA(compareRunB);
      setCompareRunB(run);
    }
  }

  function handleDiscardRun(run: Run) {
    const confirmed = window.confirm(
      `この操作は元に戻せません。本当に Run #${run.id} を破棄しますか？`,
    );
    if (!confirmed) return;
    discardMutation.mutate(run.id);
  }

  return (
    <div className={`${styles.root} ${styles.page}`}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Run 実行・管理</h2>
          {project && <p className={styles.projectName}>{project.name}</p>}
        </div>
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={`${styles.tabBtn} ${activeTab === "create" ? styles.tabBtnActive : ""}`}
        >
          Run を作成
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("list")}
          className={`${styles.tabBtn} ${activeTab === "list" ? styles.tabBtnActive : ""}`}
        >
          Run 一覧
        </button>
      </div>

      <div className={styles.tabContent}>
        {/* ============ タブ: Run を作成 ============ */}
        {activeTab === "create" && (
          <div>
            {step === "select" && (
              <div className={styles.selectCard}>
                <h3 className={styles.selectCardTitle}>Run を取得する</h3>

                <div className={styles.fieldGroup}>
                  <label htmlFor="select-version" className={styles.fieldLabel}>
                    プロンプトバージョン
                  </label>
                  <select
                    id="select-version"
                    value={selectedVersionId}
                    onChange={(e) =>
                      setSelectedVersionId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className={styles.fieldSelect}
                  >
                    <option value="">
                      {allVersions.length > 0
                        ? "-- 未選択時は推奨バージョンを使用 --"
                        : "-- プロンプトがありません --"}
                    </option>
                    {allVersions.map((v: PromptVersion) => {
                      const family = promptFamilies.find(
                        (f: PromptFamily) => f.id === v.prompt_family_id,
                      );
                      return (
                        <option key={v.id} value={v.id}>
                          {family?.name ?? `Family ${v.prompt_family_id}`} v{v.version}
                          {v.name ? ` - ${v.name}` : ""}
                          {v.is_selected ? " ★" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {allVersions.length > 0 && (
                    <p className={styles.fieldHint}>
                      prompt family の選択は不要です。選択済みか最新のバージョンを既定値にします。
                    </p>
                  )}
                </div>

                <div className={styles.fieldGroupLg}>
                  <label htmlFor="select-test-case" className={styles.fieldLabel}>
                    テストケース（任意）
                  </label>
                  <select
                    id="select-test-case"
                    value={selectedTestCaseId}
                    onChange={(e) =>
                      setSelectedTestCaseId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className={styles.fieldSelect}
                  >
                    <option value="">-- 未選択なら かんたん実行 --</option>
                    {testCases.map((tc: TestCase) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.title}
                      </option>
                    ))}
                  </select>
                  {testCases.length === 0 ? (
                    <p className={styles.fieldHint}>
                      テストケースがなくても、プロンプト単体の quick run は実行できます。
                    </p>
                  ) : (
                    <p className={styles.fieldHint}>
                      未選択なら prompt-only 実行、選択すると評価 Run として実行します。
                    </p>
                  )}
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="select-profile" className={styles.fieldLabel}>
                    実行プロファイル
                  </label>
                  <select
                    id="select-profile"
                    value={selectedProfileId}
                    onChange={(e) =>
                      setSelectedProfileId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className={styles.fieldSelect}
                  >
                    <option value="">
                      {executionProfiles.length > 0
                        ? "-- 選択してください（未選択時は先頭を使用）--"
                        : "-- 実行プロファイルがありません --"}
                    </option>
                    {executionProfiles.map((p: ExecutionProfile) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.model})
                      </option>
                    ))}
                  </select>
                  {executionProfiles.length === 0 && (
                    <p className={styles.fieldHint}>
                      <Link to="/execution-profiles" className={styles.settingsLink}>
                        実行設定
                      </Link>
                      でプロファイルを作成してください。
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleStartRun}
                  disabled={isStartDisabled}
                  title={
                    !hasApiKey ? "APIキーが未設定です（実行設定画面で入力してください）" : undefined
                  }
                  className={`${styles.btnStart} ${isStartDisabled ? styles.btnStartDisabled : ""}`}
                >
                  Run の取得
                </button>
                {!hasApiKey && (
                  <p className={styles.fieldHint}>
                    APIキーが未設定です。
                    <Link to="/execution-profiles" className={styles.settingsLink}>
                      実行設定
                    </Link>
                    で API キーを入力してください。
                  </p>
                )}
              </div>
            )}

            {step === "input" && selectedVersion && (
              <div>
                <div className={styles.stepHeader}>
                  <button
                    type="button"
                    onClick={() => setStep("select")}
                    className={styles.btnSecondary}
                  >
                    ← 戻る
                  </button>
                  <span className={styles.stepLabel}>
                    v{selectedVersion.version}
                    {selectedVersion.name ? ` - ${selectedVersion.name}` : ""} ×{" "}
                    {selectedTestCase?.title ?? "かんたん実行"}
                  </span>
                </div>

                <CopyPromptPanel version={selectedVersion} testCase={selectedTestCase} />

                <div className={styles.twoColumns}>
                  <div className={styles.panel}>
                    <h3 className={styles.panelTitle}>
                      {selectedTestCase ? `テストケース: ${selectedTestCase.title}` : "かんたん実行"}
                    </h3>

                    {selectedTestCase ? (
                      <>
                        <div className={styles.chatList}>
                          {selectedTestCase.turns.map((turn, index) => (
                            <div
                              key={`turn-${
                                // biome-ignore lint/suspicious/noArrayIndexKey: ターン配列は順序で管理するため index をキーとして使用
                                index
                              }`}
                              className={`${styles.bubbleWrapper} ${turn.role === "user" ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}
                            >
                              <span className={styles.bubbleRole}>
                                {turn.role === "user" ? "User" : "Assistant"}
                              </span>
                              <div
                                className={`${styles.bubble} ${turn.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
                              >
                                {turn.content}
                              </div>
                            </div>
                          ))}
                        </div>

                        {selectedTestCase.context_content && (
                          <div className={styles.expectedBox}>
                            <p className={styles.expectedLabel}>コンテキスト</p>
                            <p className={styles.expectedText}>{selectedTestCase.context_content}</p>
                          </div>
                        )}

                        {selectedTestCase.expected_description && (
                          <div className={styles.expectedBox}>
                            <p className={styles.expectedLabel}>期待される応答の説明</p>
                            <p className={styles.expectedText}>
                              {selectedTestCase.expected_description}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className={styles.inputDescription}>
                          テストケース未選択のため quick run です。必要ならユーザー入力を1件だけ付けて実行できます。
                        </p>
                        <div className={styles.fieldGroupLg}>
                          <label htmlFor="ad-hoc-input" className={styles.fieldLabel}>
                            任意入力
                          </label>
                          <textarea
                            id="ad-hoc-input"
                            value={adHocInput}
                            onChange={(e) => setAdHocInput(e.target.value)}
                            placeholder="未入力ならプロンプト単体で実行します。"
                            className={styles.responseTextarea}
                            rows={8}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`${styles.panel} ${styles.panelFlex}`}>
                    <h3 className={styles.panelSubtitle}>LLM 応答</h3>
                    <p className={styles.inputDescription}>
                      {selectedVersion.workflow_definition?.steps.length
                        ? "実行するとプロンプト本文を Step 1 として実行し、その後に追加ステップを順番に走らせます。"
                        : "実行すると応答をストリーミング表示し、完了後に Run として保存します。"}
                    </p>

                    <div className={styles.inputActionsTop}>
                      <button
                        type="button"
                        onClick={handleExecuteRun}
                        disabled={isExecuteDisabled}
                        className={`${styles.btnLlmRun} ${isExecuteDisabled ? styles.btnLlmRunDisabled : ""}`}
                      >
                        {executeRunMutation.isPending ? "実行中..." : "実行"}
                      </button>
                      {executeError && <p className={styles.errorMsgTop}>{executeError}</p>}
                    </div>

                    <textarea
                      value={llmResponse}
                      onChange={(e) => setLlmResponse(e.target.value)}
                      placeholder="実行結果がここに表示されます。手動入力して保存することもできます。"
                      className={styles.responseTextarea}
                      readOnly={executeRunMutation.isPending}
                    />

                    {executionTrace.length > 0 && (
                      <div className={styles.traceBlock}>
                        <h4 className={styles.traceBlockTitle}>ステップ実行結果</h4>
                        <ExecutionTraceView
                          trace={executionTrace}
                          streamingStepId={streamingStepId}
                        />
                      </div>
                    )}

                    <div className={styles.inputActions}>
                      <button
                        type="button"
                        onClick={handleSaveRun}
                        disabled={isSaveDisabled}
                        className={`${styles.btnSave} ${isSaveDisabled ? styles.btnSaveDisabled : ""}`}
                      >
                        {createRunMutation.isPending ? "保存中..." : "Run を保存"}
                      </button>
                    </div>
                    {createRunMutation.isError && (
                      <p className={styles.errorMsg}>
                        保存に失敗しました。もう一度お試しください。
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === "saved" && savedRun && selectedVersion && (
              <div>
                <div className={styles.successBanner}>Run を保存しました（ID: {savedRun.id}）</div>

                <div className={styles.savedActions}>
                  <button type="button" onClick={handleNewRun} className={styles.btnPrimary}>
                    新しい Run を作成
                  </button>
                </div>

                <div className={styles.savedPanel}>
                  <h3 className={styles.panelTitle}>保存した Run の内容</h3>
                  <p className={styles.savedMeta}>
                    v{selectedVersion.version}
                    {selectedVersion.name ? ` - ${selectedVersion.name}` : ""} ×{" "}
                    {getTestCaseLabel(savedRun.test_case_id)} · {formatDate(savedRun.created_at)}
                  </p>
                  <div className={`${styles.chatList} ${styles.chatListStatic}`}>
                    {savedRun.conversation.map((msg, index) => (
                      <div
                        key={`msg-${
                          // biome-ignore lint/suspicious/noArrayIndexKey: 会話配列は順序で管理するため index をキーとして使用
                          index
                        }`}
                        className={`${styles.bubbleWrapper} ${msg.role === "user" ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}
                      >
                        <span className={styles.bubbleRole}>
                          {msg.role === "user" ? "User" : "Assistant"}
                        </span>
                        <div
                          className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  {savedRun.execution_trace?.length ? (
                    <div className={styles.traceBlock}>
                      <h4 className={styles.traceBlockTitle}>保存されたステップ結果</h4>
                      <ExecutionTraceView trace={savedRun.execution_trace} />
                    </div>
                  ) : null}
                </div>

                <div className={styles.savedPanel}>
                  <h3 className={styles.panelTitle}>過去の Run 一覧</h3>
                  {relatedRuns.length === 0 ? (
                    <p className={styles.emptyRuns}>まだ Run がありません。</p>
                  ) : (
                    <div className={styles.runList}>
                      {relatedRuns.map((run) => (
                        <RunCard
                          key={run.id}
                          run={run}
                          projectId={projectId}
                          scorePath={scorePath}
                          versionLabel={getVersionLabel(run.prompt_version_id)}
                          versionNumber={getVersionNumber(run.prompt_version_id)}
                          testCaseLabel={getTestCaseLabel(run.test_case_id)}
                          annotationTasks={annotationTasks}
                          onSetBest={(unset) => setBestMutation.mutate({ runId: run.id, unset })}
                          isBestPending={setBestMutation.isPending}
                          onDiscard={() => handleDiscardRun(run)}
                          isDiscardPending={discardMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ タブ: Run 一覧 ============ */}
        {activeTab === "list" && (
          <div>
            <RunCompareBar
              compareRunA={compareRunA}
              compareRunB={compareRunB}
              getVersionLabel={getVersionLabel}
              onOpenCompare={() => setIsCompareOpen(true)}
              onClearFirst={() => setCompareRunA(null)}
              onClearAll={() => {
                setCompareRunA(null);
                setCompareRunB(null);
              }}
            />

            <div className={styles.filterBar}>
              <div className={styles.filterField}>
                <label htmlFor="filter-version" className={styles.filterLabel}>
                  バージョン
                </label>
                <select
                  id="filter-version"
                  value={filterVersionId}
                  onChange={(e) =>
                    setFilterVersionId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={styles.filterSelect}
                >
                  <option value="">すべて</option>
                  {allVersions.map((v: PromptVersion) => {
                    const family = promptFamilies.find(
                      (f: PromptFamily) => f.id === v.prompt_family_id,
                    );
                    return (
                      <option key={v.id} value={v.id}>
                        {family?.name ?? `Family ${v.prompt_family_id}`} v{v.version}
                        {v.name ? ` - ${v.name}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className={styles.filterField}>
                <label htmlFor="filter-test-case" className={styles.filterLabel}>
                  テストケース
                </label>
                <select
                  id="filter-test-case"
                  value={filterTestCaseId}
                  onChange={(e) =>
                    setFilterTestCaseId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={styles.filterSelect}
                >
                  <option value="">すべて</option>
                  {testCases.map((tc: TestCase) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.title}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFilterVersionId("");
                  setFilterTestCaseId("");
                }}
                className={styles.btnClearFilter}
              >
                クリア
              </button>
            </div>

            {isRunsLoading ? (
              <p className={styles.loadingMsg}>読み込み中...</p>
            ) : allRuns.length === 0 ? (
              <p className={styles.emptyRuns}>
                {filterVersionId !== "" || filterTestCaseId !== ""
                  ? "条件に一致する Run がありません。"
                  : "まだ Run がありません。「Run を作成」タブから実行してください。"}
              </p>
            ) : (
              <div className={styles.runList}>
                {allRuns.map((run) => (
                  <RunCard
                    key={run.id}
                    run={run}
                    projectId={projectId}
                    scorePath={scorePath}
                    versionLabel={getVersionLabel(run.prompt_version_id)}
                    versionNumber={getVersionNumber(run.prompt_version_id)}
                    testCaseLabel={getTestCaseLabel(run.test_case_id)}
                    annotationTasks={annotationTasks}
                    onSetBest={(unset) => setBestMutation.mutate({ runId: run.id, unset })}
                    isBestPending={setBestMutation.isPending}
                    onDiscard={() => handleDiscardRun(run)}
                    isDiscardPending={discardMutation.isPending}
                    onCompare={() => handleCompareRun(run)}
                    isCompareSelected={compareRunA?.id === run.id || compareRunB?.id === run.id}
                  />
                ))}
              </div>
            )}

            <RunCompareBar
              compareRunA={compareRunA}
              compareRunB={compareRunB}
              getVersionLabel={getVersionLabel}
              onOpenCompare={() => setIsCompareOpen(true)}
              onClearFirst={() => setCompareRunA(null)}
              onClearAll={() => {
                setCompareRunA(null);
                setCompareRunB(null);
              }}
              className={styles.compareBarBottom}
            />
          </div>
        )}
      </div>

      {isCompareOpen && compareRunA && compareRunB && (
        <RunCompareView
          runA={compareRunA}
          runB={compareRunB}
          versionLabelA={getVersionLabel(compareRunA.prompt_version_id)}
          versionLabelB={getVersionLabel(compareRunB.prompt_version_id)}
          onClose={() => setIsCompareOpen(false)}
        />
      )}
    </div>
  );
}
