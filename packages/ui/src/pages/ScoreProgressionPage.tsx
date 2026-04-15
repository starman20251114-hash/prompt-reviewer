import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type VersionSummary, getProject, getScoreProgression } from "../lib/api";
import styles from "./ScoreProgressionPage.module.css";

type ScoreType = "human" | "judge";

/** Get version label for display */
function versionLabel(versionNumber: number, versionName: string | null): string {
  return versionName ? `v${versionNumber} - ${versionName}` : `v${versionNumber}`;
}

/** Short version label for chart axis */
function shortVersionLabel(versionNumber: number): string {
  return `v${versionNumber}`;
}

// --------------- ScoreBadge ---------------
function ScoreBadge({ score, max = 5 }: { score: number | null; max?: number }) {
  if (score === null) {
    return <span className={styles.scoreBadgeEmpty}>—</span>;
  }

  // Normalize to 0-100 range for color calculation
  const normalized = (score / max) * 100;
  const level = normalized >= 80 ? "high" : normalized >= 50 ? "mid" : "low";

  return (
    <span
      className={`${styles.scoreBadge} ${styles[`scoreBadge${level.charAt(0).toUpperCase()}${level.slice(1)}`]}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

// --------------- VersionSummaryTable ---------------
function VersionSummaryTable({
  summaries,
  scoreType,
}: {
  summaries: VersionSummary[];
  scoreType: ScoreType;
}) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Version</th>
            <th className={styles.th}>Name</th>
            <th className={`${styles.th} ${styles.thNumber}`}>Avg Score</th>
            <th className={`${styles.th} ${styles.thNumber}`}>Runs</th>
            <th className={`${styles.th} ${styles.thNumber}`}>Scored</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((v) => {
            const avg = scoreType === "human" ? v.avgHumanScore : v.avgJudgeScore;
            return (
              <tr key={v.versionId} className={styles.tr}>
                <td className={styles.td}>
                  <span className={styles.versionNum}>v{v.versionNumber}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.versionName}>{v.versionName ?? "—"}</span>
                </td>
                <td className={`${styles.td} ${styles.tdNumber}`}>
                  <ScoreBadge score={avg} />
                </td>
                <td className={`${styles.td} ${styles.tdNumber}`}>{v.runCount}</td>
                <td className={`${styles.td} ${styles.tdNumber}`}>{v.scoredCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --------------- ScoreProgressionChart ---------------
function ScoreProgressionChart({
  summaries,
  scoreType,
}: {
  summaries: VersionSummary[];
  scoreType: ScoreType;
}) {
  const chartData = summaries.map((v) => ({
    name: shortVersionLabel(v.versionNumber),
    label: versionLabel(v.versionNumber, v.versionName),
    score: scoreType === "human" ? v.avgHumanScore : v.avgJudgeScore,
    runCount: v.runCount,
    scoredCount: v.scoredCount,
  }));

  const hasData = chartData.some((d) => d.score !== null);

  if (!hasData) {
    return (
      <div className={styles.chartEmpty}>
        No scored runs yet. Score some runs to see the progression chart.
      </div>
    );
  }

  const scoreLabel = scoreType === "human" ? "Human Score" : "Judge Score";

  return (
    <div className={styles.chartWrapper}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--c-subtext)", fontSize: 12 }}
            axisLine={{ stroke: "var(--c-border)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 5]}
            tick={{ fill: "var(--c-subtext)", fontSize: 12 }}
            axisLine={{ stroke: "var(--c-border)" }}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "var(--c-overlay)",
              border: "1px solid var(--c-border)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--c-text)",
            }}
            formatter={(value, _name, item) => {
              const entryPayload = item?.payload as { scoredCount?: number } | undefined;
              const displayValue = typeof value === "number" ? value.toFixed(1) : "—";
              const detail =
                entryPayload?.scoredCount !== undefined
                  ? ` (${entryPayload.scoredCount} scored)`
                  : "";
              return [`${displayValue}${detail}`, scoreLabel] as [string, string];
            }}
            labelFormatter={(_label, payload) => {
              type ChartPayload = { payload?: { label?: string } };
              const item = (payload as unknown as ChartPayload[])[0];
              return item?.payload?.label ?? String(_label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: "13px", color: "var(--c-subtext)" }} />
          <Line
            type="monotone"
            dataKey="score"
            name={scoreLabel}
            stroke="var(--c-accent)"
            strokeWidth={2}
            dot={{ r: 5, fill: "var(--c-accent)", strokeWidth: 0 }}
            activeDot={{ r: 7 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------- TestCaseBreakdownTable ---------------
type TestCaseBreakdown = {
  testCaseId: number;
  testCaseTitle: string;
  versions: {
    versionId: number;
    versionNumber: number;
    versionName: string | null;
    humanScore: number | null;
    judgeScore: number | null;
    runId: number | null;
  }[];
};

function TestCaseBreakdownTable({
  breakdowns,
  summaries,
  scoreType,
}: {
  breakdowns: TestCaseBreakdown[];
  summaries: VersionSummary[];
  scoreType: ScoreType;
}) {
  if (breakdowns.length === 0) {
    return <div className={styles.emptyMsg}>No test cases found for this project.</div>;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Test Case</th>
            {summaries.map((v) => (
              <th key={v.versionId} className={`${styles.th} ${styles.thNumber}`}>
                <span className={styles.versionNum}>v{v.versionNumber}</span>
                {v.versionName && <span className={styles.thVersionName}>{v.versionName}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {breakdowns.map((tc) => (
            <tr key={tc.testCaseId} className={styles.tr}>
              <td className={styles.td}>
                <span className={styles.testCaseTitle}>{tc.testCaseTitle}</span>
              </td>
              {summaries.map((v) => {
                const cell = tc.versions.find((tv) => tv.versionId === v.versionId);
                const score = cell
                  ? scoreType === "human"
                    ? cell.humanScore
                    : cell.judgeScore
                  : null;
                return (
                  <td key={v.versionId} className={`${styles.td} ${styles.tdNumber}`}>
                    <ScoreBadge score={score} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------- ScoreProgressionPage ---------------
export function ScoreProgressionPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const [scoreType, setScoreType] = useState<ScoreType>("human");

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const {
    data: progression,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["score-progression", projectId],
    queryFn: () => getScoreProgression(projectId),
    enabled: !Number.isNaN(projectId),
    staleTime: 1000 * 30,
  });

  const summaries = progression?.versionSummaries ?? [];
  const breakdowns = progression?.testCaseBreakdown ?? [];

  const hasJudgeScores = summaries.some((v) => v.avgJudgeScore !== null);

  return (
    <div className={styles.root}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Score Progression</h2>
          {project && <p className={styles.projectName}>{project.name}</p>}
        </div>

        {/* Score type switcher */}
        <div className={styles.scoreTypeSwitcher}>
          <button
            type="button"
            className={`${styles.switcherBtn} ${scoreType === "human" ? styles.switcherBtnActive : ""}`}
            onClick={() => setScoreType("human")}
          >
            Human Score
          </button>
          <button
            type="button"
            className={`${styles.switcherBtn} ${scoreType === "judge" ? styles.switcherBtnActive : ""} ${!hasJudgeScores ? styles.switcherBtnDisabled : ""}`}
            onClick={() => {
              if (hasJudgeScores) setScoreType("judge");
            }}
            title={!hasJudgeScores ? "No Judge scores available yet" : undefined}
          >
            Judge Score
          </button>
        </div>
      </div>

      {isLoading && <p className={styles.loadingMsg}>Loading...</p>}
      {isError && <p className={styles.errorMsg}>Failed to load score data. Please try again.</p>}

      {!isLoading && !isError && summaries.length === 0 && (
        <div className={styles.emptyMsg}>
          No prompt versions found. Create some prompt versions and runs to see score progression.
        </div>
      )}

      {!isLoading && !isError && summaries.length > 0 && (
        <>
          {/* Section: Score progression chart */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Score Trend</h3>
            <p className={styles.sectionDesc}>
              Average {scoreType === "human" ? "human" : "judge"} score per version
            </p>
            <ScoreProgressionChart summaries={summaries} scoreType={scoreType} />
          </section>

          {/* Section: Version summary table */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Version Summary</h3>
            <p className={styles.sectionDesc}>
              Aggregated scores across all test cases per version
            </p>
            <VersionSummaryTable summaries={summaries} scoreType={scoreType} />
          </section>

          {/* Section: Per-test-case breakdown table */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Test Case Breakdown</h3>
            <p className={styles.sectionDesc}>
              {scoreType === "human" ? "Human" : "Judge"} score per test case and version (best run
              preferred)
            </p>
            <TestCaseBreakdownTable
              breakdowns={breakdowns}
              summaries={summaries}
              scoreType={scoreType}
            />
          </section>
        </>
      )}
    </div>
  );
}
