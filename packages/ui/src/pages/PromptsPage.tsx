import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  type PromptVersion,
  branchPromptVersion,
  createPromptVersion,
  getProject,
  getPromptVersions,
  updatePromptVersion,
} from "../lib/api";

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
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
};

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

// ツリー接続線を構築するためのヘルパー
function buildConnectorFlags(flatNodes: VersionTreeNode[]): boolean[][] {
  // 各ノードのdepthごとに「まだ下に兄弟がいるか」を追跡
  const flags: boolean[][] = flatNodes.map(() => []);

  for (let i = 0; i < flatNodes.length; i++) {
    const node = flatNodes[i];
    const depthFlags: boolean[] = [];

    for (let d = 0; d < node.depth; d++) {
      // depth d において、このノードより後ろに同じ深さ(または浅い深さで分岐が続く)ノードがあるか
      let hasMore = false;
      for (let j = i + 1; j < flatNodes.length; j++) {
        if (flatNodes[j].depth <= d) {
          break;
        }
        if (
          flatNodes[j].depth === d + 1 &&
          flatNodes[j].version.parent_version_id === flatNodes[i].version.parent_version_id
        ) {
          // 同じ親を持つ兄弟が後ろにいるか確認
        }
        if (flatNodes[j].depth === d) {
          hasMore = true;
          break;
        }
      }
      depthFlags.push(hasMore);
    }
    flags[i] = depthFlags;
  }
  return flags;
}

// 各ノードについて、そのdepth位置に縦線を引くかどうかを判断
function computeVerticalLines(flatNodes: VersionTreeNode[]): boolean[][] {
  const result: boolean[][] = flatNodes.map(() => []);
  const maxDepth = Math.max(...flatNodes.map((n) => n.depth), 0);

  for (let d = 0; d <= maxDepth; d++) {
    // depth d のノードがどの位置にいるかを記録
    for (let i = 0; i < flatNodes.length; i++) {
      const node = flatNodes[i];
      if (node.depth >= d) {
        // このインデックスの位置でdepth dの縦線を引くか
        if (node.depth === d) {
          result[i][d] = false; // このノード自身
        } else {
          // このノードがdepth d のノードの後裔かどうか
          // depth d の最後の兄弟より前に現れるか確認
          let showLine = false;
          // depth d+1...node.depth の間に親をたどる
          // 簡易的に: depth d のノードがiの前にあって、iより後にも depth d のノードが同じ親の下に続くか
          for (let j = i + 1; j < flatNodes.length; j++) {
            if (flatNodes[j].depth < d) break;
            if (flatNodes[j].depth === d) {
              // iからjまでの間に、depth d のノードがあるということは縦線が必要
              showLine = true;
              break;
            }
          }
          result[i][d] = showLine;
        }
      } else {
        result[i][d] = false;
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
  verticalLines,
}: VersionTreeItemProps) {
  const { version } = node;
  const depth = node.depth;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        marginBottom: "2px",
        paddingLeft: `${depth * 20}px`,
      }}
    >
      {/* 接続線（分岐ノードのみ） */}
      {depth > 0 && (
        <div
          style={{
            width: "20px",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "0",
              top: "50%",
              width: "16px",
              height: "1px",
              background: colors.border,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "0",
              top: 0,
              bottom: "50%",
              width: "1px",
              background: colors.border,
            }}
          />
        </div>
      )}

      {/* バージョンカード */}
      <button
        type="button"
        onClick={() => onSelect(version)}
        style={{
          flex: 1,
          padding: "8px 12px",
          background: isSelected
            ? "rgba(203,166,247,0.15)"
            : isComparing
              ? "rgba(137,180,250,0.1)"
              : colors.card,
          border: `1px solid ${
            isSelected ? colors.accent : isComparing ? colors.blue : colors.border
          }`,
          borderRadius: "6px",
          color: colors.text,
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: isSelected ? colors.accent : colors.muted,
            flexShrink: 0,
            minWidth: "28px",
          }}
        >
          v{version.version}
        </span>
        <span
          style={{
            fontSize: "13px",
            color: colors.subtext,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {version.name ?? `バージョン ${version.version}`}
        </span>
        {version.parent_version_id !== null && (
          <span
            style={{
              fontSize: "10px",
              color: colors.yellow,
              background: "rgba(249,226,175,0.1)",
              border: "1px solid rgba(249,226,175,0.3)",
              borderRadius: "4px",
              padding: "1px 5px",
              flexShrink: 0,
            }}
          >
            分岐
          </span>
        )}
        <div
          style={{ display: "flex", gap: "4px", marginLeft: "auto", flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onCompare(version)}
            title="比較"
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "4px",
              color: isComparing ? colors.blue : colors.muted,
              cursor: "pointer",
            }}
          >
            比較
          </button>
          <button
            type="button"
            onClick={() => onBranch(version)}
            title="分岐"
            style={{
              padding: "2px 7px",
              fontSize: "11px",
              background: "transparent",
              border: `1px solid ${colors.border}`,
              borderRadius: "4px",
              color: colors.yellow,
              cursor: "pointer",
            }}
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

  const createMutation = useMutation({
    mutationFn: (data: { content: string; name?: string; memo?: string }) =>
      createPromptVersion(projectId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      onSave();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { content?: string; name?: string | null; memo?: string | null }) => {
      if (!version) throw new Error("version is required for update");
      return updatePromptVersion(projectId, version.id, data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promptVersions", projectId] });
      onSave();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    if (isNew) {
      createMutation.mutate({
        content: content.trim(),
        name: name.trim() || undefined,
        memo: memo.trim() || undefined,
      });
    } else {
      updateMutation.mutate({
        content: content.trim(),
        name: name.trim() || null,
        memo: memo.trim() || null,
      });
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: "6px",
    color: colors.text,
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    color: colors.subtext,
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div>
        <label htmlFor="editor-name" style={labelStyle}>
          バージョン名（任意）
        </label>
        <input
          id="editor-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 丁寧語対応版"
          style={inputStyle}
        />
      </div>
      <div>
        <label htmlFor="editor-memo" style={labelStyle}>
          メモ（任意）
        </label>
        <input
          id="editor-memo"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="変更内容や目的を記入..."
          style={inputStyle}
        />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <label htmlFor="editor-content" style={labelStyle}>
          プロンプト本文
          <span style={{ color: colors.danger, marginLeft: "4px" }}>*</span>
        </label>
        <textarea
          id="editor-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="システムプロンプトを入力..."
          style={{
            ...inputStyle,
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            resize: "none",
            lineHeight: 1.6,
            fontFamily: "monospace",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "7px 18px",
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: "6px",
            color: colors.subtext,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={!content.trim() || isPending}
          style={{
            padding: "7px 18px",
            background: colors.accent,
            border: "none",
            borderRadius: "6px",
            color: colors.overlay,
            fontSize: "13px",
            fontWeight: 600,
            cursor: !content.trim() || isPending ? "not-allowed" : "pointer",
            opacity: !content.trim() || isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "保存中..." : isNew ? "作成" : "保存"}
        </button>
      </div>
      {(createMutation.isError || updateMutation.isError) && (
        <p style={{ color: colors.danger, fontSize: "13px", margin: 0 }}>
          保存に失敗しました。再度お試しください。
        </p>
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
        <h3 style={{ margin: "0 0 8px", fontSize: "17px", color: colors.text }}>
          バージョンを分岐
        </h3>
        <p style={{ margin: "0 0 20px", color: colors.muted, fontSize: "13px" }}>
          v{parentVersion.version}「{parentVersion.name ?? `バージョン ${parentVersion.version}`}
          」から分岐します
        </p>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          <div>
            <label
              htmlFor="branch-name"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                color: colors.subtext,
              }}
            >
              新しいバージョン名（任意）
            </label>
            <input
              id="branch-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 別アプローチ版"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div>
            <label
              htmlFor="branch-memo"
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "13px",
                color: colors.subtext,
              }}
            >
              メモ（任意）
            </label>
            <input
              id="branch-memo"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="分岐の目的や変更予定..."
              style={{
                width: "100%",
                padding: "8px 12px",
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.text,
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
          {branchMutation.isError && (
            <p style={{ color: colors.danger, fontSize: "13px", margin: 0 }}>
              分岐の作成に失敗しました。
            </p>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 18px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.subtext,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={branchMutation.isPending}
              style={{
                padding: "7px 18px",
                background: colors.yellow,
                border: "none",
                borderRadius: "6px",
                color: colors.overlay,
                fontSize: "13px",
                fontWeight: 600,
                cursor: branchMutation.isPending ? "not-allowed" : "pointer",
                opacity: branchMutation.isPending ? 0.6 : 1,
              }}
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
      result.push({ type: "same", text: aLines[ai] });
      ai++;
      bi++;
    } else {
      // 先読みして一致するものを探す
      const aRemainder = aLines.slice(ai);
      const bRemainder = bLines.slice(bi);

      // bの行がaに出てくるか（削除の後に挿入）
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

function CompareView({ versionA, versionB, onClose }: CompareViewProps) {
  const [mode, setMode] = useState<"side-by-side" | "unified">("side-by-side");
  const diff = diffLines(versionA.content, versionB.content);

  const headerStyle = (accent: string): React.CSSProperties => ({
    padding: "10px 14px",
    background: colors.card,
    borderBottom: `1px solid ${accent}`,
    fontSize: "13px",
    color: colors.subtext,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
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
          width: "100%",
          maxWidth: "1200px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", color: colors.text }}>バージョン比較</h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                overflow: "hidden",
              }}
            >
              {(["side-by-side", "unified"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  style={{
                    padding: "5px 12px",
                    background: mode === m ? colors.card : "transparent",
                    border: "none",
                    color: mode === m ? colors.text : colors.muted,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {m === "side-by-side" ? "並列" : "統合"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "5px 12px",
                background: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: "6px",
                color: colors.subtext,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              閉じる
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {mode === "side-by-side" ? (
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* 左: versionA */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  borderRight: `1px solid ${colors.border}`,
                }}
              >
                <div style={headerStyle(colors.danger)}>
                  <span>
                    v{versionA.version} {versionA.name && `— ${versionA.name}`}
                  </span>
                  <span style={{ color: colors.muted, fontSize: "11px" }}>
                    {formatDate(versionA.created_at)}
                  </span>
                </div>
                <pre
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: "14px",
                    overflow: "auto",
                    fontSize: "13px",
                    lineHeight: 1.7,
                    color: colors.text,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {versionA.content}
                </pre>
              </div>
              {/* 右: versionB */}
              <div
                style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
              >
                <div style={headerStyle(colors.green)}>
                  <span>
                    v{versionB.version} {versionB.name && `— ${versionB.name}`}
                  </span>
                  <span style={{ color: colors.muted, fontSize: "11px" }}>
                    {formatDate(versionB.created_at)}
                  </span>
                </div>
                <pre
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: "14px",
                    overflow: "auto",
                    fontSize: "13px",
                    lineHeight: 1.7,
                    color: colors.text,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {versionB.content}
                </pre>
              </div>
            </div>
          ) : (
            // 統合表示（差分ハイライト）
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: colors.card,
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: "13px",
                  color: colors.subtext,
                  display: "flex",
                  gap: "16px",
                }}
              >
                <span style={{ color: colors.danger }}>ー v{versionA.version}</span>
                <span style={{ color: colors.green }}>+ v{versionB.version}</span>
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "0",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  lineHeight: 1.7,
                }}
              >
                {diff.map((line, i) => (
                  <div
                    key={`diff-${line.type}-${i}`}
                    style={{
                      padding: "0 14px",
                      background:
                        line.type === "removed"
                          ? "rgba(243,139,168,0.12)"
                          : line.type === "added"
                            ? "rgba(166,227,161,0.12)"
                            : "transparent",
                      color:
                        line.type === "removed"
                          ? colors.danger
                          : line.type === "added"
                            ? colors.green
                            : colors.text,
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <span style={{ width: "14px", flexShrink: 0, userSelect: "none" }}>
                      {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                    </span>
                    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>
                      {line.text || "\u00a0"}
                    </span>
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

  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
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

  const tree = versions ? buildVersionTree(versions) : [];
  const flatNodes = flattenTree(tree);
  const verticalLinesPerNode = computeVerticalLines(flatNodes);

  function handleSelectVersion(v: PromptVersion) {
    setSelectedVersion(v);
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
    setSelectedVersion(newVersion);
    setPanelMode({ type: "edit", version: newVersion });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ページヘッダー */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px", color: colors.text }}>
            プロンプト管理
          </h2>
          {project && (
            <p style={{ margin: 0, fontSize: "13px", color: colors.muted }}>{project.name}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {selectedVersion && compareVersion && (
            <button
              type="button"
              onClick={handleOpenCompare}
              style={{
                padding: "7px 16px",
                background: "transparent",
                border: `1px solid ${colors.blue}`,
                borderRadius: "6px",
                color: colors.blue,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              比較を表示
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedVersion(null);
              setPanelMode({ type: "new" });
            }}
            style={{
              padding: "7px 16px",
              background: colors.accent,
              border: "none",
              borderRadius: "6px",
              color: colors.overlay,
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + 新規作成
          </button>
        </div>
      </div>

      {/* 比較バー */}
      {(selectedVersion || compareVersion) && (
        <div
          style={{
            padding: "8px 12px",
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "6px",
            marginBottom: "12px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            fontSize: "13px",
          }}
        >
          <span style={{ color: colors.muted }}>選択中:</span>
          {selectedVersion && (
            <span style={{ color: colors.accent }}>
              v{selectedVersion.version} {selectedVersion.name && `— ${selectedVersion.name}`}
            </span>
          )}
          {compareVersion && (
            <>
              <span style={{ color: colors.muted }}>vs</span>
              <span style={{ color: colors.blue }}>
                v{compareVersion.version} {compareVersion.name && `— ${compareVersion.name}`}
              </span>
              <button
                type="button"
                onClick={() => setCompareVersion(null)}
                style={{
                  marginLeft: "auto",
                  padding: "2px 8px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "4px",
                  color: colors.muted,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                クリア
              </button>
            </>
          )}
          {!compareVersion && (
            <span style={{ color: colors.muted, fontSize: "12px" }}>
              別のバージョンで「比較」をクリックすると比較できます
            </span>
          )}
        </div>
      )}

      {/* メインコンテンツ */}
      <div style={{ display: "flex", gap: "16px", flex: 1, minHeight: 0 }}>
        {/* バージョンツリー */}
        <div
          style={{
            width: "300px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              color: colors.muted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "8px",
            }}
          >
            バージョン履歴
          </div>

          {isLoading && <p style={{ color: colors.muted, fontSize: "13px" }}>読み込み中...</p>}
          {isError && (
            <p style={{ color: colors.danger, fontSize: "13px" }}>読み込みに失敗しました</p>
          )}

          {!isLoading && !isError && flatNodes.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: colors.muted,
                fontSize: "13px",
                background: colors.card,
                borderRadius: "8px",
                border: `1px solid ${colors.border}`,
              }}
            >
              バージョンがありません
              <br />
              <span style={{ fontSize: "12px" }}>「新規作成」から始めましょう</span>
            </div>
          )}

          <div style={{ overflowY: "auto", flex: 1 }}>
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
        <div
          style={{
            flex: 1,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {panelMode === null && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colors.muted,
                fontSize: "14px",
              }}
            >
              バージョンを選択するか、新規作成してください
            </div>
          )}

          {panelMode?.type === "new" && (
            <>
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: colors.accent,
                }}
              >
                新規プロンプト作成
              </div>
              <div style={{ flex: 1, padding: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${colors.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: colors.muted,
                      marginRight: "8px",
                    }}
                  >
                    v{panelMode.version.version}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: colors.text }}>
                    {panelMode.version.name ?? `バージョン ${panelMode.version.version}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelMode({ type: "edit", version: panelMode.version })}
                  style={{
                    padding: "5px 14px",
                    background: "transparent",
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    color: colors.subtext,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  編集
                </button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
                {panelMode.version.memo && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: colors.overlay,
                      border: `1px solid ${colors.border}`,
                      borderRadius: "6px",
                      marginBottom: "14px",
                      fontSize: "13px",
                      color: colors.subtext,
                    }}
                  >
                    <span style={{ color: colors.muted, marginRight: "6px" }}>メモ:</span>
                    {panelMode.version.memo}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "12px",
                    color: colors.muted,
                    marginBottom: "6px",
                  }}
                >
                  作成日時: {formatDate(panelMode.version.created_at)}
                  {panelMode.version.parent_version_id !== null && (
                    <span
                      style={{
                        marginLeft: "10px",
                        color: colors.yellow,
                        background: "rgba(249,226,175,0.1)",
                        border: "1px solid rgba(249,226,175,0.3)",
                        borderRadius: "4px",
                        padding: "1px 6px",
                        fontSize: "11px",
                      }}
                    >
                      v
                      {versions?.find((v) => v.id === panelMode.version.parent_version_id)
                        ?.version ?? "?"}
                      から分岐
                    </span>
                  )}
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "14px",
                    background: colors.overlay,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "6px",
                    fontSize: "13px",
                    lineHeight: 1.7,
                    color: colors.text,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                  }}
                >
                  {panelMode.version.content}
                </pre>
              </div>
            </>
          )}

          {panelMode?.type === "edit" && (
            <>
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: "14px",
                  fontWeight: 600,
                  color: colors.accent,
                }}
              >
                v{panelMode.version.version} を編集
              </div>
              <div style={{ flex: 1, padding: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <PromptEditor
                  version={panelMode.version}
                  projectId={projectId}
                  isNew={false}
                  onSave={() => {
                    // 編集完了後に最新データで表示モードに戻す
                    setPanelMode(null);
                    setSelectedVersion(null);
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
