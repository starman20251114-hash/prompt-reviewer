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
import {
  type ContextAssetDetail,
  type ContextAssetFilters,
  type ContextAssetSummary,
  type Project,
  createContextAsset,
  deleteContextAsset,
  getContextAsset,
  getContextAssets,
  getProjects,
  setContextAssetProjects,
  updateContextAsset,
} from "../lib/api";
import { getStoredActiveLabelId } from "../lib/useActiveLabel";
import styles from "./ContextAssetsPage.module.css";

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

function getContentSize(content: string): number {
  return new TextEncoder().encode(content).length;
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

type CreateFormState = {
  name: string;
  path: string;
  content: string;
  mime_type: string;
};

const EMPTY_CREATE_FORM: CreateFormState = {
  name: "",
  path: "",
  content: "",
  mime_type: "text/plain",
};

export function ContextAssetsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [draftMimeType, setDraftMimeType] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [filters, setFilters] = useState<ContextAssetFilters>(() => {
    const activeId = getStoredActiveLabelId();
    return activeId !== null ? { project_id: activeId } : {};
  });
  const [searchInput, setSearchInput] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const assetsQuery = useQuery({
    queryKey: ["context-assets", filters],
    queryFn: () => getContextAssets(filters),
  });

  const selectedDetailQuery = useQuery({
    queryKey: ["context-asset", selectedId],
    queryFn: () => {
      if (selectedId === null) throw new Error("id is required");
      return getContextAsset(selectedId);
    },
    enabled: selectedId !== null,
  });

  useEffect(() => {
    const assets = assetsQuery.data ?? [];
    if (assets.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !assets.some((a) => a.id === selectedId)) {
      setSelectedId(assets[0]?.id ?? null);
    }
  }, [assetsQuery.data, selectedId]);

  useEffect(() => {
    const detail = selectedDetailQuery.data;
    if (detail) {
      setDraftContent(detail.content);
      setDraftName(detail.name);
      setDraftPath(detail.path);
      setDraftMimeType(detail.mime_type);
      setSelectedProjectIds(detail.project_ids);
    }
  }, [selectedDetailQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      return createContextAsset({
        name: file.name,
        path: file.webkitRelativePath || file.name,
        content,
        mime_type: file.type || "text/plain",
      });
    },
    onSuccess: (created) => {
      setStatusMessage(`取り込みました: ${created.name}`);
      void queryClient.invalidateQueries({ queryKey: ["context-assets"] });
      setSelectedId(created.id);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createContextAsset({
        name: createForm.name,
        path: createForm.path,
        content: createForm.content,
        mime_type: createForm.mime_type,
      }),
    onSuccess: (created) => {
      setStatusMessage(`作成しました: ${created.name}`);
      setShowCreateForm(false);
      setCreateForm(EMPTY_CREATE_FORM);
      void queryClient.invalidateQueries({ queryKey: ["context-assets"] });
      setSelectedId(created.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedId === null) throw new Error("selectedId is required");
      return updateContextAsset(selectedId, {
        content: draftContent,
        name: draftName,
        path: draftPath,
        mime_type: draftMimeType,
      });
    },
    onSuccess: (updated) => {
      setStatusMessage(`保存しました: ${updated.name}`);
      void queryClient.invalidateQueries({ queryKey: ["context-assets"] });
      void queryClient.invalidateQueries({ queryKey: ["context-asset", selectedId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteContextAsset(id),
    onSuccess: () => {
      setStatusMessage("削除しました");
      setDeleteConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["context-assets"] });
      setSelectedId(null);
    },
  });

  const setProjectsMutation = useMutation({
    mutationFn: (projectIds: number[]) => {
      if (selectedId === null) throw new Error("selectedId is required");
      return setContextAssetProjects(selectedId, { project_ids: projectIds });
    },
    onSuccess: () => {
      setStatusMessage("プロジェクト割り当てを更新しました");
      void queryClient.invalidateQueries({ queryKey: ["context-asset", selectedId] });
    },
  });

  const selectedDetail: ContextAssetDetail | undefined = selectedDetailQuery.data;
  const selectedSummary: ContextAssetSummary | undefined = (assetsQuery.data ?? []).find(
    (a) => a.id === selectedId,
  );

  const isDetailDirty =
    selectedDetail !== undefined &&
    (draftContent !== selectedDetail.content ||
      draftName !== selectedDetail.name ||
      draftPath !== selectedDetail.path ||
      draftMimeType !== selectedDetail.mime_type);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      setFilters((prev) => ({ ...prev, q: searchInput || undefined }));
    }
  }

  function handleProjectFilterChange(projectId: number) {
    setFilters((prev) => ({
      ...prev,
      unclassified: undefined,
      project_id: prev.project_id === projectId ? undefined : projectId,
    }));
  }

  function handleUnclassifiedToggle() {
    setFilters((prev) => ({
      ...prev,
      project_id: undefined,
      unclassified: prev.unclassified ? undefined : true,
    }));
  }

  function handleProjectAssignToggle(projectId: number) {
    const next = selectedProjectIds.includes(projectId)
      ? selectedProjectIds.filter((id) => id !== projectId)
      : [...selectedProjectIds, projectId];
    setSelectedProjectIds(next);
    setProjectsMutation.mutate(next);
  }

  function handleSelectAsset(id: number) {
    setStatusMessage(null);
    setDeleteConfirmId(null);
    setSelectedId(id);
  }

  async function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setStatusMessage(null);
    const results = await Promise.all(files.map((f) => uploadMutation.mutateAsync(f)));
    const last = results[results.length - 1];
    if (last) setSelectedId(last.id);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const projects: Project[] = projectsQuery.data ?? [];

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>コンテキスト素材</h2>
          <p className={styles.pageDescription}>グローバルなコンテキスト素材を管理します。</p>
        </div>
        <div className={styles.headerActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.sql,.css,.html,.yml,.yaml"
            multiple
            className={styles.fileInput}
            onChange={(e) => {
              void handleFileSelection(e);
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
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((v) => !v);
              setStatusMessage(null);
            }}
            className={styles.btnSecondary}
          >
            {showCreateForm ? "キャンセル" : "テキストで作成"}
          </button>
        </div>
      </div>

      {statusMessage && <p className={styles.statusMessage}>{statusMessage}</p>}

      {showCreateForm && (
        <div className={styles.createForm}>
          <div className={styles.createFormRow}>
            <label className={styles.createFormLabel}>
              名前
              <input
                type="text"
                className={styles.textInput}
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例: system-prompt.md"
              />
            </label>
            <label className={styles.createFormLabel}>
              パス
              <input
                type="text"
                className={styles.textInput}
                value={createForm.path}
                onChange={(e) => setCreateForm((f) => ({ ...f, path: e.target.value }))}
                placeholder="例: docs/system-prompt.md"
              />
            </label>
            <label className={styles.createFormLabel}>
              MIMEタイプ
              <input
                type="text"
                className={styles.textInput}
                value={createForm.mime_type}
                onChange={(e) => setCreateForm((f) => ({ ...f, mime_type: e.target.value }))}
                placeholder="例: text/plain"
              />
            </label>
          </div>
          <label className={styles.createFormLabel}>
            内容
            <textarea
              className={styles.textareaInput}
              rows={6}
              value={createForm.content}
              onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="素材の内容を入力してください"
            />
          </label>
          <div className={styles.createFormActions}>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!createForm.name || !createForm.path || createMutation.isPending}
              className={`${styles.btnPrimary} ${!createForm.name || !createForm.path || createMutation.isPending ? styles.btnDisabled : ""}`}
            >
              {createMutation.isPending ? "作成中..." : "作成"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.filterBar}>
        <input
          type="text"
          className={styles.textInput}
          placeholder="名前・パスで検索（Enter で確定）"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          type="button"
          onClick={handleUnclassifiedToggle}
          className={`${styles.filterToggle} ${filters.unclassified ? styles.filterToggleActive : ""}`}
        >
          未分類のみ
        </button>
        <div className={styles.projectFilterList}>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProjectFilterChange(p.id)}
              className={`${styles.projectBadge} ${filters.project_id === p.id ? styles.projectBadgeActive : ""}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.sidebar}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>素材一覧</span>
            <span className={styles.badge}>{assetsQuery.data?.length ?? 0} 件</span>
          </div>
          {assetsQuery.isLoading && <p className={styles.panelStatus}>読み込み中...</p>}
          {assetsQuery.isError && <p className={styles.panelError}>一覧の取得に失敗しました。</p>}
          {!assetsQuery.isLoading &&
            !assetsQuery.isError &&
            (assetsQuery.data?.length ?? 0) === 0 && (
              <div className={styles.emptyState}>
                素材がありません。
                <br />
                上部の「新規作成」から追加してください。
              </div>
            )}
          <div className={styles.fileList}>
            {(assetsQuery.data ?? []).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => handleSelectAsset(asset.id)}
                className={`${styles.fileItem} ${selectedId === asset.id ? styles.fileItemActive : ""}`}
              >
                <span className={styles.fileName}>{asset.name}</span>
                <span className={styles.filePath}>{asset.path}</span>
                <span className={styles.fileMeta}>
                  {asset.mime_type} / {formatDate(asset.updated_at)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.viewerPanel}>
          {!selectedId && <div className={styles.emptyViewer}>左から素材を選択してください。</div>}

          {selectedId && selectedDetailQuery.isLoading && (
            <div className={styles.emptyViewer}>内容を読み込み中...</div>
          )}

          {selectedId && selectedDetailQuery.isError && (
            <div className={styles.emptyViewerError}>内容の読み込みに失敗しました。</div>
          )}

          {selectedId && selectedDetail && (
            <>
              <div className={styles.panelHeader}>
                <div className={styles.detailMeta}>
                  <div className={styles.detailMetaRow}>
                    <label htmlFor="detail-name" className={styles.metaLabel}>
                      名前
                    </label>
                    <input
                      id="detail-name"
                      type="text"
                      className={styles.textInput}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                  </div>
                  <div className={styles.detailMetaRow}>
                    <label htmlFor="detail-path" className={styles.metaLabel}>
                      パス
                    </label>
                    <input
                      id="detail-path"
                      type="text"
                      className={styles.textInput}
                      value={draftPath}
                      onChange={(e) => setDraftPath(e.target.value)}
                    />
                  </div>
                  <div className={styles.detailMetaRow}>
                    <label htmlFor="detail-mime" className={styles.metaLabel}>
                      MIMEタイプ
                    </label>
                    <input
                      id="detail-mime"
                      type="text"
                      className={styles.textInput}
                      value={draftMimeType}
                      onChange={(e) => setDraftMimeType(e.target.value)}
                    />
                  </div>
                  {selectedSummary && (
                    <p className={styles.panelSubtitle}>
                      {formatBytes(getContentSize(selectedDetail.content))} / 更新:{" "}
                      {formatDate(selectedSummary.updated_at)}
                    </p>
                  )}
                </div>
                <div className={styles.panelActions}>
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={!isDetailDirty || saveMutation.isPending}
                    className={`${styles.btnSave} ${!isDetailDirty || saveMutation.isPending ? styles.btnDisabled : ""}`}
                  >
                    {saveMutation.isPending ? "保存中..." : "保存"}
                  </button>
                  {deleteConfirmId === selectedId ? (
                    <div className={styles.deleteConfirm}>
                      <span className={styles.deleteConfirmText}>本当に削除しますか？</span>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(selectedId)}
                        disabled={deleteMutation.isPending}
                        className={styles.btnDanger}
                      >
                        {deleteMutation.isPending ? "削除中..." : "削除"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className={styles.btnCancel}
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(selectedId)}
                      className={styles.btnDanger}
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.projectAssignSection}>
                <p className={styles.projectAssignTitle}>プロジェクト割り当て</p>
                <div className={styles.projectAssignList}>
                  {projects.length === 0 && (
                    <span className={styles.noProjects}>プロジェクトがありません</span>
                  )}
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProjectAssignToggle(p.id)}
                      className={`${styles.projectBadge} ${selectedProjectIds.includes(p.id) ? styles.projectBadgeActive : ""}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.editorArea}>
                <CodeMirror
                  value={draftContent}
                  height="100%"
                  theme="dark"
                  extensions={getLanguageExtensions(draftPath)}
                  onChange={(value) => setDraftContent(value)}
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLine: true,
                    foldGutter: true,
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
