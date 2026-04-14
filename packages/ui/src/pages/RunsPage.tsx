import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  type ConversationMessage,
  type PromptVersion,
  type Run,
  type TestCase,
  createRun,
  getProject,
  getPromptVersions,
  getRuns,
  getTestCases,
  setBestRun,
} from "../lib/api";
import styles from "./RunsPage.module.css";

function diffLines(a: string, b: string): { type: "same" | "removed" | "added"; text: string }[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const result: { type: "same" | "removed" | "added"; text: string }[] = [];

  const maxLen = Math.max(aLines.length, bLines.length);
  let ai = 0;
  let bi = 0;

  while (ai < aLines.length || bi < bLines.length) {
    if (ai < aLines.length && bi < bLines.length && aLines[ai] === bLines[bi]) {
      result.push({ type: "same", text: aLines[ai] });
      ai++;
      bi++;
    } else {
      const aRemainder = aLines.slice(ai);
      const bRemainder = bLines.slice(bi);

      let foundInA = -1;
      let foundInB = -1;
      const lookAhead = Math.min(5, maxLen);

      for (let d = 0; d < lookAhead; d++) {
        if (d < bRemainder.length && aRemainder.slice(0, lookAhead).includes(bRemainder[d])) {
          foundInB = d;
          foundInA = aRemainder.indexOf(bRemainder[d]);
          break;
        }
        if (d < aRemainder.length && bRemainder.slice(0, lookAhead).includes(aRemainder[d])) {
          foundInA = d;
          foundInB = bRemainder.indexOf(aRemainder[d]);
          break;
        }
      }

      if (foundInA > 0) {
        for (let i = 0; i < foundInA; i++) {
          result.push({ type: "removed", text: aRemainder[i] });
        }
        ai += foundInA;
      } else if (foundInB > 0) {
        for (let i = 0; i < foundInB; i++) {
          result.push({ type: "added", text: bRemainder[i] });
        }
        bi += foundInB;
      } else {
        if (ai < aLines.length) {
          result.push({ type: "removed", text: aLines[ai] });
          ai++;
        }
        if (bi < bLines.length) {
          result.push({ type: "added", text: bLines[bi] });
          bi++;
        }
      }
    }
  }

  return result;
}

type RunCompareViewProps = {
  runA: Run;
  runB: Run;
  versionLabelA: string;
  versionLabelB: string;
  onClose: () => void;
};

function RunCompareView({ runA, runB, versionLabelA, versionLabelB, onClose }: RunCompareViewProps) {
  const [mode, setMode] = useState<"side-by-side" | "unified">("side-by-side");

  const lastAssistantA =
    [...runA.conversation].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const lastAssistantB =
    [...runB.conversation].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const diff = diffLines(lastAssistantA, lastAssistantB);

  return (
    <div
      className={styles.compareOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.compareBox}>
        <div className={styles.compareHeader}>
          <h3 className={styles.compareHeaderTitle}>Run 比較</h3>
          <div className={styles.compareHeaderActions}>
            <div className={styles.compareModeToggle}>
              {(["side-by-side", "unified"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`${styles.btnMode} ${mode === m ? styles.btnModeActive : styles.btnModeInactive}`}
                >
                  {m === "side-by-side" ? "並列" : "差分"}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className={styles.btnCloseCompare}>
              閉じる
            </button>
          </div>
        </div>

        <div className={styles.compareContent}>
          {mode === "side-by-side" ? (
            <div className={styles.sideBySide}>
              <div className={`${styles.comparePanel} ${styles.comparePanelLeft}`}>
                <div className={`${styles.comparePanelHeader} ${styles.comparePanelHeaderA}`}>
                  <span>Run #{runA.id}</span>
                  <span className={styles.comparePanelMeta}>{versionLabelA}</span>
                </div>
                <div className={styles.compareChatList}>
                  {runA.conversation.map((msg, i) => (
                    <div
                      key={`a-msg-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: 会話配列は順序で管理
                        i
                      }`}
                      className={`${styles.bubbleWrapper} ${msg.role === "user" ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}
                    >
                      <span className={styles.bubbleRole}>{msg.role === "user" ? "User" : "Assistant"}</span>
                      <div className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.comparePanel}>
                <div className={`${styles.comparePanelHeader} ${styles.comparePanelHeaderB}`}>
                  <span>Run #{runB.id}</span>
                  <span className={styles.comparePanelMeta}>{versionLabelB}</span>
                </div>
                <div className={styles.compareChatList}>
                  {runB.conversation.map((msg, i) => (
                    <div
                      key={`b-msg-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: 会話配列は順序で管理
                        i
                      }`}
                      className={`${styles.bubbleWrapper} ${msg.role === "user" ? styles.bubbleWrapperUser : styles.bubbleWrapperAssistant}`}
                    >
                      <span className={styles.bubbleRole}>{msg.role === "user" ? "User" : "Assistant"}</span>
                      <div className={`${styles.bubble} ${msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.unifiedView}>
              <div className={styles.unifiedHeader}>
                <span className={styles.unifiedLabelA}>ー Run #{runA.id}</span>
                <span className={styles.unifiedLabelB}>+ Run #{runB.id}</span>
              </div>
              <div className={styles.diffScroll}>
                {diff.map((line, i) => (
                  <div
                    key={`diff-${line.type}-${i}`}
                    className={`${styles.diffLine} ${
                      line.type === "removed"
                        ? styles.diffLineRemoved
                        : line.type === "added"
                          ? styles.diffLineAdded
                          : ""
                    }`}
                  >
                    <span className={styles.diffGutter}>
                      {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                    </span>
                    <span className={styles.diffText}>{line.text || "\u00a0"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildFullPrompt(version: PromptVersion, testCase: TestCase): string {
  const systemPrompt = testCase.context_content
    ? version.content.includes("{{context}}")
      ? version.content.replace("{{context}}", testCase.context_content)
      : `${version.content}\n\n${testCase.context_content}`
    : version.content;

  const turnsText = testCase.turns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  return turnsText
    ? `${systemPrompt}\n\n[Conversation]\n${turnsText}`
    : systemPrompt;
}

function CopyPromptPanel({
  version,
  testCase,
}: {
  version: PromptVersion;
  testCase: TestCase;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const fullPrompt = buildFullPrompt(version, testCase);

  function handleCopy() {
    navigator.clipboard.writeText(fullPrompt).then(() => {
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
          {open ? "▲ プロンプト全文を閉じる" : "▼ プロンプト全文を表示"}
        </button>
        <button type="button" onClick={handleCopy} className={styles.btnCopy}>
          {copied ? "✓ コピー済み" : "コピー"}
        </button>
      </div>
      {open && (
        <textarea
          readOnly
          value={fullPrompt}
          className={styles.copyPromptTextarea}
          rows={12}
        />
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

// アコーディオン形式の会話表示コンポーネント
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

// Run一覧カードコンポーネント
function RunCard({
  run,
  projectId,
  versionLabel,
  testCaseLabel,
  onSetBest,
  isBestPending,
  onCompare,
  isCompareSelected,
}: {
  run: Run;
  projectId: number;
  versionLabel: string;
  testCaseLabel: string;
  onSetBest: () => void;
  isBestPending: boolean;
  onCompare?: () => void;
  isCompareSelected?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${styles.runCard} ${run.is_best ? styles.runCardBest : ""} ${isCompareSelected ? styles.runCardCompareSelected : ""}`}>
      <div className={styles.runCardTop}>
        <div className={styles.runCardHeader}>
          <span className={styles.runId}>Run #{run.id}</span>
          {run.is_best && <span className={styles.badgeBest}>ベスト回答</span>}
          <span className={styles.runMeta}>
            {versionLabel} &times; {testCaseLabel}
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
            {expanded ? "▲ 折りたたむ" : "▼ 会話を表示"}
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
          <Link
            to={`/projects/${projectId}/score`}
            className={styles.btnScore}
          >
            採点
          </Link>
          <button
            type="button"
            onClick={onSetBest}
            disabled={isBestPending || run.is_best}
            className={`${styles.btnBest} ${run.is_best ? styles.btnBestActive : styles.btnBestInactive}`}
          >
            {run.is_best ? "ベスト済み" : "ベストに設定"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.runConversation}>
          <RunConversation conversation={run.conversation} />
        </div>
      )}
    </div>
  );
}

export function RunsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<PageTab>("create");

  // 「Run 作成」タブの状態
  const [step, setStep] = useState<Step>("select");
  const [selectedVersionId, setSelectedVersionId] = useState<number | "">("");
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<number | "">("");
  const [llmResponse, setLlmResponse] = useState("");
  const [savedRun, setSavedRun] = useState<Run | null>(null);

  // 「Run 一覧」タブのフィルター状態
  const [filterVersionId, setFilterVersionId] = useState<number | "">("");
  const [filterTestCaseId, setFilterTestCaseId] = useState<number | "">("");

  // 「Run 一覧」タブの比較状態
  const [compareRunA, setCompareRunA] = useState<Run | null>(null);
  const [compareRunB, setCompareRunB] = useState<Run | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

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

  // Run 作成タブ: savedステップ時に同一バージョン×ケースのRunを取得
  const { data: relatedRuns = [] } = useQuery({
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

  // Run 一覧タブ: フィルター付きで全Runを取得
  const { data: allRuns = [], isLoading: isRunsLoading } = useQuery({
    queryKey: [
      "runs",
      projectId,
      { prompt_version_id: filterVersionId, test_case_id: filterTestCaseId },
    ],
    queryFn: () =>
      getRuns(projectId, {
        prompt_version_id: filterVersionId !== "" ? filterVersionId : undefined,
        test_case_id: filterTestCaseId !== "" ? filterTestCaseId : undefined,
      }),
    enabled: activeTab === "list" && !Number.isNaN(projectId),
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

  function getVersionLabel(versionId: number): string {
    const v = promptVersions.find((pv) => pv.id === versionId);
    if (!v) return "v?";
    return `v${v.version}${v.name ? ` - ${v.name}` : ""}`;
  }

  function getTestCaseLabel(testCaseId: number): string {
    const tc = testCases.find((t) => t.id === testCaseId);
    return tc?.title ?? "不明";
  }

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
      // 3つ目を選択した場合はAを置き換え
      setCompareRunA(compareRunB);
      setCompareRunB(run);
    }
  }

  const isStartDisabled = selectedVersionId === "" || selectedTestCaseId === "";
  const isSaveDisabled = !llmResponse.trim() || createRunMutation.isPending;

  return (
    <div className={`${styles.root} ${styles.page}`}>
      {/* ヘッダー */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Run 実行・管理</h2>
          {project && <p className={styles.projectName}>{project.name}</p>}
        </div>
      </div>

      {/* タブ */}
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

      {/* ============ タブ: Run を作成 ============ */}
      {activeTab === "create" && (
        <div>
          {/* Step 1: 選択フォーム */}
          {step === "select" && (
            <div className={styles.selectCard}>
              <h3 className={styles.selectCardTitle}>Run を開始する</h3>

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
                  <option value="">-- 選択してください --</option>
                  {promptVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                      {v.name ? ` - ${v.name}` : ""}
                    </option>
                  ))}
                </select>
                {promptVersions.length === 0 && (
                  <p className={styles.fieldHint}>
                    プロンプトバージョンがありません。先にバージョンを作成してください。
                  </p>
                )}
              </div>

              <div className={styles.fieldGroupLg}>
                <label htmlFor="select-test-case" className={styles.fieldLabel}>
                  テストケース
                </label>
                <select
                  id="select-test-case"
                  value={selectedTestCaseId}
                  onChange={(e) =>
                    setSelectedTestCaseId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className={styles.fieldSelect}
                >
                  <option value="">-- 選択してください --</option>
                  {testCases.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.title}
                    </option>
                  ))}
                </select>
                {testCases.length === 0 && (
                  <p className={styles.fieldHint}>
                    テストケースがありません。先にテストケースを作成してください。
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartRun}
                disabled={isStartDisabled}
                className={`${styles.btnStart} ${isStartDisabled ? styles.btnStartDisabled : ""}`}
              >
                Run を開始
              </button>
            </div>
          )}

          {/* Step 2: Run 実行UI */}
          {step === "input" && selectedVersion && selectedTestCase && (
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
                  {selectedTestCase.title}
                </span>
              </div>

              <CopyPromptPanel version={selectedVersion} testCase={selectedTestCase} />

              <div className={styles.twoColumns}>
                {/* 左カラム: テストケース表示 */}
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>テストケース: {selectedTestCase.title}</h3>

                  {/* 会話ターン表示 */}
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

                  {/* 期待される説明 */}
                  {selectedTestCase.expected_description && (
                    <div className={styles.expectedBox}>
                      <p className={styles.expectedLabel}>期待される応答の説明</p>
                      <p className={styles.expectedText}>{selectedTestCase.expected_description}</p>
                    </div>
                  )}
                </div>

                {/* 右カラム: 手動入力エリア */}
                <div className={`${styles.panel} ${styles.panelFlex}`}>
                  <h3 className={styles.panelSubtitle}>LLM 応答の入力</h3>
                  <p className={styles.inputDescription}>LLM 応答を手動で入力してください</p>

                  <textarea
                    value={llmResponse}
                    onChange={(e) => setLlmResponse(e.target.value)}
                    placeholder="LLM の応答をここにペーストまたは入力してください..."
                    className={styles.responseTextarea}
                  />

                  <div className={styles.inputActions}>
                    <button
                      type="button"
                      onClick={handleSaveRun}
                      disabled={isSaveDisabled}
                      className={`${styles.btnSave} ${isSaveDisabled ? styles.btnSaveDisabled : ""}`}
                    >
                      {createRunMutation.isPending ? "保存中..." : "Run を保存"}
                    </button>

                    {/* TODO: Phase 2 - LLM実行ボタン */}
                    <button
                      type="button"
                      disabled
                      title="Phase 2 で実装予定"
                      className={styles.btnLlmRun}
                    >
                      LLM 実行（Phase 2）
                    </button>
                  </div>

                  {createRunMutation.isError && (
                    <p className={styles.errorMsg}>保存に失敗しました。もう一度お試しください。</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 保存後の表示 */}
          {step === "saved" && savedRun && selectedVersion && selectedTestCase && (
            <div>
              <div className={styles.successBanner}>Run を保存しました（ID: {savedRun.id}）</div>

              <div className={styles.savedActions}>
                <button type="button" onClick={handleNewRun} className={styles.btnPrimary}>
                  新しい Run を作成
                </button>
              </div>

              {/* 保存したRunの内容 */}
              <div className={styles.savedPanel}>
                <h3 className={styles.panelTitle}>保存した Run の内容</h3>
                <p className={styles.savedMeta}>
                  v{selectedVersion.version}
                  {selectedVersion.name ? ` - ${selectedVersion.name}` : ""} ×{" "}
                  {selectedTestCase.title} · {formatDate(savedRun.created_at)}
                </p>
                <div className={styles.chatList}>
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
              </div>

              {/* 同一バージョン×ケースの過去Run一覧 */}
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
                        versionLabel={getVersionLabel(run.prompt_version_id)}
                        testCaseLabel={getTestCaseLabel(run.test_case_id)}
                        onSetBest={() => setBestMutation.mutate(run.id)}
                        isBestPending={setBestMutation.isPending}
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
          {/* 比較バー */}
          {(compareRunA || compareRunB) && (
            <div className={styles.compareBar}>
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
                  <button
                    type="button"
                    onClick={() => setIsCompareOpen(true)}
                    className={styles.btnOpenCompare}
                  >
                    比較を表示
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCompareRunA(null); setCompareRunB(null); }}
                    className={styles.btnClearCompare}
                  >
                    クリア
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.compareBarHint}>
                    もう1つ「比較」をクリックしてください
                  </span>
                  <button
                    type="button"
                    onClick={() => setCompareRunA(null)}
                    className={styles.btnClearCompare}
                  >
                    クリア
                  </button>
                </>
              )}
            </div>
          )}

          {/* フィルターバー */}
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
                {promptVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version}
                    {v.name ? ` - ${v.name}` : ""}
                  </option>
                ))}
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
                {testCases.map((tc) => (
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

          {/* Run 一覧 */}
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
                  versionLabel={getVersionLabel(run.prompt_version_id)}
                  testCaseLabel={getTestCaseLabel(run.test_case_id)}
                  onSetBest={() => setBestMutation.mutate(run.id)}
                  isBestPending={setBestMutation.isPending}
                  onCompare={() => handleCompareRun(run)}
                  isCompareSelected={compareRunA?.id === run.id || compareRunB?.id === run.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 比較ビュー */}
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
