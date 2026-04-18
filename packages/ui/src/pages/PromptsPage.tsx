import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  type PromptExecutionStepDefinition,
  type PromptVersion,
  branchPromptVersion,
  createPromptVersion,
  getProject,
  getPromptVersions,
  setSelectedVersion,
  updatePromptVersion,
} from "../lib/api";
import styles from "./PromptsPage.module.css";

const workflowStepIdPattern = /^[A-Za-z0-9_-]+$/;
const reservedWorkflowStepId = "__base_prompt__";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// バージョンツリーのノード型
type VersionTreeNode = {
  version: PromptVersion;
  children: VersionTreeNode[];
  depth: number;
};

function buildVersionTree(versions: PromptVersion[]): VersionTreeNode[] {
  const map = new Map<number, VersionTreeNode>();
  const roots: VersionTreeNode[] = [];

  // まずノードマップを作成
  for (const v of versions) {
    map.set(v.id, { version: v, children: [], depth: 0 });
  }

  // 親子関係を構築
  for (const v of versions) {
    const node = map.get(v.id);
    if (!node) continue;
    if (v.parent_version_id !== null) {
      const parent = map.get(v.parent_version_id);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // depthを計算
  function setDepth(node: VersionTreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  // versionでソート
  roots.sort((a, b) => a.version.version - b.version.version);
  function sortChildren(node: VersionTreeNode) {
    node.children.sort((a, b) => a.version.version - b.version.version);
    for (const child of node.children) {
      sortChildren(child);
    }
  }
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}

// ツリーをフラットリストに変換（表示順序）
function flattenTree(nodes: VersionTreeNode[]): VersionTreeNode[] {
  const result: VersionTreeNode[] = [];
  function traverse(node: VersionTreeNode) {
    result.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  }
  for (const node of nodes) {
    traverse(node);
  }
  return result;
}

function createWorkflowStep(): PromptExecutionStepDefinition {
  return {
    id: `step_${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    prompt: "",
  };
}

function getWorkflowValidationMessage(steps: PromptExecutionStepDefinition[]): string | null {
  const seenIds = new Set<string>();

  for (const step of steps) {
    const trimmedId = step.id.trim();
    if (!trimmedId || !step.prompt.trim()) {
      return "各ステップのIDとプロンプトを入力してください。";
    }

    if (!workflowStepIdPattern.test(trimmedId)) {
      return "ステップIDは半角英数字、_、- のみ使用できます。";
    }

    if (trimmedId === reservedWorkflowStepId) {
      return "__base_prompt__ は予約済みのため使用できません。";
    }

    if (seenIds.has(trimmedId)) {
      return "ステップIDは重複できません。";
    }

    seenIds.add(trimmedId);
  }

  return null;
}

// Determine whether to draw a vertical line at depth d for each node

function computeVerticalLines(flatNodes: VersionTreeNode[]): boolean[][] {
  const result: boolean[][] = flatNodes.map(() => []);
  const maxDepth = Math.max(...flatNodes.map((n) => n.depth), 0);

  for (let d = 0; d <= maxDepth; d++) {
    for (let i = 0; i < flatNodes.length; i++) {
      const node = flatNodes[i];
      if (!node) continue;
      if (node.depth >= d) {
        if (node.depth === d) {
          // biome-ignore lint/style/noNonNullAssertion: result[i] is always initialized above
          result[i]![d] = false;
        } else {
          let showLine = false;
          for (let j = i + 1; j < flatNodes.length; j++) {
            const jNode = flatNodes[j];
            if (!jNode) break;
            if (jNode.depth < d) break;
            if (jNode.depth === d) {
              showLine = true;
              break;
            }
          }
          // biome-ignore lint/style/noNonNullAssertion: result[i] is always initialized above
          result[i]![d] = showLine;
        }
      } else {
        // biome-ignore lint/style/noNonNullAssertion: result[i] is always initialized above
        result[i]![d] = false;
      }
    }
  }

  return result;
}

type VersionTreeItemProps = {
  node: VersionTreeNode;
  isSelected: boolean;
  isComparing: boolean;
  onSelect: (v: PromptVersion) => void;
  onBranch: (v: PromptVersion) => void;
  onCompare: (v: PromptVersion) => void;
  verticalLines: boolean[];
};

function VersionTreeItem({
  node,
  isSelected,
  isComparing,
  onSelect,
  onBranch,
  onCompare,
  verticalLines: _verticalLines,
}: VersionTreeItemProps) {
  const { version } = node;
  const depth = node.depth;

  return (
    <div className={styles.treeItem} style={{ paddingLeft: `${depth * 20}px` }}>
      {/* 接続線（分岐ノードのみ） */}
      {depth > 0 && (
        <div className={styles.treeConnector}>
          <div className={styles.treeConnectorH} />
          <div className={styles.treeConnectorV} />
        </div>
      )}

      {/* バージョンカード */}
      <button
        type="button"
        onClick={() => onSelect(version)}
        className={`${styles.treeCard} ${isSelected ? styles.treeCardSelected : ""} ${isComparing ? styles.treeCardComparing : ""}`}
      >
        <span
          className={`${styles.treeVersionNum} ${isSelected ? styles.treeVersionNumSelected : ""}`}
        >
          v{version.version}
        </span>
        <span className={styles.treeVersionName}>
          {version.name ?? `バージョン ${version.version}`}
        </span>
        {version.parent_version_id !== null && <span className={styles.badgeBranch}>分岐</span>}
        <div
          className={styles.treeCardActions}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onCompare(version)}
            title="比較"
            className={`${styles.btnTreeAction} ${isComparing ? styles.btnTreeCompareActive : ""}`}
          >
            比較
          </button>
          <button
            type="button"
            onClick={() => onBranch(version)}
            title="分岐"
            className={`${styles.btnTreeAction} ${styles.btnTreeBranch}`}
          >
            分岐
          </button>
        </div>
      </button>
    </div>
  );
}

type PromptEditorProps = {
  version: PromptVersion | null;
  projectId: number;
  isNew?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

function PromptEditor({ version, projectId, isNew = false, onSave, onCancel }: PromptEditorProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(version?.name ?? "");
  const [memo, setMemo] = useState(version?.memo ?? "");
  const [content, setContent] = useState(version?.content ?? "");
  const [workflowSteps, setWorkflowSteps] = useState<PromptExecutionStepDefinition[]>(
    version?.workflow_definition?.steps ?? [],
  );

  const createMutation = useMutation({
    mutationFn: (data: {
      content: string;
      name?: string;
      memo?: string;
      workflow_definition?: { steps: PromptExecutionStepDefinition[] };
    }) =>
      createPromptVersion(projectId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      onSave();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      content?: string;
      name?: string | null;
      memo?: string | null;
      workflow_definition?: { steps: PromptExecutionStepDefinition[] } | null;
    }) => {
      if (!version) throw new Error("version is required for update");
      return updatePromptVersion(projectId, version.id, data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      onSave();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const workflowValidationMessage = getWorkflowValidationMessage(workflowSteps);
  const isDisabled = !content.trim() || isPending || workflowValidationMessage !== null;

  function buildWorkflowDefinition() {
    const steps = workflowSteps
      .map((step, index) => ({
        id: step.id.trim(),
        title: step.title.trim() || `ステップ ${index + 2}`,
        prompt: step.prompt.trim(),
      }))
      .filter((step) => step.id && step.prompt);

    return steps.length > 0 ? { steps } : undefined;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    if (isNew) {
      createMutation.mutate({
        content: content.trim(),
        name: name.trim() || undefined,
        memo: memo.trim() || undefined,
        workflow_definition: buildWorkflowDefinition(),
      });
    } else {
      updateMutation.mutate({
        content: content.trim(),
        name: name.trim() || null,
        memo: memo.trim() || null,
        workflow_definition: buildWorkflowDefinition() ?? null,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.editorForm}>
      <div>
        <label htmlFor="editor-name" className={styles.fieldLabel}>
          {isNew || version?.parent_version_id === null ? "プロンプト名（任意）" : "バージョン名（任意）"}
        </label>
        <input
          id="editor-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            isNew || version?.parent_version_id === null
              ? "未入力なら自動で名前を付けます"
              : "例: 丁寧語対応版"
          }
          className={styles.fieldInput}
        />
      </div>
      <div>
        <label htmlFor="editor-memo" className={styles.fieldLabel}>
          メモ（任意）
        </label>
        <input
          id="editor-memo"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="変更内容や目的を記入..."
          className={styles.fieldInput}
        />
      </div>
      <div className={styles.fieldTextareaWrapper}>
        <label htmlFor="editor-content" className={styles.fieldLabel}>
          プロンプト本文（Step 1）
          <span className={styles.requiredMark}>*</span>
        </label>
        <textarea
          id="editor-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="システムプロンプトを入力..."
          className={styles.fieldTextarea}
        />
      </div>
      <div className={styles.workflowSection}>
        <div className={styles.workflowHeader}>
          <div>
            <label className={styles.fieldLabel}>追加ステップ（Step 2 以降）</label>
            <p className={styles.workflowHint}>
              各ステップで `{"{{conversation}}"}`、`{"{{context}}"}`、`{"{{previous_output}}"}`、
              `{"{{step:step_id}}"}` を利用できます。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowSteps((prev) => [...prev, createWorkflowStep()])}
            className={styles.btnWorkflowAdd}
          >
            + ステップ追加
          </button>
        </div>
        {workflowSteps.length === 0 ? (
          <div className={styles.workflowEmpty}>
            追加ステップ未設定の場合は、プロンプト本文（Step 1）のみを実行します。
          </div>
        ) : (
          <div className={styles.workflowList}>
            {workflowSteps.map((step, index) => (
              <div key={step.id || `workflow-step-${index}`} className={styles.workflowCard}>
                <div className={styles.workflowCardHeader}>
                  <span className={styles.workflowCardTitle}>ステップ {index + 2}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setWorkflowSteps((prev) => prev.filter((_, current) => current !== index))
                    }
                    className={styles.btnWorkflowRemove}
                  >
                    削除
                  </button>
                </div>
                <div className={styles.workflowFields}>
                  <input
                    type="text"
                    value={step.id}
                    onChange={(e) =>
                      setWorkflowSteps((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, id: e.target.value } : current,
                        ),
                      )
                    }
                    placeholder="step_id"
                    className={styles.fieldInput}
                  />
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) =>
                      setWorkflowSteps((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index
                            ? { ...current, title: e.target.value }
                            : current,
                        ),
                      )
                    }
                    placeholder={`表示名（未入力なら ステップ ${index + 2}）`}
                    className={styles.fieldInput}
                  />
                </div>
                <textarea
                  value={step.prompt}
                  onChange={(e) =>
                    setWorkflowSteps((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, prompt: e.target.value }
                          : current,
                      ),
                    )
                  }
                  placeholder="各ステップで実行するプロンプト"
                  className={styles.workflowTextarea}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {workflowValidationMessage && <p className={styles.errorMsg}>{workflowValidationMessage}</p>}
      <div className={styles.formActions}>
        <button type="button" onClick={onCancel} className={styles.btnCancel}>
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isDisabled}
          className={`${styles.btnSave} ${isDisabled ? styles.btnDisabled : ""}`}
        >
          {isPending ? "保存中..." : isNew ? "作成" : "保存"}
        </button>
      </div>
      {(createMutation.isError || updateMutation.isError) && (
        <p className={styles.errorMsg}>保存に失敗しました。再度お試しください。</p>
      )}
    </form>
  );
}

type BranchModalProps = {
  parentVersion: PromptVersion;
  projectId: number;
  onClose: () => void;
  onCreated: (newVersion: PromptVersion) => void;
};

function BranchModal({ parentVersion, projectId, onClose, onCreated }: BranchModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  const branchMutation = useMutation({
    mutationFn: (data: { name?: string; memo?: string }) =>
      branchPromptVersion(projectId, parentVersion.id, data),
    onSuccess: (newVersion) => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      onCreated(newVersion);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    branchMutation.mutate({
      name: name.trim() || undefined,
      memo: memo.trim() || undefined,
    });
  }

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
        <h3 className={styles.modalTitle}>バージョンを分岐</h3>
        <p className={styles.modalSubtext}>
          v{parentVersion.version}「{parentVersion.name ?? `バージョン ${parentVersion.version}`}
          」から分岐します
        </p>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div>
            <label htmlFor="branch-name" className={styles.fieldLabel}>
              新しいバージョン名（任意）
            </label>
            <input
              id="branch-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 別アプローチ版"
              className={styles.fieldInput}
            />
          </div>
          <div>
            <label htmlFor="branch-memo" className={styles.fieldLabel}>
              メモ（任意）
            </label>
            <input
              id="branch-memo"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="分岐の目的や変更予定..."
              className={styles.fieldInput}
            />
          </div>
          {branchMutation.isError && <p className={styles.errorMsg}>分岐の作成に失敗しました。</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={branchMutation.isPending}
              className={`${styles.btnBranchSubmit} ${branchMutation.isPending ? styles.btnDisabled : ""}`}
            >
              {branchMutation.isPending ? "作成中..." : "分岐を作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type CompareViewProps = {
  versionA: PromptVersion;
  versionB: PromptVersion;
  onClose: () => void;
};

function diffLines(a: string, b: string): { type: "same" | "removed" | "added"; text: string }[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const result: { type: "same" | "removed" | "added"; text: string }[] = [];

  // 単純なLCS差分アルゴリズム（Myers diff の簡易実装）
  const maxLen = Math.max(aLines.length, bLines.length);
  let ai = 0;
  let bi = 0;

  while (ai < aLines.length || bi < bLines.length) {
    if (ai < aLines.length && bi < bLines.length && aLines[ai] === bLines[bi]) {
      // biome-ignore lint/style/noNonNullAssertion: bounds checked above
      result.push({ type: "same", text: aLines[ai]! });
      ai++;
      bi++;
    } else {
      const aRemainder = aLines.slice(ai);
      const bRemainder = bLines.slice(bi);

      let foundInA = -1;
      let foundInB = -1;
      const lookAhead = Math.min(5, maxLen);

      for (let d = 0; d < lookAhead; d++) {
        // biome-ignore lint/style/noNonNullAssertion: d < bRemainder.length checked
        if (d < bRemainder.length && aRemainder.slice(0, lookAhead).includes(bRemainder[d]!)) {
          foundInB = d;
          // biome-ignore lint/style/noNonNullAssertion: d < bRemainder.length checked
          foundInA = aRemainder.indexOf(bRemainder[d]!);
          break;
        }
        // biome-ignore lint/style/noNonNullAssertion: d < aRemainder.length checked
        if (d < aRemainder.length && bRemainder.slice(0, lookAhead).includes(aRemainder[d]!)) {
          foundInA = d;
          // biome-ignore lint/style/noNonNullAssertion: d < aRemainder.length checked
          foundInB = bRemainder.indexOf(aRemainder[d]!);
          break;
        }
      }

      if (foundInA > 0) {
        for (let i = 0; i < foundInA; i++) {
          // biome-ignore lint/style/noNonNullAssertion: i < foundInA <= aRemainder.length
          result.push({ type: "removed", text: aRemainder[i]! });
        }
        ai += foundInA;
      } else if (foundInB > 0) {
        for (let i = 0; i < foundInB; i++) {
          // biome-ignore lint/style/noNonNullAssertion: i < foundInB <= bRemainder.length
          result.push({ type: "added", text: bRemainder[i]! });
        }
        bi += foundInB;
      } else {
        if (ai < aLines.length) {
          // biome-ignore lint/style/noNonNullAssertion: bounds checked above
          result.push({ type: "removed", text: aLines[ai]! });
          ai++;
        }
        if (bi < bLines.length) {
          // biome-ignore lint/style/noNonNullAssertion: bounds checked above
          result.push({ type: "added", text: bLines[bi]! });
          bi++;
        }
      }
    }
  }

  return result;
}

function CompareView({ versionA, versionB, onClose }: CompareViewProps) {
  const [mode, setMode] = useState<"side-by-side" | "unified">("side-by-side");
  const diff = diffLines(versionA.content, versionB.content);

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
        {/* ヘッダー */}
        <div className={styles.compareHeader}>
          <h3 className={styles.compareHeaderTitle}>バージョン比較</h3>
          <div className={styles.compareHeaderActions}>
            <div className={styles.compareModeToggle}>
              {(["side-by-side", "unified"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`${styles.btnMode} ${mode === m ? styles.btnModeActive : styles.btnModeInactive}`}
                >
                  {m === "side-by-side" ? "並列" : "統合"}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className={styles.btnCloseCompare}>
              閉じる
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className={styles.compareContent}>
          {mode === "side-by-side" ? (
            <div className={styles.sideBySide}>
              {/* 左: versionA */}
              <div className={`${styles.comparePanel} ${styles.comparePanelLeft}`}>
                <div className={`${styles.comparePanelHeader} ${styles.comparePanelHeaderA}`}>
                  <span>
                    v{versionA.version} {versionA.name && `— ${versionA.name}`}
                  </span>
                  <span className={styles.comparePanelDate}>{formatDate(versionA.created_at)}</span>
                </div>
                <pre className={styles.comparePre}>{versionA.content}</pre>
              </div>
              {/* 右: versionB */}
              <div className={styles.comparePanel}>
                <div className={`${styles.comparePanelHeader} ${styles.comparePanelHeaderB}`}>
                  <span>
                    v{versionB.version} {versionB.name && `— ${versionB.name}`}
                  </span>
                  <span className={styles.comparePanelDate}>{formatDate(versionB.created_at)}</span>
                </div>
                <pre className={styles.comparePre}>{versionB.content}</pre>
              </div>
            </div>
          ) : (
            // 統合表示（差分ハイライト）
            <div className={styles.unifiedView}>
              <div className={styles.unifiedHeader}>
                <span className={styles.unifiedLabelA}>ー v{versionA.version}</span>
                <span className={styles.unifiedLabelB}>+ v{versionB.version}</span>
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

type PanelMode =
  | { type: "view"; version: PromptVersion }
  | { type: "edit"; version: PromptVersion }
  | { type: "new" }
  | null;

export function PromptsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const [selectedVersion, setSelectedVersionState] = useState<PromptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [branchTarget, setBranchTarget] = useState<PromptVersion | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const {
    data: versions,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["promptVersions", projectId],
    queryFn: () => getPromptVersions(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const setSelectedMutation = useMutation({
    mutationFn: (versionId: number) => setSelectedVersion(projectId, versionId),
    onSuccess: (updatedVersion) => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      setPanelMode({ type: "view", version: updatedVersion });
    },
  });

  const tree = versions ? buildVersionTree(versions) : [];
  const flatNodes = flattenTree(tree);
  const verticalLinesPerNode = computeVerticalLines(flatNodes);

  function handleSelectVersion(v: PromptVersion) {
    setSelectedVersionState(v);
    setPanelMode({ type: "view", version: v });
  }

  function handleBranch(v: PromptVersion) {
    setBranchTarget(v);
  }

  function handleCompare(v: PromptVersion) {
    if (compareVersion?.id === v.id) {
      setCompareVersion(null);
      return;
    }
    if (selectedVersion && selectedVersion.id !== v.id) {
      setCompareVersion(v);
    } else {
      setCompareVersion(v);
    }
  }

  function handleOpenCompare() {
    if (selectedVersion && compareVersion) {
      setIsCompareOpen(true);
    }
  }

  function handleBranchCreated(newVersion: PromptVersion) {
    setBranchTarget(null);
    setSelectedVersionState(newVersion);
    setPanelMode({ type: "edit", version: newVersion });
  }

  return (
    <div className={`${styles.root} ${styles.page}`}>
      {/* ページヘッダー */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>プロンプト管理</h2>
          {project && <p className={styles.projectName}>{project.name}</p>}
        </div>
        <div className={styles.pageActions}>
          {selectedVersion && compareVersion && (
            <button type="button" onClick={handleOpenCompare} className={styles.btnBlue}>
              比較を表示
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedVersionState(null);
              setPanelMode({ type: "new" });
            }}
            className={styles.btnPrimary}
          >
            + 新規作成
          </button>
        </div>
      </div>

      {/* 比較バー */}
      {(selectedVersion || compareVersion) && (
        <div className={styles.compareBar}>
          <span className={styles.compareBarLabel}>選択中:</span>
          {selectedVersion && (
            <span className={styles.compareBarSelected}>
              v{selectedVersion.version} {selectedVersion.name && `— ${selectedVersion.name}`}
            </span>
          )}
          {compareVersion && (
            <>
              <span className={styles.compareBarVs}>vs</span>
              <span className={styles.compareBarComparing}>
                v{compareVersion.version} {compareVersion.name && `— ${compareVersion.name}`}
              </span>
              <button
                type="button"
                onClick={() => setCompareVersion(null)}
                className={styles.btnClear}
              >
                クリア
              </button>
            </>
          )}
          {!compareVersion && (
            <span className={styles.compareBarHint}>
              別のバージョンで「比較」をクリックすると比較できます
            </span>
          )}
        </div>
      )}

      {/* メインコンテンツ */}
      <div className={styles.mainContent}>
        {/* バージョンツリー */}
        <div className={styles.treePanel}>
          <div className={styles.treePanelLabel}>バージョン履歴</div>

          {isLoading && <p className={styles.treeStatus}>読み込み中...</p>}
          {isError && <p className={styles.treeError}>読み込みに失敗しました</p>}

          {!isLoading && !isError && flatNodes.length === 0 && (
            <div className={styles.treeEmpty}>
              バージョンがありません
              <br />
              <span style={{ fontSize: "12px" }}>「新規作成」から始めましょう</span>
            </div>
          )}

          <div className={styles.treeScroll}>
            {flatNodes.map((node, i) => (
              <VersionTreeItem
                key={node.version.id}
                node={node}
                isSelected={selectedVersion?.id === node.version.id}
                isComparing={compareVersion?.id === node.version.id}
                onSelect={handleSelectVersion}
                onBranch={handleBranch}
                onCompare={handleCompare}
                verticalLines={verticalLinesPerNode[i] ?? []}
              />
            ))}
          </div>
        </div>

        {/* 右パネル */}
        <div className={styles.rightPanel}>
          {panelMode === null && (
            <div className={styles.panelEmpty}>バージョンを選択するか、新規作成してください</div>
          )}

          {panelMode?.type === "new" && (
            <>
              <div className={styles.panelHeaderTitle}>新規プロンプト作成</div>
              <div className={styles.panelEditorBody}>
                <PromptEditor
                  version={null}
                  projectId={projectId}
                  isNew={true}
                  onSave={() => setPanelMode(null)}
                  onCancel={() => setPanelMode(null)}
                />
              </div>
            </>
          )}

          {panelMode?.type === "view" && (
            <>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelVersionNum}>v{panelMode.version.version}</span>
                  <span className={styles.panelVersionName}>
                    {panelMode.version.name ?? `バージョン ${panelMode.version.version}`}
                  </span>
                </div>
                <div className={styles.panelHeaderRight}>
                  {panelMode.version.is_selected && (
                    <span className={styles.badgeSelected}>Selected</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedMutation.mutate(panelMode.version.id)}
                    disabled={setSelectedMutation.isPending || panelMode.version.is_selected}
                    className={`${styles.btnSelected} ${panelMode.version.is_selected ? styles.btnSelectedActive : styles.btnSelectedInactive}`}
                  >
                    {panelMode.version.is_selected ? "Selected 済み" : "Selected に設定"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelMode({ type: "edit", version: panelMode.version })}
                    className={styles.btnEdit}
                  >
                    編集
                  </button>
                </div>
              </div>
              <div className={styles.panelBody}>
                {panelMode.version.memo && (
                  <div className={styles.memoBox}>
                    <span className={styles.memoLabel}>メモ:</span>
                    {panelMode.version.memo}
                  </div>
                )}
                <div className={styles.versionMeta}>
                  作成日時: {formatDate(panelMode.version.created_at)}
                  {panelMode.version.parent_version_id !== null && (
                    <span className={styles.badgeParentVersion}>
                      v
                      {versions?.find((v) => v.id === panelMode.version.parent_version_id)
                        ?.version ?? "?"}
                      から分岐
                    </span>
                  )}
                </div>
                <div className={styles.workflowPreviewLabel}>Step 1: プロンプト本文</div>
                <pre className={styles.promptPre}>{panelMode.version.content}</pre>
                {panelMode.version.workflow_definition?.steps.length ? (
                  <div className={styles.workflowPreview}>
                    <div className={styles.workflowPreviewLabel}>追加ステップ（Step 2 以降）</div>
                    <div className={styles.workflowPreviewList}>
                      {panelMode.version.workflow_definition.steps.map((step, index) => (
                        <div key={step.id} className={styles.workflowPreviewCard}>
                          <div className={styles.workflowPreviewHeader}>
                            <span>
                              {index + 2}. {step.title}
                            </span>
                            <span className={styles.workflowPreviewId}>{step.id}</span>
                          </div>
                          <pre className={styles.workflowPreviewPrompt}>{step.prompt}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {panelMode?.type === "edit" && (
            <>
              <div className={styles.panelHeaderTitle}>v{panelMode.version.version} を編集</div>
              <div className={styles.panelEditorBody}>
                <PromptEditor
                  version={panelMode.version}
                  projectId={projectId}
                  isNew={false}
                  onSave={() => {
                    // 編集完了後に最新データで表示モードに戻す
                    setPanelMode(null);
                    setSelectedVersionState(null);
                  }}
                  onCancel={() => setPanelMode({ type: "view", version: panelMode.version })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 分岐モーダル */}
      {branchTarget && (
        <BranchModal
          parentVersion={branchTarget}
          projectId={projectId}
          onClose={() => setBranchTarget(null)}
          onCreated={handleBranchCreated}
        />
      )}

      {/* 比較ビュー */}
      {isCompareOpen && selectedVersion && compareVersion && (
        <CompareView
          versionA={selectedVersion}
          versionB={compareVersion}
          onClose={() => setIsCompareOpen(false)}
        />
      )}
    </div>
  );
}
