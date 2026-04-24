import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { getProject } from "../lib/api";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  // ラベル管理画面にリダイレクト（後方互換のためルートは残す）
  if (!isLoading && project) {
    void navigate("/", { replace: true });
    return null;
  }

  return null;
}
