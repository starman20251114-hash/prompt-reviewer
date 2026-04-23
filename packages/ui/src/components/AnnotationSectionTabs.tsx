import { useEffect } from "react";
import { NavLink, useLocation, useParams } from "react-router";
import {
  buildAnnotationReviewPath,
  getAnnotationReviewContextFromSearch,
  loadLastAnnotationReviewContext,
  saveLastAnnotationReviewContext,
} from "../lib/annotationReviewNavigation";
import styles from "./AnnotationSectionTabs.module.css";

const annotationRoutes = {
  review: "annotation-review",
  settings: "annotation-tasks",
} as const;

export function AnnotationSectionTabs() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const reviewContextFromSearch = getAnnotationReviewContextFromSearch(location.search);
  const persistedReviewContext = id ? loadLastAnnotationReviewContext(id) : null;
  const reviewContext = reviewContextFromSearch ?? persistedReviewContext;
  const hasRunId = searchParams.get("runId") !== null;
  const modeParam = searchParams.get("mode");
  const isReviewPath = location.pathname.endsWith(`/${annotationRoutes.review}`);
  const isSettingsPath = location.pathname.endsWith(`/${annotationRoutes.settings}`);

  useEffect(() => {
    if (id && reviewContextFromSearch) {
      saveLastAnnotationReviewContext(id, reviewContextFromSearch);
    }
  }, [id, reviewContextFromSearch]);

  const reviewTabTo = id
    ? reviewContext
      ? buildAnnotationReviewPath(id, reviewContext)
      : `/projects/${id}/${annotationRoutes.review}?mode=review`
    : null;

  const tabs = id
    ? [
        {
          to: reviewTabTo as string,
          label: "レビュー",
          isActive: isReviewPath && (hasRunId || modeParam === "review"),
        },
        {
          to: `/projects/${id}/${annotationRoutes.review}`,
          label: "ゴールドアノテーション",
          isActive: isReviewPath && !hasRunId && modeParam !== "review",
        },
        {
          to: `/projects/${id}/${annotationRoutes.settings}`,
          label: "設定",
          isActive: isSettingsPath,
        },
      ]
    : [
        {
          to: `/${annotationRoutes.review}`,
          label: "ゴールドアノテーション",
          isActive: isReviewPath,
        },
        {
          to: `/${annotationRoutes.settings}`,
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
