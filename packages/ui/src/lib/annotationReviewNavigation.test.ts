import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAnnotationReviewPath,
  getAnnotationReviewContextFromSearch,
  loadLastAnnotationReviewContext,
  saveLastAnnotationReviewContext,
} from "./annotationReviewNavigation";

describe("annotationReviewNavigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runId と taskId がある検索文字列からレビュー文脈を取り出す", () => {
    expect(getAnnotationReviewContextFromSearch("?mode=review&runId=12&taskId=34")).toEqual({
      runId: "12",
      taskId: "34",
    });
  });

  it("runId または taskId が欠けているときは null を返す", () => {
    expect(getAnnotationReviewContextFromSearch("?mode=review&runId=12")).toBeNull();
    expect(getAnnotationReviewContextFromSearch("?taskId=34")).toBeNull();
  });

  it("レビュー文脈があると mode=review 付きの抽出 URL を組み立てる", () => {
    expect(
      buildAnnotationReviewPath(7, {
        runId: "12",
        taskId: "34",
      }),
    ).toBe("/projects/7/annotation-review?mode=review&runId=12&taskId=34");
  });

  it("レビュー文脈がないときは抽出トップ URL を返す", () => {
    expect(buildAnnotationReviewPath(7, null)).toBe("/projects/7/annotation-review");
  });

  it("保存したレビュー文脈を project ごとに復元できる", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    saveLastAnnotationReviewContext(7, { runId: "12", taskId: "34" });

    expect(loadLastAnnotationReviewContext(7)).toEqual({
      runId: "12",
      taskId: "34",
    });
    expect(loadLastAnnotationReviewContext(8)).toBeNull();
  });
});
