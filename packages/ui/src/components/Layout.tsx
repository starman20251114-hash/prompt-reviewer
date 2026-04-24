import { NavLink, Outlet } from "react-router";
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

const subNavLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: "block",
  padding: "6px 16px 6px 32px",
  textDecoration: "none",
  color: isActive ? "#cba6f7" : "#a6adc8",
  backgroundColor: isActive ? "#313244" : "transparent",
  borderRadius: "4px",
  margin: "2px 8px",
  fontSize: "13px",
});

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  children?: { to: string; label: string }[];
};

const navItems: NavItem[] = [
  {
    to: "/prompts",
    label: "プロンプト",
    children: [{ to: "/annotation-review", label: "抽出" }],
  },
  {
    to: "/test-cases",
    label: "テストケース",
    children: [{ to: "/context-assets", label: "コンテキスト素材" }],
  },
  { to: "/runs", label: "Run" },
  { to: "/score", label: "採点" },
  { to: "/", label: "ラベル管理", end: true },
  { to: "/execution-profiles", label: "実行設定" },
  { to: "/health", label: "ヘルスチェック" },
];

function SidebarNav() {
  return (
    <nav style={{ marginTop: "8px" }}>
      {navItems.map(({ to, label, end, children }) => (
        <div key={to}>
          <NavLink to={to} end={end} style={navLinkStyle}>
            {label}
          </NavLink>
          {children?.map((child) => (
            <NavLink key={child.to} to={child.to} style={subNavLinkStyle}>
              {child.label}
            </NavLink>
          ))}
        </div>
      ))}
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
