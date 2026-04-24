import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router";
import { getProject } from "../lib/api";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const { isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  if (Number.isNaN(projectId)) {
    return <Navigate to="/" replace />;
  }

  // 既存 ID でも無効 ID でも、読み込み完了後はトップへ戻す。
  if (!isLoading) {
    return <Navigate to="/" replace />;
  }

  return null;
}
