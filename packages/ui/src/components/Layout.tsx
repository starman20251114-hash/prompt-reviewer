import { NavLink, Outlet } from "react-router";
import { useI18n } from "../i18n/I18nProvider";
import { ErrorBoundary } from "./ErrorBoundary";
import styles from "./Layout.module.css";

type NavItem = {
  to: string;
  labelKey: string;
  end?: boolean;
  children?: { to: string; labelKey: string }[];
};

const navItems: NavItem[] = [
  {
    to: "/prompts",
    labelKey: "layout.prompts",
    children: [{ to: "/annotation-tasks", labelKey: "layout.extraction" }],
  },
  {
    to: "/test-cases",
    labelKey: "layout.testCases",
    children: [{ to: "/context-assets", labelKey: "layout.contextAssets" }],
  },
  { to: "/runs", labelKey: "layout.runs" },
  { to: "/score", labelKey: "layout.scoring" },
  { to: "/", labelKey: "layout.labels", end: true },
  { to: "/execution-profiles", labelKey: "layout.executionProfiles" },
  { to: "/health", labelKey: "layout.health" },
];

function getNavLinkClassName(isActive: boolean) {
  return [styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ");
}

function getSubNavLinkClassName(isActive: boolean) {
  return [styles.subNavLink, isActive ? styles.subNavLinkActive : ""].filter(Boolean).join(" ");
}

function SidebarNav() {
  const { t } = useI18n();

  return (
    <nav className={styles.nav}>
      {navItems.map(({ to, labelKey, end, children }) => (
        <div
          key={to}
          className={[styles.navGroup, children?.length ? styles.navGroupExpanded : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <NavLink to={to} end={end} className={({ isActive }) => getNavLinkClassName(isActive)}>
            <span className={styles.navLinkParent}>
              <span>{t(labelKey)}</span>
              {children?.length ? (
                <span className={styles.navHint}>{t("layout.navHintHasChildren")}</span>
              ) : null}
            </span>
          </NavLink>
          {children?.length ? (
            <div className={styles.subNavList}>
              {children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  className={({ isActive }) => getSubNavLinkClassName(isActive)}
                >
                  {t(child.labelKey)}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const { t } = useI18n();

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1 className={styles.brandTitle}>{t("common.appName")}</h1>
        </div>
        <SidebarNav />
      </aside>
      <main className={styles.main}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
