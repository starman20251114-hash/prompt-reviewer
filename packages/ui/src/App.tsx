import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { AnnotationReviewPage } from "./pages/AnnotationReviewPage";
import { AnnotationTaskSettingsPage } from "./pages/AnnotationTaskSettingsPage";
import { ContextAssetsPage } from "./pages/ContextAssetsPage";
import { ExecutionProfilesPage } from "./pages/ExecutionProfilesPage";
import { HealthPage } from "./pages/HealthPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PromptsPage } from "./pages/PromptsPage";
import { RunsPage } from "./pages/RunsPage";
import { ScorePage } from "./pages/ScorePage";
import { ScoreProgressionPage } from "./pages/ScoreProgressionPage";
import { TestCasesPage } from "./pages/TestCasesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* ラベル管理 */}
            <Route index element={<ProjectsPage />} />
            {/* 後方互換: /projects/:id はトップにリダイレクト */}
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            {/* 資産管理（ラベルフィルタはクエリパラメータで対応） */}
            <Route path="test-cases" element={<TestCasesPage />} />
            <Route path="prompts" element={<PromptsPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="score" element={<ScorePage />} />
            <Route path="score-progression" element={<ScoreProgressionPage />} />
            <Route path="annotation-review" element={<AnnotationReviewPage />} />
            <Route path="annotation-tasks" element={<AnnotationTaskSettingsPage />} />
            <Route path="execution-profiles" element={<ExecutionProfilesPage />} />
            <Route path="context-assets" element={<ContextAssetsPage />} />
            {/* ユーティリティ */}
            <Route path="health" element={<HealthPage />} />
            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
