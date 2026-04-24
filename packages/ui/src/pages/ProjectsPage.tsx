import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  type Project,
  createProject,
  deleteProject,
  getProjects,
  updateProject,
} from "../lib/api";
import { useActiveLabel } from "../lib/useActiveLabel";
import styles from "./ProjectsPage.module.css";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type LabelFormModalProps = {
  initial?: { name: string; description: string };
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string }) => void;
  isLoading: boolean;
};

function LabelFormModal({
  initial,
  title,
  submitLabel,
  onClose,
  onSubmit,
  isLoading,
}: LabelFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() || undefined });
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
      <div className={styles.modalBox}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.formField}>
            <label htmlFor="label-name" className={styles.label}>
              ラベル名<span className={styles.required}>*</span>
            </label>
            <input
              id="label-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 顧客サポートBot"
              className={styles.input}
            />
          </div>
          <div className={styles.formFieldLast}>
            <label htmlFor="label-description" className={styles.label}>
              説明（任意）
            </label>
            <textarea
              id="label-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ラベルの用途や目的を記入..."
              rows={3}
              className={styles.textarea}
            />
          </div>
          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className={styles.submitButton}
            >
              {isLoading ? "保存中..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type DeleteDialogProps = {
  project: Project;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
};

function DeleteDialog({ project, onClose, onConfirm, isLoading }: DeleteDialogProps) {
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
      <div className={styles.modalBox}>
        <h3 className={styles.modalTitle}>ラベルを削除</h3>
        <p className={styles.deleteWarning}>以下のラベルを削除してもよいですか？</p>
        <p className={styles.deleteTarget}>{project.name}</p>
        <p className={styles.deleteNote}>
          この操作は取り消せません。関連するテストケースやプロンプトとの紐付けも解除されます。
        </p>
        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose} className={styles.cancelButton}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={styles.dangerButton}
          >
            {isLoading ? "削除中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

type LabelRowProps = {
  project: Project;
  isActive: boolean;
  onSelect: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
};

function LabelRow({ project, isActive, onSelect, onEdit, onDelete }: LabelRowProps) {
  return (
    <div
      className={`${styles.labelRow} ${isActive ? styles.labelRowActive : ""}`}
      onClick={() => onSelect(project)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(project)}
      role="button"
      tabIndex={0}
    >
      <span className={`${styles.labelTag} ${isActive ? styles.labelTagActive : ""}`}>
        {project.name}
      </span>
      {isActive && <span className={styles.activeBadge}>絞り込み中</span>}
      {project.description && (
        <span className={styles.labelDescription}>{project.description}</span>
      )}
      <span className={styles.labelDate}>{formatDate(project.created_at)}</span>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          className={styles.editButton}
        >
          編集
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
          className={styles.deleteButton}
        >
          削除
        </button>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { activeLabelId, setActiveLabelId } = useActiveLabel();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  function handleSelectLabel(project: Project) {
    setActiveLabelId(activeLabelId === project.id ? null : project.id);
  }

  const {
    data: projects,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string } }) =>
      updateProject(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.title}>ラベル管理</h2>
        <button type="button" onClick={() => setIsCreateOpen(true)} className={styles.createButton}>
          + 新規ラベル作成
        </button>
      </div>

      <p className={styles.description}>
        プロジェクトラベルを管理します。ラベルをクリックして選択すると、テストケース・プロンプト・コンテキスト素材のページでそのラベルで絞り込まれます。再クリックで解除できます。
      </p>

      {isLoading && <p className={styles.loadingText}>読み込み中...</p>}

      {isError && (
        <p className={styles.errorText}>
          エラーが発生しました: {error instanceof Error ? error.message : "不明なエラー"}
        </p>
      )}

      {!isLoading && !isError && projects && projects.length === 0 && (
        <div className={styles.emptyState}>
          <p style={{ fontSize: "16px" }}>ラベルがまだありません</p>
          <p style={{ fontSize: "14px" }}>「新規ラベル作成」ボタンから最初のラベルを作成してください。</p>
        </div>
      )}

      {activeLabelId !== null && (
        <p className={styles.activeHint}>
          ラベルを選択中です。テストケース・プロンプト・コンテキスト素材のページでこのラベルで絞り込まれます。同じラベルを再クリックすると解除できます。
        </p>
      )}

      {!isLoading && !isError && projects && projects.length > 0 && (
        <div className={styles.labelList}>
          {projects.map((project) => (
            <LabelRow
              key={project.id}
              project={project}
              isActive={activeLabelId === project.id}
              onSelect={handleSelectLabel}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {isCreateOpen && (
        <LabelFormModal
          title="新規ラベル作成"
          submitLabel="作成"
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {editTarget && (
        <LabelFormModal
          title="ラベルを編集"
          submitLabel="保存"
          initial={{ name: editTarget.name, description: editTarget.description ?? "" }}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editTarget.id, data })}
          isLoading={updateMutation.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
