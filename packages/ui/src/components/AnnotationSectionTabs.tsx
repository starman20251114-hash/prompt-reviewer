import { useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import { useI18n } from "../i18n/I18nProvider";
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
  const { t } = useI18n();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const reviewContextFromSearch = getAnnotationReviewContextFromSearch(location.search);
  const persistedReviewContext = loadLastAnnotationReviewContext("global");
  const reviewContext = reviewContextFromSearch ?? persistedReviewContext;
  const hasRunId = searchParams.get("runId") !== null;
  const modeParam = searchParams.get("mode");
  const isReviewPath = location.pathname.endsWith(`/${annotationRoutes.review}`);
  const isSettingsPath = location.pathname.endsWith(`/${annotationRoutes.settings}`);

  useEffect(() => {
    if (reviewContextFromSearch) {
      saveLastAnnotationReviewContext("global", reviewContextFromSearch);
    }
  }, [reviewContextFromSearch]);

  const reviewTabTo = reviewContext
    ? buildAnnotationReviewPath("global", reviewContext)
    : `/${annotationRoutes.review}?mode=review`;

  const tabs = [
    {
      to: `/${annotationRoutes.settings}`,
      label: t("annotation.tabs.settings"),
      isActive: isSettingsPath,
    },
    {
      to: reviewTabTo,
      label: t("annotation.tabs.review"),
      isActive: isReviewPath && (hasRunId || modeParam === "review"),
    },
    {
      to: `/${annotationRoutes.review}`,
      label: t("annotation.tabs.goldAnnotations"),
      isActive: isReviewPath && !hasRunId && modeParam !== "review",
    },
  ];

  return (
    <div className={styles.tabList} aria-label={t("annotation.tabs.ariaLabel")}>
      {tabs.map(({ to, label, isActive }) => (
        <NavLink key={to} to={to} className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
