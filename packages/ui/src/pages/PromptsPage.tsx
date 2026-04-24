import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  type Project,
  type PromptExecutionStepDefinition,
  type PromptFamily,
  type PromptVersion,
  branchIndependentPromptVersion,
  createIndependentPromptVersion,
  createPromptFamily,
  deletePromptFamily,
  getProjects,
  getPromptFamilies,
  getPromptVersionsByFamily,
  setPromptVersionProjects,
  setSelectedIndependentPromptVersion,
  updateIndependentPromptVersion,
  updatePromptFamily,
} from "../lib/api";
import { useI18n } from "../i18n/I18nProvider";
import { getStoredActiveLabelId } from "../lib/useActiveLabel";
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

type VersionTreeNode = {
  version: PromptVersion;
  children: VersionTreeNode[];
  depth: number;
};

function buildVersionTree(versions: PromptVersion[]): VersionTreeNode[] {
  const map = new Map<number, VersionTreeNode>();
  const roots: VersionTreeNode[] = [];

  for (const version of versions) {
    map.set(version.id, { version, children: [], depth: 0 });
  }

  for (const version of versions) {
    const node = map.get(version.id);
    if (!node) continue;

    if (version.parent_version_id === null) {
      roots.push(node);
      continue;
    }

    const parent = map.get(version.parent_version_id);
    if (!parent) {
      roots.push(node);
      continue;
    }

    parent.children.push(node);
  }

  function assignDepth(node: VersionTreeNode, depth: number) {
    node.depth = depth;
    node.children.sort((a, b) => a.version.version - b.version.version);
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  }

  roots.sort((a, b) => a.version.version - b.version.version);
  for (const root of roots) {
    assignDepth(root, 0);
  }

  return roots;
}

function flattenTree(nodes: VersionTreeNode[]): VersionTreeNode[] {
  const result: VersionTreeNode[] = [];

  function visit(node: VersionTreeNode) {
    result.push(node);
    for (const child of node.children) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
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

function getProjectName(projects: Project[], projectId: number | null): string | null {
  if (projectId === null) {
    return null;
  }

  return projects.find((project) => project.id === projectId)?.name ?? `Project ${projectId}`;
}

type FamilyModalProps = {
  family: PromptFamily | null;
  onClose: () => void;
  onSubmit: (data: { name?: string | null; description?: string | null }) => void;
  isPending: boolean;
  isError: boolean;
};

function FamilyModal({ family, onClose, onSubmit, isPending, isError }: FamilyModalProps) {
  const [name, setName] = useState(family?.name ?? "");
  const [description, setDescription] = useState(family?.description ?? "");

  const isNew = family === null;
  const isNameRequired = isNew;
  const isSubmitDisabled = isPending || (isNameRequired && !name.trim());

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitDisabled) return;
    onSubmit({
      name: name.trim() || null,
      description: description.trim() || null,
    });
  }

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
          {family ? "プロンプトファミリーを編集" : "プロンプトファミリーを作成"}
        </h3>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div>
            <label htmlFor="family-name" className={styles.fieldLabel}>
              名前
              {isNameRequired && <span className={styles.requiredMark}>*</span>}
            </label>
            <input
              id="family-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: FAQ 応答改善"
              className={styles.fieldInput}
              required={isNameRequired}
            />
          </div>
          <div>
            <label htmlFor="family-description" className={styles.fieldLabel}>
              説明
            </label>
            <textarea
              id="family-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="このファミリーで検証したい目的や前提"
              className={styles.familyTextarea}
            />
          </div>
          {isError && <p className={styles.errorMsg}>ファミリーの保存に失敗しました。</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.btnCancel}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`${styles.btnSave} ${isSubmitDisabled ? styles.btnDisabled : ""}`}
            >
              {isPending ? "保存中..." : family ? "更新" : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type VersionTreeItemProps = {
  node: VersionTreeNode;
  isSelected: boolean;
  isComparing: boolean;
  onSelect: (version: PromptVersion) => void;
  onBranch: (version: PromptVersion) => void;
  onCompare: (version: PromptVersion) => void;
  projectName: string | null;
};

function VersionTreeItem({
  node,
  isSelected,
  isComparing,
  onSelect,
  onBranch,
  onCompare,
  projectName,
}: VersionTreeItemProps) {
  return (
    <div className={styles.treeItemRow}>
      <div className={styles.treeIndent}>
        {Array.from({ length: node.depth }).map((_, index) => (
          <span key={`${node.version.id}-indent-${index}`} className={styles.treeIndentUnit} />
        ))}
      </div>
      {node.depth > 0 && (
        <div className={styles.treeConnector}>
          <div className={styles.treeConnectorH} />
          <div className={styles.treeConnectorV} />
        </div>
      )}
      <button
        type="button"
        onClick={() => onSelect(node.version)}
        className={`${styles.treeCard} ${isSelected ? styles.treeCardSelected : ""} ${isComparing ? styles.treeCardComparing : ""}`}
      >
        <div className={styles.treeCardMain}>
          <div className={styles.treeCardTitleRow}>
            <span
              className={`${styles.treeVersionNum} ${isSelected ? styles.treeVersionNumSelected : ""}`}
            >
              v{node.version.version}
            </span>
            <span className={styles.treeVersionName}>
              {node.version.name ?? `バージョン ${node.version.version}`}
            </span>
            {node.version.parent_version_id !== null && (
              <span className={styles.badgeBranch}>分岐</span>
            )}
          </div>
          <div className={styles.treeMetaRow}>
            {projectName ? <span className={styles.projectTag}>{projectName}</span> : null}
            {node.version.is_selected && (
              <span className={styles.badgeSelectedInline}>Selected</span>
            )}
          </div>
        </div>
        <div
          className={styles.treeCardActions}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onCompare(node.version)}
            className={`${styles.btnTreeAction} ${isComparing ? styles.btnTreeCompareActive : ""}`}
          >
            比較
          </button>
          <button
            type="button"
            onClick={() => onBranch(node.version)}
            className={`${styles.btnTreeAction} ${styles.btnTreeBranch}`}
          >
            分岐
          </button>
        </div>
      </button>
    </div>
  );
}

const NEW_FAMILY_VALUE = "__new__";

type PromptEditorProps = {
  familyId?: number;
  families: PromptFamily[];
  initialFamilyId: number | null;
  projects: Project[];
  version: PromptVersion | null;
  defaultProjectId: number | null;
  isNew?: boolean;
  onSave: (version: PromptVersion) => void;
  onCancel: () => void;
};

function PromptEditor({
  familyId,
  families,
  initialFamilyId,
  projects,
  version,
  defaultProjectId,
  isNew = false,
  onSave,
  onCancel,
}: PromptEditorProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(version?.name ?? "");
  const [memo, setMemo] = useState(version?.memo ?? "");
  const [content, setContent] = useState(version?.content ?? "");
  const [linkedProjectId, setLinkedProjectId] = useState(
    version?.project_id !== null && version?.project_id !== undefined
      ? String(version.project_id)
      : defaultProjectId !== null
        ? String(defaultProjectId)
        : "",
  );
  const [workflowSteps, setWorkflowSteps] = useState<PromptExecutionStepDefinition[]>(
    version?.workflow_definition?.steps ?? [],
  );
  const [familySelectValue, setFamilySelectValue] = useState(
    isNew ? (initialFamilyId !== null ? String(initialFamilyId) : NEW_FAMILY_VALUE) : "",
  );
  const [newFamilyName, setNewFamilyName] = useState("");

  const isCreatingNewFamily = isNew && familySelectValue === NEW_FAMILY_VALUE;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const workflowDefinition = buildWorkflowDefinition(workflowSteps);

      let actualFamilyId: number;
      if (isCreatingNewFamily) {
        const newFamily = await createPromptFamily({ name: newFamilyName.trim() });
        actualFamilyId = newFamily.id;
      } else {
        actualFamilyId = isNew ? Number(familySelectValue) : (familyId ?? 0);
      }

      const savedVersion = isNew
        ? await createIndependentPromptVersion({
            prompt_family_id: actualFamilyId,
            content: content.trim(),
            name: name.trim() || undefined,
            memo: memo.trim() || undefined,
            workflow_definition: workflowDefinition ?? undefined,
          })
        : await updateIndependentPromptVersion(version?.id ?? 0, {
            content: content.trim(),
            name: name.trim() || null,
            memo: memo.trim() || null,
            workflow_definition: workflowDefinition,
          });

      const nextProjectId = linkedProjectId ? Number(linkedProjectId) : null;
      if (savedVersion.project_id === nextProjectId) {
        return savedVersion;
      }

      return setPromptVersionProjects(savedVersion.id, { project_id: nextProjectId });
    },
    onSuccess: (savedVersion) => {
      void queryClient.invalidateQueries({ queryKey: ["promptFamilies"] });
      void queryClient.invalidateQueries({
        queryKey: ["promptVersionsByFamily", savedVersion.prompt_family_id],
      });
      onSave(savedVersion);
    },
  });

  const workflowValidationMessage = getWorkflowValidationMessage(workflowSteps);
  const isFamilyValid =
    !isNew || (isCreatingNewFamily ? newFamilyName.trim().length > 0 : familySelectValue !== "");
  const isDisabled =
    !content.trim() ||
    saveMutation.isPending ||
    workflowValidationMessage !== null ||
    !isFamilyValid;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    saveMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className={styles.editorForm}>
      {isNew && (
        <div>
          <label htmlFor="editor-family" className={styles.fieldLabel}>
            プロンプトファミリー<span className={styles.requiredMark}>*</span>
          </label>
          <select
            id="editor-family"
            value={familySelectValue}
            onChange={(event) => setFamilySelectValue(event.target.value)}
            className={styles.fieldInput}
          >
            {families.map((family) => (
              <option key={family.id} value={String(family.id)}>
                {family.name ?? `ファミリー ${family.id}`}
              </option>
            ))}
            <option value={NEW_FAMILY_VALUE}>＋ 新しいファミリーを作成...</option>
          </select>
          {isCreatingNewFamily && (
            <input
              type="text"
              value={newFamilyName}
              onChange={(event) => setNewFamilyName(event.target.value)}
              placeholder="新しいファミリー名を入力"
              className={styles.fieldInput}
              style={{ marginTop: "8px" }}
            />
          )}
        </div>
      )}
      <div>
        <label htmlFor="editor-name" className={styles.fieldLabel}>
          {isNew || version?.parent_version_id === null
            ? "プロンプト名（任意）"
            : "バージョン名（任意）"}
        </label>
        <input
          id="editor-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            isNew || version?.parent_version_id === null
              ? "未入力なら自動で名前を付けます"
              : "例: 丁寧語対応版"
          }
          className={styles.fieldInput}
        />
      </div>
      <div>
        <label htmlFor="editor-project" className={styles.fieldLabel}>
          プロジェクトラベル
        </label>
        <select
          id="editor-project"
          value={linkedProjectId}
          onChange={(event) => setLinkedProjectId(event.target.value)}
          className={styles.fieldInput}
        >
          <option value="">未分類</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="editor-memo" className={styles.fieldLabel}>
          メモ（任意）
        </label>
        <input
          id="editor-memo"
          type="text"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
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
          onChange={(event) => setContent(event.target.value)}
          placeholder="システムプロンプトを入力..."
          className={styles.fieldTextarea}
        />
      </div>
      <div className={styles.workflowSection}>
        <div className={styles.workflowHeader}>
          <div>
            <p className={styles.fieldLabel}>追加ステップ（Step 2 以降）</p>
            <p className={styles.workflowHint}>
              各ステップで `{"{{conversation}}"}`、`{"{{context}}"}`、`{"{{previous_output}}"}`、`
              {"{{step:step_id}}"}` を利用できます。
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
                    onChange={(event) =>
                      setWorkflowSteps((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index ? { ...current, id: event.target.value } : current,
                        ),
                      )
                    }
                    placeholder="step_id"
                    className={styles.fieldInput}
                  />
                  <input
                    type="text"
                    value={step.title}
                    onChange={(event) =>
                      setWorkflowSteps((prev) =>
                        prev.map((current, currentIndex) =>
                          currentIndex === index
                            ? { ...current, title: event.target.value }
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
                  onChange={(event) =>
                    setWorkflowSteps((prev) =>
                      prev.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, prompt: event.target.value }
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
          {saveMutation.isPending ? "保存中..." : isNew ? "作成" : "保存"}
        </button>
      </div>
      {saveMutation.isError && (
        <p className={styles.errorMsg}>プロンプトの保存に失敗しました。再度お試しください。</p>
      )}
    </form>
  );
}

function buildWorkflowDefinition(steps: PromptExecutionStepDefinition[]) {
  const normalizedSteps = steps
    .map((step, index) => ({
      id: step.id.trim(),
      title: step.title.trim() || `ステップ ${index + 2}`,
      prompt: step.prompt.trim(),
    }))
    .filter((step) => step.id && step.prompt);

  return normalizedSteps.length > 0 ? { steps: normalizedSteps } : null;
}

type BranchModalProps = {
  parentVersion: PromptVersion;
  defaultProjectId: number | null;
  onClose: () => void;
  onCreated: (newVersion: PromptVersion) => void;
};

function BranchModal({ parentVersion, defaultProjectId, onClose, onCreated }: BranchModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  const branchMutation = useMutation({
    mutationFn: async () => {
      const created = await branchIndependentPromptVersion(parentVersion.id, {
        name: name.trim() || undefined,
        memo: memo.trim() || undefined,
      });

      const nextProjectId = parentVersion.project_id ?? defaultProjectId;
      if (created.project_id === nextProjectId) {
        return created;
      }

      return setPromptVersionProjects(created.id, { project_id: nextProjectId });
    },
    onSuccess: (newVersion) => {
      void queryClient.invalidateQueries({
        queryKey: ["promptVersionsByFamily", parentVersion.prompt_family_id],
      });
      onCreated(newVersion);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    branchMutation.mutate();
  }

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
        <h3 className={styles.modalTitle}>バージョンを分岐</h3>
        <p className={styles.modalSubtext}>
          v{parentVersion.version}「{parentVersion.name ?? `バージョン ${parentVersion.version}`}」
          から分岐します
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
              onChange={(event) => setName(event.target.value)}
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
              onChange={(event) => setMemo(event.target.value)}
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

  let ai = 0;
  let bi = 0;

  while (ai < aLines.length || bi < bLines.length) {
    const aLine = aLines[ai];
    const bLine = bLines[bi];

    if (aLine !== undefined && bLine !== undefined && aLine === bLine) {
      result.push({ type: "same", text: aLine });
      ai += 1;
      bi += 1;
      continue;
    }

    if (aLine !== undefined) {
      result.push({ type: "removed", text: aLine });
      ai += 1;
    }

    if (bLine !== undefined) {
      result.push({ type: "added", text: bLine });
      bi += 1;
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
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className={styles.compareBox}>
        <div className={styles.compareHeader}>
          <h3 className={styles.compareHeaderTitle}>バージョン比較</h3>
          <div className={styles.compareHeaderActions}>
            <div className={styles.compareModeToggle}>
              {(["side-by-side", "unified"] as const).map((modeValue) => (
                <button
                  key={modeValue}
                  type="button"
                  onClick={() => setMode(modeValue)}
                  className={`${styles.btnMode} ${mode === modeValue ? styles.btnModeActive : styles.btnModeInactive}`}
                >
                  {modeValue === "side-by-side" ? "並列" : "統合"}
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
                  <span>
                    v{versionA.version} {versionA.name ? `— ${versionA.name}` : ""}
                  </span>
                  <span className={styles.comparePanelDate}>{formatDate(versionA.created_at)}</span>
                </div>
                <pre className={styles.comparePre}>{versionA.content}</pre>
              </div>
              <div className={styles.comparePanel}>
                <div className={`${styles.comparePanelHeader} ${styles.comparePanelHeaderB}`}>
                  <span>
                    v{versionB.version} {versionB.name ? `— ${versionB.name}` : ""}
                  </span>
                  <span className={styles.comparePanelDate}>{formatDate(versionB.created_at)}</span>
                </div>
                <pre className={styles.comparePre}>{versionB.content}</pre>
              </div>
            </div>
          ) : (
            <div className={styles.unifiedView}>
              <div className={styles.unifiedHeader}>
                <span className={styles.unifiedLabelA}>- v{versionA.version}</span>
                <span className={styles.unifiedLabelB}>+ v{versionB.version}</span>
              </div>
              <div className={styles.diffScroll}>
                {diff.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
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
  const { t } = useI18n();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const routeProjectId = id ? Number(id) : null;
  const projectFilterParam = searchParams.get("project_id");
  const familyFilterParam = searchParams.get("family_id");
  const isProjectScopedView = routeProjectId !== null;

  // URLに project_id が既にある場合はアクティブラベルを使わない（ユーザーが明示的に選択済み）
  const [userSelectedProject, setUserSelectedProject] = useState<boolean>(
    () => projectFilterParam !== null || routeProjectId !== null,
  );

  const urlProjectId = routeProjectId ?? (projectFilterParam ? Number(projectFilterParam) : null);
  const selectedProjectId =
    urlProjectId !== null ? urlProjectId : userSelectedProject ? null : getStoredActiveLabelId();

  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<PromptVersion | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [branchTarget, setBranchTarget] = useState<PromptVersion | null>(null);
  const [editingFamily, setEditingFamily] = useState<PromptFamily | null | undefined>(undefined);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const {
    data: families = [],
    isLoading: isFamiliesLoading,
    isError: isFamiliesError,
  } = useQuery({
    queryKey: ["promptFamilies"],
    queryFn: getPromptFamilies,
  });

  const requestedFamilyId = familyFilterParam ? Number(familyFilterParam) : null;
  const selectedFamilyId =
    requestedFamilyId !== null && families.some((family) => family.id === requestedFamilyId)
      ? requestedFamilyId
      : (families[0]?.id ?? null);
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? null;

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (selectedFamilyId === null) {
      if (!nextParams.has("family_id")) return;
      nextParams.delete("family_id");
      setSearchParams(nextParams, { replace: true });
      return;
    }
    if (searchParams.get("family_id") === String(selectedFamilyId)) return;
    nextParams.set("family_id", String(selectedFamilyId));
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, selectedFamilyId, setSearchParams]);

  const {
    data: familyVersions = [],
    isLoading: isVersionsLoading,
    isError: isVersionsError,
  } = useQuery({
    queryKey: ["promptVersionsByFamily", selectedFamilyId],
    queryFn: () => getPromptVersionsByFamily(selectedFamilyId ?? 0),
    enabled: selectedFamilyId !== null,
  });

  const filteredVersions =
    selectedProjectId === null
      ? familyVersions
      : familyVersions.filter((version) => version.project_id === selectedProjectId);

  const tree = buildVersionTree(filteredVersions);
  const flatNodes = flattenTree(tree);

  useEffect(() => {
    if (!selectedVersion) {
      return;
    }

    const nextSelected =
      familyVersions.find((version) => version.id === selectedVersion.id) ?? null;
    setSelectedVersion(nextSelected);
    if (nextSelected && panelMode?.type === "view") {
      setPanelMode({ type: "view", version: nextSelected });
    }
    if (nextSelected && panelMode?.type === "edit") {
      setPanelMode({ type: "edit", version: nextSelected });
    }
  }, [familyVersions, panelMode?.type, selectedVersion]);

  useEffect(() => {
    if (!compareVersion) {
      return;
    }

    const nextCompare = familyVersions.find((version) => version.id === compareVersion.id) ?? null;
    setCompareVersion(nextCompare);
  }, [compareVersion, familyVersions]);

  const familySaveMutation = useMutation({
    mutationFn: (data: { familyId?: number; name?: string | null; description?: string | null }) =>
      data.familyId
        ? updatePromptFamily(data.familyId, {
            name: data.name,
            description: data.description,
          })
        : createPromptFamily({
            name: data.name,
            description: data.description,
          }),
    onSuccess: (family) => {
      void queryClient.invalidateQueries({ queryKey: ["promptFamilies"] });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("family_id", String(family.id));
      setSearchParams(nextParams, { replace: true });
      setEditingFamily(undefined);
    },
  });

  const familyDeleteMutation = useMutation({
    mutationFn: (familyId: number) => deletePromptFamily(familyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["promptFamilies"] });
      setSelectedVersion(null);
      setCompareVersion(null);
      setPanelMode(null);
    },
  });

  const setSelectedMutation = useMutation({
    mutationFn: (versionId: number) => setSelectedIndependentPromptVersion(versionId),
    onSuccess: (updatedVersion) => {
      void queryClient.invalidateQueries({
        queryKey: ["promptVersionsByFamily", selectedFamilyId],
      });
      setSelectedVersion(updatedVersion);
      setPanelMode({ type: "view", version: updatedVersion });
    },
  });

  function handleProjectFilterChange(nextValue: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextValue) {
      nextParams.set("project_id", nextValue);
    } else {
      nextParams.delete("project_id");
    }
    setUserSelectedProject(true);
    setSearchParams(nextParams);
  }

  function handleSelectFamily(familyId: number) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("family_id", String(familyId));
    setSearchParams(nextParams);
    setSelectedVersion(null);
    setCompareVersion(null);
    setPanelMode(null);
  }

  function handleSelectVersion(version: PromptVersion) {
    setSelectedVersion(version);
    setPanelMode({ type: "view", version });
  }

  function handleCompare(version: PromptVersion) {
    if (compareVersion?.id === version.id) {
      setCompareVersion(null);
      return;
    }
    setCompareVersion(version);
  }

  function handleFamilyDelete() {
    if (!selectedFamily) {
      return;
    }
    familyDeleteMutation.mutate(selectedFamily.id);
  }

  const selectedProjectName = getProjectName(projects, selectedProjectId);

  return (
    <div className={`${styles.root} ${styles.page}`}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>{t("prompts.title")}</h2>
          <p className={styles.pageDescription}>{t("prompts.description")}</p>
        </div>
        <div className={styles.pageActions}>
          {selectedVersion && compareVersion && (
            <button type="button" onClick={() => setIsCompareOpen(true)} className={styles.btnBlue}>
              比較を表示
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditingFamily(null)}
            className={styles.btnAccentOutline}
          >
            + ファミリー作成
          </button>
          <button
            type="button"
            onClick={() => setPanelMode({ type: "new" })}
            disabled={families.length === 0}
            className={`${styles.btnPrimary} ${families.length === 0 ? styles.btnDisabled : ""}`}
          >
            + 新規バージョン
          </button>
        </div>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label htmlFor="project-filter" className={styles.filterLabel}>
            {t("prompts.projectFilterLabel")}
          </label>
          <select
            id="project-filter"
            value={selectedProjectId ?? ""}
            onChange={(event) => handleProjectFilterChange(event.target.value)}
            disabled={isProjectScopedView}
            className={styles.filterSelect}
          >
            <option value="">すべてのプロジェクト</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        {selectedProjectName ? (
          <p className={styles.filterHint}>
            現在は <span className={styles.projectTag}>{selectedProjectName}</span>
            {isProjectScopedView
              ? " 固定の画面として表示しています。"
              : " の付いたバージョンだけを表示しています。"}
          </p>
        ) : (
          <p className={styles.filterHint}>未分類を含む全バージョンを表示しています。</p>
        )}
      </div>

      {(selectedVersion || compareVersion) && (
        <div className={styles.compareBar}>
          <span className={styles.compareBarLabel}>選択中:</span>
          {selectedVersion && (
            <span className={styles.compareBarSelected}>
              v{selectedVersion.version} {selectedVersion.name ? `— ${selectedVersion.name}` : ""}
            </span>
          )}
          {compareVersion && (
            <>
              <span className={styles.compareBarVs}>vs</span>
              <span className={styles.compareBarComparing}>
                v{compareVersion.version} {compareVersion.name ? `— ${compareVersion.name}` : ""}
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

      <div className={styles.mainContent}>
        <div className={styles.sidebarColumn}>
          <section className={styles.familyPanel}>
            <div className={styles.familyPanelHeader}>
              <div className={styles.treePanelLabel}>{t("prompts.familyPanelLabel")}</div>
              <div className={styles.familyActions}>
                <button
                  type="button"
                  onClick={() => selectedFamily && setEditingFamily(selectedFamily)}
                  disabled={!selectedFamily}
                  className={`${styles.btnMini} ${!selectedFamily ? styles.btnDisabled : ""}`}
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={handleFamilyDelete}
                  disabled={!selectedFamily || familyDeleteMutation.isPending}
                  className={`${styles.btnMiniDanger} ${!selectedFamily ? styles.btnDisabled : ""}`}
                >
                  削除
                </button>
              </div>
            </div>
            {isFamiliesLoading && <p className={styles.treeStatus}>読み込み中...</p>}
            {isFamiliesError && (
              <p className={styles.treeError}>ファミリー一覧の取得に失敗しました。</p>
            )}
            {!isFamiliesLoading && !isFamiliesError && families.length === 0 && (
              <div className={styles.treeEmpty}>
                ファミリーがありません
                <span className={styles.treeEmptyHint}>
                  まずは「ファミリー作成」から始めましょう
                </span>
              </div>
            )}
            <div className={styles.familyList}>
              {families.map((family) => (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => handleSelectFamily(family.id)}
                  className={`${styles.familyCard} ${selectedFamilyId === family.id ? styles.familyCardSelected : ""}`}
                >
                  <span className={styles.familyName}>
                    {family.name ?? `ファミリー ${family.id}`}
                  </span>
                  {family.description && (
                    <span className={styles.familyDescription}>{family.description}</span>
                  )}
                </button>
              ))}
            </div>
            {familyDeleteMutation.isError && (
              <p className={styles.errorMsg}>
                ファミリーの削除に失敗しました。Run 参照が残っている可能性があります。
              </p>
            )}
          </section>

          <section className={styles.treePanel}>
            <div className={styles.treePanelLabel}>バージョン履歴</div>
            {selectedFamily && (
              <p className={styles.treeFamilyName}>
                {selectedFamily.name ?? `ファミリー ${selectedFamily.id}`}
              </p>
            )}

            {!selectedFamily && <p className={styles.treeStatus}>ファミリーを選択してください。</p>}
            {selectedFamily && isVersionsLoading && (
              <p className={styles.treeStatus}>読み込み中...</p>
            )}
            {selectedFamily && isVersionsError && (
              <p className={styles.treeError}>バージョン一覧の取得に失敗しました。</p>
            )}
            {selectedFamily && !isVersionsLoading && !isVersionsError && flatNodes.length === 0 && (
              <div className={styles.treeEmpty}>
                条件に合うバージョンがありません
                <span className={styles.treeEmptyHint}>
                  プロジェクトフィルタを変更するか、新規バージョンを作成してください
                </span>
              </div>
            )}
            <div className={styles.treeScroll}>
              {flatNodes.map((node) => (
                <VersionTreeItem
                  key={node.version.id}
                  node={node}
                  isSelected={selectedVersion?.id === node.version.id}
                  isComparing={compareVersion?.id === node.version.id}
                  onSelect={handleSelectVersion}
                  onBranch={(version) => setBranchTarget(version)}
                  onCompare={handleCompare}
                  projectName={getProjectName(projects, node.version.project_id)}
                />
              ))}
            </div>
          </section>
        </div>

        <div className={styles.rightPanel}>
          {panelMode === null && (
            <div className={styles.panelEmpty}>
              ファミリーを選択してバージョンを開くか、新規バージョンを作成してください
            </div>
          )}

          {panelMode?.type === "new" && (
            <>
              <div className={styles.panelHeaderTitle}>新規バージョンを作成</div>
              <div className={styles.panelEditorBody}>
                <PromptEditor
                  families={families}
                  initialFamilyId={selectedFamilyId}
                  projects={projects}
                  version={null}
                  defaultProjectId={selectedProjectId}
                  isNew={true}
                  onSave={(version) => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set("family_id", String(version.prompt_family_id));
                    setSearchParams(nextParams, { replace: true });
                    setSelectedVersion(version);
                    setPanelMode({ type: "view", version });
                  }}
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
                {selectedFamily && (
                  <div className={styles.familySummaryCard}>
                    <span className={styles.familySummaryLabel}>{t("prompts.familySummaryLabel")}</span>
                    <strong className={styles.familySummaryName}>
                      {selectedFamily.name ?? `ファミリー ${selectedFamily.id}`}
                    </strong>
                    {selectedFamily.description && (
                      <p className={styles.familySummaryDescription}>
                        {selectedFamily.description}
                      </p>
                    )}
                  </div>
                )}
                <div className={styles.versionMetaRow}>
                  {panelMode.version.project_id !== null ? (
                    <span className={styles.projectTag}>
                      {getProjectName(projects, panelMode.version.project_id)}
                    </span>
                  ) : (
                    <span className={styles.projectTagMuted}>未分類</span>
                  )}
                  <span className={styles.versionMeta}>
                    作成日時: {formatDate(panelMode.version.created_at)}
                  </span>
                  {panelMode.version.parent_version_id !== null && (
                    <span className={styles.badgeParentVersion}>
                      v
                      {familyVersions.find(
                        (version) => version.id === panelMode.version.parent_version_id,
                      )?.version ?? "?"}
                      から分岐
                    </span>
                  )}
                </div>
                {panelMode.version.memo && (
                  <div className={styles.memoBox}>
                    <span className={styles.memoLabel}>メモ:</span>
                    {panelMode.version.memo}
                  </div>
                )}
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

          {panelMode?.type === "edit" && selectedFamily && (
            <>
              <div className={styles.panelHeaderTitle}>v{panelMode.version.version} を編集</div>
              <div className={styles.panelEditorBody}>
                <PromptEditor
                  familyId={selectedFamily.id}
                  families={families}
                  initialFamilyId={selectedFamily.id}
                  projects={projects}
                  version={panelMode.version}
                  defaultProjectId={selectedProjectId}
                  onSave={(version) => {
                    setSelectedVersion(version);
                    setPanelMode({ type: "view", version });
                  }}
                  onCancel={() => setPanelMode({ type: "view", version: panelMode.version })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {editingFamily !== undefined && (
        <FamilyModal
          family={editingFamily}
          onClose={() => setEditingFamily(undefined)}
          onSubmit={(data) =>
            familySaveMutation.mutate({
              familyId: editingFamily?.id,
              ...data,
            })
          }
          isPending={familySaveMutation.isPending}
          isError={familySaveMutation.isError}
        />
      )}

      {branchTarget && (
        <BranchModal
          parentVersion={branchTarget}
          defaultProjectId={selectedProjectId}
          onClose={() => setBranchTarget(null)}
          onCreated={(newVersion) => {
            setBranchTarget(null);
            setSelectedVersion(newVersion);
            setPanelMode({ type: "edit", version: newVersion });
          }}
        />
      )}

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
