import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { generateAnnotationPrompt } from "../lib/annotationPrompt";
import {
  type AnnotationLabel,
  ApiError,
  createAnnotationLabel,
  createAnnotationTask,
  createPromptVersion,
  deleteAnnotationLabel,
  deleteAnnotationTask,
  getAnnotationTask,
  getAnnotationTasks,
  getProject,
  updateAnnotationLabel,
  updateAnnotationTask,
} from "../lib/api";
import styles from "./AnnotationTaskSettingsPage.module.css";

type TaskFormState = {
  name: string;
  description: string;
};

type LabelFormState = {
  key: string;
  name: string;
  color: string;
  displayOrder: string;
};

const emptyTaskForm: TaskFormState = {
  name: "",
  description: "",
};

const emptyLabelForm: LabelFormState = {
  key: "",
  name: "",
  color: "",
  displayOrder: "0",
};

const autoLabelColors = [
  "#ff7a59",
  "#5cc8ff",
  "#f7b801",
  "#7bd389",
  "#b794f4",
  "#ff8fab",
  "#4ecdc4",
  "#f28482",
  "#84a59d",
  "#90be6d",
];

function buildLabelKey(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildAutoLabelColor(value: string): string {
  const seed = buildLabelKey(value) || "label";
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return autoLabelColors[hash % autoLabelColors.length] || "#ff7a59";
}

function buildLabelPreviewColor(form: LabelFormState): string {
  return form.color.trim() || buildAutoLabelColor(form.key || form.name);
}

function buildLabelPayload(form: LabelFormState) {
  const derivedKey = buildLabelKey(form.key || form.name);
  const derivedName = form.name.trim() || derivedKey;
  const derivedColor = form.color.trim() || buildAutoLabelColor(derivedKey || derivedName);

  return {
    key: derivedKey,
    name: derivedName,
    color: derivedColor,
    display_order: Number(form.displayOrder),
  };
}

function buildTaskForm(task?: { name: string; description: string | null }): TaskFormState {
  return {
    name: task?.name ?? "",
    description: task?.description ?? "",
  };
}

function buildLabelForm(label?: AnnotationLabel): LabelFormState {
  return {
    key: label?.key ?? "",
    name: label?.name ?? "",
    color: label?.color ?? "",
    displayOrder: String(label?.display_order ?? 0),
  };
}

export function AnnotationTaskSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [newTaskForm, setNewTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [newLabelForm, setNewLabelForm] = useState<LabelFormState>(emptyLabelForm);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editingLabelForm, setEditingLabelForm] = useState<LabelFormState>(emptyLabelForm);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const tasksQuery = useQuery({
    queryKey: ["annotation-tasks"],
    queryFn: getAnnotationTasks,
  });

  useEffect(() => {
    const tasks = tasksQuery.data ?? [];

    if (tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }

    const firstTask = tasks[0];
    if (!firstTask) {
      return;
    }

    if (selectedTaskId === null || !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(firstTask.id);
    }
  }, [selectedTaskId, tasksQuery.data]);

  const taskDetailQuery = useQuery({
    queryKey: ["annotation-task", selectedTaskId],
    queryFn: () => getAnnotationTask(selectedTaskId as number),
    enabled: selectedTaskId !== null,
  });

  useEffect(() => {
    if (taskDetailQuery.data) {
      setTaskForm(buildTaskForm(taskDetailQuery.data));

      if (editingLabelId !== null) {
        const nextLabel = taskDetailQuery.data.labels.find((label) => label.id === editingLabelId);
        if (nextLabel) {
          setEditingLabelForm(buildLabelForm(nextLabel));
        } else {
          setEditingLabelId(null);
          setEditingLabelForm(emptyLabelForm);
        }
      }
    }
  }, [editingLabelId, taskDetailQuery.data]);

  const sortedLabels = useMemo(
    () => taskDetailQuery.data?.labels ?? [],
    [taskDetailQuery.data?.labels],
  );

  function showFeedback(message: string, tone: "success" | "error") {
    setFeedbackMessage(message);
    setFeedbackTone(tone);
  }

  async function refreshTaskData(taskId?: number) {
    await queryClient.invalidateQueries({ queryKey: ["annotation-tasks"] });
    if (taskId !== undefined) {
      await queryClient.invalidateQueries({ queryKey: ["annotation-task", taskId] });
    }
  }

  const createTaskMutation = useMutation({
    mutationFn: () =>
      createAnnotationTask({
        name: newTaskForm.name.trim(),
        description: newTaskForm.description.trim() || undefined,
        output_mode: "span_label",
      }),
    onSuccess: async (createdTask) => {
      await refreshTaskData(createdTask.id);
      setSelectedTaskId(createdTask.id);
      setNewTaskForm(emptyTaskForm);
      showFeedback("アノテーションタスクを作成しました。", "success");
    },
    onError: () => {
      showFeedback("アノテーションタスクの作成に失敗しました。", "error");
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: () =>
      updateAnnotationTask(selectedTaskId as number, {
        name: taskForm.name.trim(),
        description: taskForm.description.trim() || null,
      }),
    onSuccess: async () => {
      if (selectedTaskId !== null) {
        await refreshTaskData(selectedTaskId);
      }
      showFeedback("タスク設定を更新しました。", "success");
    },
    onError: () => {
      showFeedback("タスク設定の更新に失敗しました。", "error");
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: () => deleteAnnotationTask(selectedTaskId as number),
    onSuccess: async () => {
      const deletedTaskId = selectedTaskId;
      setEditingLabelId(null);
      setEditingLabelForm(emptyLabelForm);
      await queryClient.invalidateQueries({ queryKey: ["annotation-tasks"] });
      if (deletedTaskId !== null) {
        queryClient.removeQueries({ queryKey: ["annotation-task", deletedTaskId] });
      }
      showFeedback("タスクを削除しました。", "success");
    },
    onError: () => {
      showFeedback("タスクの削除に失敗しました。", "error");
    },
  });

  const createLabelMutation = useMutation({
    mutationFn: () =>
      createAnnotationLabel(selectedTaskId as number, buildLabelPayload(newLabelForm)),
    onSuccess: async () => {
      if (selectedTaskId !== null) {
        await refreshTaskData(selectedTaskId);
      }
      setNewLabelForm(emptyLabelForm);
      showFeedback("ラベルを追加しました。", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        showFeedback("同じ key のラベルがすでに存在します。", "error");
        return;
      }
      showFeedback("ラベルの追加に失敗しました。", "error");
    },
  });

  const updateLabelMutation = useMutation({
    mutationFn: () =>
      updateAnnotationLabel(editingLabelId as number, buildLabelPayload(editingLabelForm)),
    onSuccess: async () => {
      if (selectedTaskId !== null) {
        await refreshTaskData(selectedTaskId);
      }
      setEditingLabelId(null);
      setEditingLabelForm(emptyLabelForm);
      showFeedback("ラベルを更新しました。", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        showFeedback("同じ key のラベルがすでに存在します。", "error");
        return;
      }
      showFeedback("ラベルの更新に失敗しました。", "error");
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: (labelId: number) => deleteAnnotationLabel(labelId),
    onSuccess: async () => {
      if (selectedTaskId !== null) {
        await refreshTaskData(selectedTaskId);
      }
      if (editingLabelId !== null) {
        setEditingLabelId(null);
        setEditingLabelForm(emptyLabelForm);
      }
      showFeedback("ラベルを削除しました。", "success");
    },
    onError: () => {
      showFeedback("ラベルの削除に失敗しました。", "error");
    },
  });

  // プロンプト生成パネルの状態
  const [promptGenOpen, setPromptGenOpen] = useState(false);
  const [promptGenTarget, setPromptGenTarget] = useState("");
  const [promptGenCriteria, setPromptGenCriteria] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [promptGenCopied, setPromptGenCopied] = useState(false);
  const [promptSaveMessage, setPromptSaveMessage] = useState<string | null>(null);

  const savePromptVersionMutation = useMutation({
    mutationFn: (content: string) => {
      const taskName = taskDetailQuery.data?.name ?? "アノテーション";
      return createPromptVersion(projectId, {
        content,
        name: `アノテーション: ${taskName}`,
      });
    },
    onSuccess: (saved) => {
      setPromptSaveMessage(`保存しました（v${saved.version}）`);
    },
    onError: () => {
      setPromptSaveMessage("保存に失敗しました。");
    },
  });

  function handleGeneratePrompt() {
    const labels = sortedLabels;
    const taskName = taskDetailQuery.data?.name ?? "";
    const prompt = generateAnnotationPrompt({
      taskName,
      labels,
      extractionTarget: promptGenTarget.trim(),
      criteria: promptGenCriteria.trim() || undefined,
    });
    setGeneratedPrompt(prompt);
    setPromptSaveMessage(null);
  }

  function handleCopyPrompt() {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt).then(() => {
      setPromptGenCopied(true);
      setTimeout(() => setPromptGenCopied(false), 2000);
    });
  }

  const canCreateTask = newTaskForm.name.trim().length > 0 && !createTaskMutation.isPending;
  const canUpdateTask =
    selectedTaskId !== null && taskForm.name.trim().length > 0 && !updateTaskMutation.isPending;
  const canCreateLabel =
    selectedTaskId !== null &&
    buildLabelKey(newLabelForm.key || newLabelForm.name).length > 0 &&
    !createLabelMutation.isPending;
  const canUpdateLabel =
    editingLabelId !== null &&
    buildLabelKey(editingLabelForm.key || editingLabelForm.name).length > 0 &&
    !updateLabelMutation.isPending;

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Annotation Task Settings</p>
          <h2 className={styles.pageTitle}>アノテーション設定</h2>
          <p className={styles.pageDescription}>
            {project?.name ?? "プロジェクト"} で使う annotation task と label を準備します。
            現在の初期実装では output mode は <code>span_label</code> 固定です。
          </p>
        </div>
        {feedbackMessage && (
          <p className={feedbackTone === "error" ? styles.feedbackError : styles.feedbackSuccess}>
            {feedbackMessage}
          </p>
        )}
      </div>

      <div className={styles.layout}>
        <section className={styles.sidebarSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>タスク一覧</h3>
              <p className={styles.sectionHint}>Review 用に使う task を選択・追加できます。</p>
            </div>
          </div>

          <form
            className={styles.panel}
            onSubmit={(event) => {
              event.preventDefault();
              createTaskMutation.mutate();
            }}
          >
            <label className={styles.fieldLabel} htmlFor="new-task-name">
              新規タスク名
            </label>
            <input
              id="new-task-name"
              className={styles.fieldInput}
              value={newTaskForm.name}
              onChange={(event) =>
                setNewTaskForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="例: 回答品質アノテーション"
            />

            <label className={styles.fieldLabel} htmlFor="new-task-description">
              説明
            </label>
            <textarea
              id="new-task-description"
              className={styles.fieldTextarea}
              value={newTaskForm.description}
              onChange={(event) =>
                setNewTaskForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="任意: この task の目的や判定基準"
              rows={4}
            />

            <div className={styles.outputModeBox}>
              <span className={styles.outputModeLabel}>Output mode</span>
              <strong className={styles.outputModeValue}>span_label</strong>
              <p className={styles.outputModeHint}>初期実装では固定です。</p>
            </div>

            <button type="submit" className={styles.primaryButton} disabled={!canCreateTask}>
              {createTaskMutation.isPending ? "作成中..." : "タスクを追加"}
            </button>
          </form>

          <div className={styles.taskList}>
            {tasksQuery.isLoading && <p className={styles.stateText}>タスクを読み込み中...</p>}
            {tasksQuery.isError && (
              <p className={styles.errorText}>タスク一覧の取得に失敗しました。</p>
            )}
            {!tasksQuery.isLoading && (tasksQuery.data?.length ?? 0) === 0 && (
              <p className={styles.stateText}>
                まだ task はありません。まず 1 件追加してください。
              </p>
            )}
            {(tasksQuery.data ?? []).map((task) => {
              const isSelected = task.id === selectedTaskId;

              return (
                <button
                  key={task.id}
                  type="button"
                  className={isSelected ? styles.taskCardActive : styles.taskCard}
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    setEditingLabelId(null);
                    setEditingLabelForm(emptyLabelForm);
                  }}
                >
                  <span className={styles.taskCardTitle}>{task.name}</span>
                  <span className={styles.taskCardMeta}>ID {task.id}</span>
                  <span className={styles.taskCardMode}>span_label</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.contentSection}>
          {selectedTaskId === null ? (
            <div className={styles.emptyState}>
              <h3 className={styles.sectionTitle}>タスクを選択してください</h3>
              <p className={styles.sectionHint}>
                左側から task を選ぶと、説明や label を編集できます。
              </p>
            </div>
          ) : taskDetailQuery.isLoading ? (
            <div className={styles.emptyState}>
              <p className={styles.stateText}>タスク詳細を読み込み中...</p>
            </div>
          ) : taskDetailQuery.isError || !taskDetailQuery.data ? (
            <div className={styles.emptyState}>
              <p className={styles.errorText}>タスク詳細の取得に失敗しました。</p>
            </div>
          ) : (
            <>
              <form
                className={styles.panel}
                onSubmit={(event) => {
                  event.preventDefault();
                  updateTaskMutation.mutate();
                }}
              >
                <div className={styles.sectionHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>タスク設定</h3>
                    <p className={styles.sectionHint}>
                      Review に使う task 本体の名前と説明を編集します。
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => deleteTaskMutation.mutate()}
                    disabled={deleteTaskMutation.isPending}
                  >
                    {deleteTaskMutation.isPending ? "削除中..." : "タスクを削除"}
                  </button>
                </div>

                <div className={styles.fieldGrid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="task-name">
                      タスク名
                    </label>
                    <input
                      id="task-name"
                      className={styles.fieldInput}
                      value={taskForm.name}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="task-output-mode">
                      Output mode
                    </label>
                    <input
                      id="task-output-mode"
                      className={styles.fieldInput}
                      value="span_label"
                      disabled
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="task-description">
                    説明
                  </label>
                  <textarea
                    id="task-description"
                    className={styles.fieldTextarea}
                    value={taskForm.description}
                    onChange={(event) =>
                      setTaskForm((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={5}
                    placeholder="任意: アノテーション方針やラベルの使い分けを記載"
                  />
                </div>

                <div className={styles.formFooter}>
                  <button type="submit" className={styles.primaryButton} disabled={!canUpdateTask}>
                    {updateTaskMutation.isPending ? "保存中..." : "タスク設定を保存"}
                  </button>
                </div>
              </form>

              <div className={styles.labelSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>ラベル設定</h3>
                    <p className={styles.sectionHint}>
                      表示名、内部 key、色、表示順を UI から管理できます。
                    </p>
                  </div>
                </div>

                <form
                  className={styles.panel}
                  onSubmit={(event) => {
                    event.preventDefault();
                    createLabelMutation.mutate();
                  }}
                >
                  <div className={styles.fieldGrid}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="new-label-key">
                        分類ラベル
                        <span className={styles.requiredMark}>必須</span>
                      </label>
                      <input
                        id="new-label-key"
                        className={styles.fieldInput}
                        value={newLabelForm.key}
                        onChange={(event) =>
                          setNewLabelForm((current) => ({ ...current, key: event.target.value }))
                        }
                        placeholder="例: missing_evidence"
                      />
                      <p className={styles.fieldHint}>未入力なら表示名から自動生成します。</p>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="new-label-name">
                        表示名
                      </label>
                      <input
                        id="new-label-name"
                        className={styles.fieldInput}
                        value={newLabelForm.name}
                        onChange={(event) =>
                          setNewLabelForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="未入力なら分類ラベルをそのまま使います"
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="new-label-color">
                        色
                      </label>
                      <div className={styles.colorFieldRow}>
                        <input
                          id="new-label-color"
                          className={styles.fieldInput}
                          value={newLabelForm.color}
                          onChange={(event) =>
                            setNewLabelForm((current) => ({
                              ...current,
                              color: event.target.value,
                            }))
                          }
                          placeholder="#ff7a59"
                        />
                        <span
                          className={styles.colorChip}
                          style={{ backgroundColor: buildLabelPreviewColor(newLabelForm) }}
                          aria-label="色プレビュー"
                        />
                      </div>
                      <p className={styles.fieldHint}>未入力なら自動で設定します。</p>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="new-label-order">
                        並び順
                      </label>
                      <input
                        id="new-label-order"
                        className={styles.fieldInput}
                        type="number"
                        value={newLabelForm.displayOrder}
                        onChange={(event) =>
                          setNewLabelForm((current) => ({
                            ...current,
                            displayOrder: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className={styles.formFooter}>
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={!canCreateLabel}
                    >
                      {createLabelMutation.isPending ? "追加中..." : "ラベルを追加"}
                    </button>
                  </div>
                </form>

                <div className={styles.labelList}>
                  {sortedLabels.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p className={styles.stateText}>
                        まだ label はありません。Review で選びたいラベルを追加してください。
                      </p>
                    </div>
                  ) : (
                    sortedLabels.map((label) => {
                      const isEditing = label.id === editingLabelId;
                      const currentForm = isEditing ? editingLabelForm : buildLabelForm(label);

                      return (
                        <form
                          key={label.id}
                          className={styles.labelCard}
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!isEditing) {
                              setEditingLabelId(label.id);
                              setEditingLabelForm(buildLabelForm(label));
                              return;
                            }
                            updateLabelMutation.mutate();
                          }}
                        >
                          <div className={styles.labelCardHeader}>
                            <div>
                              <h4 className={styles.labelTitle}>{label.name}</h4>
                              <p className={styles.labelMeta}>
                                key: <code>{label.key}</code>
                              </p>
                            </div>
                            <div className={styles.labelActions}>
                              {!isEditing ? (
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => {
                                    setEditingLabelId(label.id);
                                    setEditingLabelForm(buildLabelForm(label));
                                  }}
                                >
                                  編集
                                </button>
                              ) : (
                                <button
                                  type="submit"
                                  className={styles.secondaryButton}
                                  disabled={!canUpdateLabel}
                                >
                                  {updateLabelMutation.isPending ? "保存中..." : "保存"}
                                </button>
                              )}
                              <button
                                type="button"
                                className={styles.dangerButton}
                                onClick={() => deleteLabelMutation.mutate(label.id)}
                                disabled={deleteLabelMutation.isPending}
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          <div className={styles.fieldGrid}>
                            <div className={styles.fieldGroup}>
                              <label htmlFor="label-key-input" className={styles.fieldLabel}>
                                分類ラベル
                                <span className={styles.requiredMark}>必須</span>
                              </label>
                              <input
                                id="label-key-input"
                                className={styles.fieldInput}
                                value={currentForm.key}
                                disabled={!isEditing}
                                onChange={(event) =>
                                  setEditingLabelForm((current) => ({
                                    ...current,
                                    key: event.target.value,
                                  }))
                                }
                              />
                              {isEditing && (
                                <p className={styles.fieldHint}>
                                  未入力なら表示名から自動生成します。
                                </p>
                              )}
                            </div>

                            <div className={styles.fieldGroup}>
                              <label htmlFor="label-name-input" className={styles.fieldLabel}>
                                表示名
                              </label>
                              <input
                                id="label-name-input"
                                className={styles.fieldInput}
                                value={currentForm.name}
                                disabled={!isEditing}
                                onChange={(event) =>
                                  setEditingLabelForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div className={styles.fieldGroup}>
                              <label htmlFor="label-color-input" className={styles.fieldLabel}>
                                色
                              </label>
                              <div className={styles.colorFieldRow}>
                                <input
                                  id="label-color-input"
                                  className={styles.fieldInput}
                                  value={currentForm.color}
                                  disabled={!isEditing}
                                  onChange={(event) =>
                                    setEditingLabelForm((current) => ({
                                      ...current,
                                      color: event.target.value,
                                    }))
                                  }
                                />
                                <span
                                  className={styles.colorChip}
                                  style={{ backgroundColor: buildLabelPreviewColor(currentForm) }}
                                  aria-label="色プレビュー"
                                />
                              </div>
                              <p className={styles.fieldHint}>未入力なら自動で設定します。</p>
                            </div>

                            <div className={styles.fieldGroup}>
                              <label htmlFor="label-order-input" className={styles.fieldLabel}>
                                並び順
                              </label>
                              <input
                                id="label-order-input"
                                className={styles.fieldInput}
                                type="number"
                                value={currentForm.displayOrder}
                                disabled={!isEditing}
                                onChange={(event) =>
                                  setEditingLabelForm((current) => ({
                                    ...current,
                                    displayOrder: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          {isEditing && (
                            <div className={styles.formFooter}>
                              <button
                                type="button"
                                className={styles.ghostButton}
                                onClick={() => {
                                  setEditingLabelId(null);
                                  setEditingLabelForm(emptyLabelForm);
                                }}
                              >
                                キャンセル
                              </button>
                            </div>
                          )}
                        </form>
                      );
                    })
                  )}
                </div>
              </div>

              {/* プロンプト生成パネル */}
              <div className={styles.promptGenSection}>
                <button
                  type="button"
                  className={styles.promptGenToggle}
                  onClick={() => setPromptGenOpen((prev) => !prev)}
                  aria-expanded={promptGenOpen}
                >
                  {promptGenOpen
                    ? "▲ アノテーション用プロンプトを閉じる"
                    : "▼ アノテーション用プロンプトを生成"}
                </button>

                {promptGenOpen && (
                  <div className={styles.promptGenPanel}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="prompt-gen-target">
                        抽出対象
                        <span className={styles.requiredMark}>必須</span>
                      </label>
                      <input
                        id="prompt-gen-target"
                        className={styles.fieldInput}
                        value={promptGenTarget}
                        onChange={(e) => setPromptGenTarget(e.target.value)}
                        placeholder="例: AIとの会話ログ、学習メモ、議事録"
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="prompt-gen-criteria">
                        抽出判定条件の詳細（任意）
                      </label>
                      <textarea
                        id="prompt-gen-criteria"
                        className={styles.fieldTextarea}
                        value={promptGenCriteria}
                        onChange={(e) => setPromptGenCriteria(e.target.value)}
                        placeholder="例: アイデアとは新しい発見や方針転換を含む記述を指す"
                        rows={3}
                      />
                    </div>

                    <div className={styles.formFooter}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={handleGeneratePrompt}
                        disabled={!promptGenTarget.trim() || sortedLabels.length === 0}
                      >
                        生成
                      </button>
                      {sortedLabels.length === 0 && (
                        <p className={styles.fieldHint}>
                          ラベルを追加するとプロンプトを生成できます。
                        </p>
                      )}
                    </div>

                    {generatedPrompt !== null && (
                      <div className={styles.promptGenResult}>
                        <textarea
                          readOnly
                          className={styles.promptGenTextarea}
                          value={generatedPrompt}
                          rows={14}
                        />
                        <div className={styles.formFooter}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={handleCopyPrompt}
                          >
                            {promptGenCopied ? "✓ コピー済み" : "コピー"}
                          </button>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => savePromptVersionMutation.mutate(generatedPrompt)}
                            disabled={savePromptVersionMutation.isPending}
                          >
                            {savePromptVersionMutation.isPending
                              ? "保存中..."
                              : "プロンプトバージョンとして保存"}
                          </button>
                          {promptSaveMessage && (
                            <p
                              className={
                                savePromptVersionMutation.isError
                                  ? styles.feedbackError
                                  : styles.feedbackSuccess
                              }
                            >
                              {promptSaveMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
