import { NavLink, useLocation, useParams } from "react-router";
import styles from "./ScoreSectionTabs.module.css";

export function ScoreSectionTabs() {
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();

  const isProgression = location.pathname.endsWith("/score-progression");

  const tabs = id
    ? [
        { to: `/projects/${id}/score`, label: "採点", isActive: !isProgression },
        { to: `/projects/${id}/score-progression`, label: "スコア推移", isActive: isProgression },
      ]
    : [
        { to: "/score", label: "採点", isActive: !isProgression },
        { to: "/score-progression", label: "スコア推移", isActive: isProgression },
      ];

  return (
    <div className={styles.tabList} aria-label="採点ページ切り替え">
      {tabs.map(({ to, label, isActive }) => (
        <NavLink key={to} to={to} className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
