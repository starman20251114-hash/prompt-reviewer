import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { HealthPage } from "./pages/HealthPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectSettingsPage } from "./pages/ProjectSettingsPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { PromptsPage } from "./pages/PromptsPage";
import { RunsPage } from "./pages/RunsPage";
import { ScorePage } from "./pages/ScorePage";
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
            {/* トップ: プロジェクト一覧 */}
            <Route index element={<ProjectsPage />} />
            {/* プロジェクト詳細 */}
            <Route path="projects/:id" element={<ProjectDetailPage />} />
            <Route path="projects/:id/test-cases" element={<TestCasesPage />} />
            <Route path="projects/:id/prompts" element={<PromptsPage />} />
            <Route path="projects/:id/runs" element={<RunsPage />} />
            <Route path="projects/:id/score" element={<ScorePage />} />
            <Route path="projects/:id/settings" element={<ProjectSettingsPage />} />
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
