import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { type Project, createProject, deleteProject, getProjects } from "../lib/api";

const colors = {
  bg: "#1e1e2e",
  card: "#313244",
  border: "#45475a",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  accent: "#cba6f7",
  danger: "#f38ba8",
  overlay: "#181825",
  surface: "#45475a",
  muted: "#6c7086",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type CreateModalProps = {
  onClose: () => void;
  onSubmit: (data: { name: string; description?: string }) => void;
  isLoading: boolean;
};

function CreateModal({ onClose, onSubmit, isLoading }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: colors.overlay,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          padding: "28px",
          width: "480px",
          maxWidth: "90vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 20px",
            fontSize: "18px",
            color: colors.text,
          }}
        >
          新規プロジェクト作成
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="create-project-name"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "14px",
                color: colors.subtext,
              }}
            >
              プロジェクト名
              <span style={{ color: colors.danger, marginLeft: "4px" }}>*</span>
            </label>
            <input
              id="create-project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 顧客サポートBot"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="create-project-description"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "14px",
                color: colors.subtext,
              }}
            >
              説明（任意）
            </label>
            <textarea
              id="create-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="プロジェクトの目的や概要を記入..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 20px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                color: colors.subtext,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              style={{
                padding: "8px 20px",
                background: colors.accent,
                border: "none",
                borderRadius: "8px",
                color: colors.overlay,
                fontSize: "14px",
                fontWeight: 600,
                cursor: !name.trim() || isLoading ? "not-allowed" : "pointer",
                opacity: !name.trim() || isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? "作成中..." : "作成"}
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          background: colors.overlay,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          padding: "28px",
          width: "420px",
          maxWidth: "90vw",
        }}
      >
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: "18px",
            color: colors.text,
          }}
        >
          プロジェクトを削除
        </h3>
        <p style={{ margin: "0 0 8px", color: colors.subtext, fontSize: "14px" }}>
          以下のプロジェクトを削除してもよいですか？
        </p>
        <p
          style={{
            margin: "0 0 20px",
            color: colors.text,
            fontWeight: 600,
            fontSize: "15px",
            padding: "8px 12px",
            background: colors.card,
            borderRadius: "6px",
          }}
        >
          {project.name}
        </p>
        <p style={{ margin: "0 0 24px", color: colors.danger, fontSize: "13px" }}>
          この操作は取り消せません。関連するテストケースやプロンプトもすべて削除されます。
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              color: colors.subtext,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: "8px 20px",
              background: colors.danger,
              border: "none",
              borderRadius: "8px",
              color: colors.overlay,
              fontSize: "14px",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? "削除中..." : "削除する"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ProjectCardProps = {
  project: Project;
  onDelete: (project: Project) => void;
};

function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
      }}
      onClick={() => navigate(`/projects/${project.id}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accent;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = colors.border;
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 600,
            color: colors.text,
            wordBreak: "break-word",
          }}
        >
          {project.name}
        </h3>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
          style={{
            flexShrink: 0,
            padding: "4px 10px",
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: "6px",
            color: colors.danger,
            fontSize: "12px",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(243,139,168,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          削除
        </button>
      </div>
      {project.description && (
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: colors.subtext,
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {project.description}
        </p>
      )}
      <p
        style={{
          margin: 0,
          fontSize: "12px",
          color: colors.muted,
          marginTop: "4px",
        }}
      >
        作成日: {formatDate(project.created_at)}
      </p>
    </button>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "20px", color: colors.text }}>プロジェクト一覧</h2>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          style={{
            padding: "8px 18px",
            background: colors.accent,
            border: "none",
            borderRadius: "8px",
            color: colors.overlay,
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + 新規作成
        </button>
      </div>

      <p style={{ color: colors.subtext, marginBottom: "24px", margin: "0 0 24px" }}>
        システムプロンプトを管理するプロジェクトを選択してください。
      </p>

      {isLoading && (
        <p style={{ color: colors.muted, textAlign: "center", padding: "40px 0" }}>読み込み中...</p>
      )}

      {isError && (
        <p style={{ color: colors.danger, textAlign: "center", padding: "40px 0" }}>
          エラーが発生しました: {error instanceof Error ? error.message : "不明なエラー"}
        </p>
      )}

      {!isLoading && !isError && projects && projects.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: colors.muted,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: "16px" }}>プロジェクトがまだありません</p>
          <p style={{ margin: 0, fontSize: "14px" }}>
            「新規作成」ボタンから最初のプロジェクトを作成してください。
          </p>
        </div>
      )}

      {!isLoading && !isError && projects && projects.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {isCreateOpen && (
        <CreateModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
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
