import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  type ContextFileSummary,
  getContextFile,
  getContextFiles,
  getProject,
  updateContextFile,
  uploadContextFile,
} from "../lib/api";
import styles from "./ContextFilesPage.module.css";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getLanguageExtensions(filePath: string) {
  const lowerPath = filePath.toLowerCase();
  const baseExtensions = [EditorView.lineWrapping];
  if (
    lowerPath.endsWith(".ts") ||
    lowerPath.endsWith(".tsx") ||
    lowerPath.endsWith(".js") ||
    lowerPath.endsWith(".jsx")
  ) {
    return [
      ...baseExtensions,
      javascript({
        jsx: lowerPath.endsWith("x"),
        typescript: lowerPath.endsWith(".ts") || lowerPath.endsWith(".tsx"),
      }),
    ];
  }
  if (lowerPath.endsWith(".json")) return [...baseExtensions, json()];
  if (lowerPath.endsWith(".md")) return [...baseExtensions, markdown()];
  if (lowerPath.endsWith(".py")) return [...baseExtensions, python()];
  if (lowerPath.endsWith(".sql")) return [...baseExtensions, sql()];
  if (lowerPath.endsWith(".css")) return [...baseExtensions, css()];
  if (lowerPath.endsWith(".html")) return [...baseExtensions, html()];
  return baseExtensions;
}

export function ContextFilesPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const filesQuery = useQuery({
    queryKey: ["context-files", projectId],
    queryFn: () => getContextFiles(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const selectedFileDetailQuery = useQuery({
    queryKey: ["context-file", projectId, selectedPath],
    queryFn: () => {
      if (!selectedPath) {
        throw new Error("path is required");
      }
      return getContextFile(projectId, selectedPath);
    },
    enabled: !Number.isNaN(projectId) && selectedPath !== null,
  });

  useEffect(() => {
    const files = filesQuery.data ?? [];
    if (files.length === 0) {
      setSelectedPath(null);
      return;
    }

    if (!selectedPath || !files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0]?.path ?? null);
    }
  }, [filesQuery.data, selectedPath]);

  useEffect(() => {
    if (selectedFileDetailQuery.data) {
      setDraftContent(selectedFileDetailQuery.data.content);
    }
  }, [selectedFileDetailQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      return uploadContextFile(projectId, {
        file_name: file.webkitRelativePath || file.name,
        content,
        mime_type: file.type || undefined,
      });
    },
    onSuccess: (created) => {
      setStatusMessage(`取り込みました: ${created.path}`);
      void queryClient.invalidateQueries({ queryKey: ["context-files", projectId] });
      setSelectedPath(created.path);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedPath) throw new Error("selectedPath is required");
      return updateContextFile(projectId, selectedPath, { content: draftContent });
    },
    onSuccess: (updated) => {
      setStatusMessage(`保存しました: ${updated.path}`);
      void queryClient.invalidateQueries({ queryKey: ["context-files", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["context-file", projectId, updated.path] });
    },
  });

  const selectedSummary: ContextFileSummary | undefined = (filesQuery.data ?? []).find(
    (file) => file.path === selectedPath,
  );
  const selectedDetail = selectedFileDetailQuery.data;
  const isDirty = selectedDetail ? draftContent !== selectedDetail.content : false;

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setStatusMessage(null);
    const uploaded = await Promise.all(files.map((file) => uploadMutation.mutateAsync(file)));
    const lastUploaded = uploaded[uploaded.length - 1];
    if (lastUploaded) {
      setSelectedPath(lastUploaded.path);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>コンテキスト管理</h2>
          <p className={styles.pageDescription}>
            {project
              ? `${project.name} の参照用スナップショットを管理します。`
              : "参照用スナップショットを管理します。"}
          </p>
        </div>
        <div className={styles.headerActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.sql,.css,.html,.yml,.yaml"
            multiple
            className={styles.fileInput}
            onChange={(event) => {
              void handleFileSelection(event);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={styles.btnPrimary}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "取込中..." : "ファイルを取り込む"}
          </button>
        </div>
      </div>

      {statusMessage && <p className={styles.statusMessage}>{statusMessage}</p>}

      <div className={styles.layout}>
        <section className={styles.sidebar}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>ファイル一覧</span>
            <span className={styles.badge}>{filesQuery.data?.length ?? 0} 件</span>
          </div>
          {filesQuery.isLoading && <p className={styles.panelStatus}>読み込み中...</p>}
          {filesQuery.isError && <p className={styles.panelError}>一覧の取得に失敗しました。</p>}
          {!filesQuery.isLoading && !filesQuery.isError && (filesQuery.data?.length ?? 0) === 0 && (
            <div className={styles.emptyState}>
              まだファイルがありません。
              <br />
              上部のボタンからテキストファイルを取り込んでください。
            </div>
          )}
          <div className={styles.fileList}>
            {(filesQuery.data ?? []).map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setSelectedPath(file.path);
                }}
                className={`${styles.fileItem} ${selectedPath === file.path ? styles.fileItemActive : ""}`}
              >
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.filePath}>{file.path}</span>
                <span className={styles.fileMeta}>
                  {formatBytes(file.size)} / {formatDate(file.updated_at)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.viewerPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelTitle}>
                {selectedSummary ? selectedSummary.path : "ファイル未選択"}
              </span>
              {selectedSummary && (
                <p className={styles.panelSubtitle}>
                  {selectedSummary.mime_type} / {formatBytes(selectedSummary.size)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!selectedPath || !isDirty || saveMutation.isPending}
              className={`${styles.btnSave} ${!selectedPath || !isDirty || saveMutation.isPending ? styles.btnDisabled : ""}`}
            >
              {saveMutation.isPending ? "保存中..." : "保存"}
            </button>
          </div>

          {!selectedPath && (
            <div className={styles.emptyViewer}>左からファイルを選択してください。</div>
          )}

          {selectedPath && selectedFileDetailQuery.isLoading && (
            <div className={styles.emptyViewer}>内容を読み込み中...</div>
          )}

          {selectedPath && selectedFileDetailQuery.isError && (
            <div className={styles.emptyViewerError}>内容の読み込みに失敗しました。</div>
          )}

          {selectedPath && selectedDetail && (
            <div className={styles.editorArea}>
              <CodeMirror
                value={draftContent}
                height="70vh"
                theme="dark"
                extensions={getLanguageExtensions(selectedDetail.path)}
                onChange={(value) => setDraftContent(value)}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  foldGutter: true,
                }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
