import { NavLink, Outlet } from "react-router";

const navItems = [
  { to: "/", label: "ダッシュボード" },
  { to: "/projects", label: "プロジェクト" },
  { to: "/health", label: "ヘルスチェック" },
];

export function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <aside
        style={{
          width: "240px",
          backgroundColor: "#1e1e2e",
          color: "#cdd6f4",
          padding: "16px 0",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #313244" }}>
          <h1 style={{ fontSize: "16px", fontWeight: "bold", margin: 0, color: "#cba6f7" }}>
            Prompt Reviewer
          </h1>
        </div>
        <nav style={{ marginTop: "8px" }}>
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              style={({ isActive }) => ({
                display: "block",
                padding: "8px 16px",
                textDecoration: "none",
                color: isActive ? "#cba6f7" : "#cdd6f4",
                backgroundColor: isActive ? "#313244" : "transparent",
                borderRadius: "4px",
                margin: "2px 8px",
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
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
        <Outlet />
      </main>
    </div>
  );
}
