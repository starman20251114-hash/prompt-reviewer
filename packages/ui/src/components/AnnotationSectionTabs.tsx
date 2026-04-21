import { NavLink, useLocation, useParams } from "react-router";
import styles from "./AnnotationSectionTabs.module.css";

const annotationRoutes = {
  review: "annotation-review",
  settings: "annotation-tasks",
} as const;

export function AnnotationSectionTabs() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  if (!id) {
    return null;
  }

  const searchParams = new URLSearchParams(location.search);
  const hasRunId = searchParams.get("runId") !== null;
  const isReviewPath = location.pathname.endsWith(`/${annotationRoutes.review}`);
  const isSettingsPath = location.pathname.endsWith(`/${annotationRoutes.settings}`);

  const reviewParams = new URLSearchParams({ mode: "review" });
  const runId = searchParams.get("runId");
  const taskId = searchParams.get("taskId");
  if (runId) reviewParams.set("runId", runId);
  if (taskId) reviewParams.set("taskId", taskId);

  const tabs = [
    {
      to: `/projects/${id}/${annotationRoutes.review}?${reviewParams.toString()}`,
      label: "レビュー",
      isActive: isReviewPath && hasRunId,
    },
    {
      to: `/projects/${id}/${annotationRoutes.review}`,
      label: "ゴールドアノテーション",
      isActive: isReviewPath && !hasRunId,
    },
    {
      to: `/projects/${id}/${annotationRoutes.settings}`,
      label: "設定",
      isActive: isSettingsPath,
    },
  ];

  return (
    <div className={styles.tabList} aria-label="抽出ページ切り替え">
      {tabs.map(({ to, label, isActive }) => (
        <NavLink key={to} to={to} className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
