import { NavLink, Outlet, useLocation, useParams } from "react-router";
import {
  buildAnnotationReviewPath,
  getAnnotationReviewContextFromSearch,
  loadLastAnnotationReviewContext,
} from "../lib/annotationReviewNavigation";
import { ErrorBoundary } from "./ErrorBoundary";

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "8px 16px",
  textDecoration: "none",
  color: isActive ? "#cba6f7" : "#cdd6f4",
  backgroundColor: isActive ? "#313244" : "transparent",
  borderRadius: "4px",
  margin: "2px 8px",
  fontSize: "14px",
});

function ProjectSubNav({ projectId }: { projectId: string }) {
  const location = useLocation();
  const reviewContext =
    getAnnotationReviewContextFromSearch(location.search) ??
    loadLastAnnotationReviewContext(projectId);
  const annotationReviewPath = buildAnnotationReviewPath(projectId, reviewContext);

  const subNavItems = [
    { to: `/projects/${projectId}`, label: "ホーム", end: true },
    { to: `/projects/${projectId}/context-files`, label: "コンテキスト" },
    { to: `/projects/${projectId}/test-cases`, label: "テストケース" },
    { to: `/projects/${projectId}/prompts`, label: "プロンプト" },
    { to: `/projects/${projectId}/runs`, label: "Run" },
    { to: `/projects/${projectId}/score`, label: "採点" },
    {
      to: annotationReviewPath,
      label: "抽出",
      matchPaths: [
        `/projects/${projectId}/annotation-review`,
        `/projects/${projectId}/annotation-tasks`,
      ],
    },
    { to: `/projects/${projectId}/settings`, label: "設定" },
  ];

  return (
    <div style={{ marginTop: "8px" }}>
      <div
        style={{
          padding: "4px 16px",
          fontSize: "11px",
          color: "#6c7086",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "4px",
        }}
      >
        プロジェクト
      </div>
      {subNavItems.map(({ to, label, end, matchPaths }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={
            matchPaths
              ? navLinkStyle({
                  isActive: matchPaths.some((path) => location.pathname.startsWith(path)),
                })
              : navLinkStyle
          }
        >
          {label}
        </NavLink>
      ))}
    </div>
  );
}

function SidebarNav() {
  const { id } = useParams<{ id?: string }>();

  const topNavItems = [
    { to: "/", label: "プロジェクト一覧", end: true },
    { to: "/health", label: "ヘルスチェック", end: false },
  ];

  return (
    <nav style={{ marginTop: "8px" }}>
      {topNavItems.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end} style={navLinkStyle}>
          {label}
        </NavLink>
      ))}
      {id && <ProjectSubNav projectId={id} />}
    </nav>
  );
}

export function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <aside
        style={{
          width: "240px",
          backgroundColor: "#181825",
          color: "#cdd6f4",
          padding: "16px 0",
          flexShrink: 0,
          borderRight: "1px solid #313244",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #313244" }}>
          <h1 style={{ fontSize: "16px", fontWeight: "bold", margin: 0, color: "#cba6f7" }}>
            Prompt Reviewer
          </h1>
        </div>
        <SidebarNav />
      </aside>
      <main
        style={{
          flex: 1,
          backgroundColor: "#1e1e2e",
          color: "#cdd6f4",
          padding: "24px",
          overflow: "auto",
        }}
      >
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
