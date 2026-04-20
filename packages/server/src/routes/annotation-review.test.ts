/**
 * Annotation Review (Candidates / Gold Annotations) エンドポイントのテスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * 実際のDB接続は行わず、Drizzle の DB インターフェースを模倣した
 * モックを使用してルートハンドラの動作を検証する。
 */

vi.mock("better-sqlite3", () => {
  return {
    default: vi.fn().mockReturnValue({}),
  };
});

import type { DB } from "@prompt-reviewer/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createAnnotationCandidatesRouter,
  createGoldAnnotationsRouter,
} from "./annotation-review.js";

// ---- 型定義 ----

type MockCandidate = {
  id: number;
  run_id: number;
  annotation_task_id: number;
  target_text_ref: string;
  source_type: "final_answer" | "structured_json" | "trace_step";
  source_step_id: string | null;
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  rationale: string | null;
  status: "pending" | "accepted" | "rejected";
  note: string | null;
  created_at: number;
  updated_at: number;
};

type MockGoldAnnotation = {
  id: number;
  annotation_task_id: number;
  target_text_ref: string;
  label: string;
  start_line: number;
  end_line: number;
  quote: string;
  note: string | null;
  source_candidate_id: number | null;
  created_at: number;
  updated_at: number;
};

// ---- テスト用アプリビルダー ----

function buildApp(db: unknown) {
  const app = new Hono();
  app.route("/api/annotation-candidates", createAnnotationCandidatesRouter(db as DB));
  app.route("/api/gold-annotations", createGoldAnnotationsRouter(db as DB));
  return app;
}

// ---- テストデータ ----

const sampleCandidate: MockCandidate = {
  id: 1,
  run_id: 10,
  annotation_task_id: 2,
  target_text_ref: "test_case:5",
  source_type: "final_answer",
  source_step_id: null,
  label: "bug",
  start_line: 3,
  end_line: 7,
  quote: "サンプルの引用テキスト",
  rationale: null,
  status: "pending",
  note: null,
  created_at: 1000000,
  updated_at: 1000000,
};

const sampleGold: MockGoldAnnotation = {
  id: 1,
  annotation_task_id: 2,
  target_text_ref: "test_case:5",
  label: "bug",
  start_line: 3,
  end_line: 7,
  quote: "サンプルの引用テキスト",
  note: null,
  source_candidate_id: 1,
  created_at: 1000000,
  updated_at: 1000000,
};

// ---- annotation-candidates GET テスト ----

describe("GET /api/annotation-candidates", () => {
  it("status フィルターで pending のみを返す", async () => {
    const pendingCandidate = { ...sampleCandidate, id: 1, status: "pending" as const };
    const acceptedCandidate = { ...sampleCandidate, id: 2, status: "accepted" as const };

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([pendingCandidate]),
          }),
          orderBy: () => Promise.resolve([pendingCandidate, acceptedCandidate]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates?status=pending");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockCandidate[];
    expect(body).toHaveLength(1);
    expect(body.at(0)?.status).toBe("pending");
  });

  it("annotation_task_id フィルターで該当するcandidatesを返す", async () => {
    const candidates = [
      { ...sampleCandidate, id: 1, annotation_task_id: 2 },
      { ...sampleCandidate, id: 2, annotation_task_id: 2 },
    ];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(candidates),
          }),
          orderBy: () => Promise.resolve(candidates),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates?annotation_task_id=2");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockCandidate[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.annotation_task_id).toBe(2);
  });

  it("run_id フィルターで該当するcandidatesを返す", async () => {
    const candidates = [{ ...sampleCandidate, id: 1, run_id: 10 }];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(candidates),
          }),
          orderBy: () => Promise.resolve(candidates),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates?run_id=10");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockCandidate[];
    expect(body).toHaveLength(1);
    expect(body.at(0)?.run_id).toBe(10);
  });

  it("test_case_id フィルターで target_text_ref='test_case:5' のcandidatesを返す", async () => {
    const candidates = [
      { ...sampleCandidate, id: 1, target_text_ref: "test_case:5" },
      { ...sampleCandidate, id: 2, target_text_ref: "test_case:5" },
    ];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(candidates),
          }),
          orderBy: () => Promise.resolve(candidates),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates?test_case_id=5");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockCandidate[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.target_text_ref).toBe("test_case:5");
    expect(body.at(1)?.target_text_ref).toBe("test_case:5");
  });
});

// ---- annotation-candidates PATCH テスト ----

describe("PATCH /api/annotation-candidates/:id", () => {
  it("label, start_line, end_line, note を更新して200で返す", async () => {
    const updated: MockCandidate = {
      ...sampleCandidate,
      label: "feature",
      start_line: 5,
      end_line: 10,
      note: "更新メモ",
      updated_at: 2000000,
    };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleCandidate]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([updated]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "feature", start_line: 5, end_line: 10, note: "更新メモ" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidate: MockCandidate };
    expect(body.candidate.label).toBe("feature");
    expect(body.candidate.start_line).toBe(5);
    expect(body.candidate.end_line).toBe(10);
    expect(body.candidate.note).toBe("更新メモ");
  });

  it("status='accepted' に変更するとgold_annotationを作成して {candidate, gold} を返す", async () => {
    const accepted: MockCandidate = { ...sampleCandidate, status: "accepted", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleCandidate]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([accepted]),
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([sampleGold]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidate: MockCandidate; gold: MockGoldAnnotation };
    expect(body.candidate.status).toBe("accepted");
    expect(body.gold).toBeDefined();
    expect(body.gold.source_candidate_id).toBe(1);
    expect(body.gold.label).toBe("bug");
  });

  it("status='rejected' に変更してもgold_annotationは作成されず {candidate} のみ返す", async () => {
    const rejected: MockCandidate = { ...sampleCandidate, status: "rejected", updated_at: 2000000 };

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sampleCandidate]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([rejected]),
          }),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidate: MockCandidate; gold?: MockGoldAnnotation };
    expect(body.candidate.status).toBe("rejected");
    expect(body.gold).toBeUndefined();
  });

  it("start_line が end_line より大きい場合400を返す", async () => {
    const app = buildApp({});
    const res = await app.request("/api/annotation-candidates/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_line: 10, end_line: 5 }),
    });

    expect(res.status).toBe(400);
  });

  it("存在しないIDに対して404を返す", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/annotation-candidates/999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "bug" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Annotation candidate not found");
  });
});

// ---- gold-annotations GET テスト ----

describe("GET /api/gold-annotations", () => {
  it("annotation_task_id フィルターで該当するgold_annotationsを返す", async () => {
    const golds = [
      { ...sampleGold, id: 1, annotation_task_id: 2 },
      { ...sampleGold, id: 2, annotation_task_id: 2 },
    ];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(golds),
          }),
          orderBy: () => Promise.resolve(golds),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/gold-annotations?annotation_task_id=2");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockGoldAnnotation[];
    expect(body).toHaveLength(2);
    expect(body.at(0)?.annotation_task_id).toBe(2);
  });

  it("test_case_id フィルターで target_text_ref='test_case:5' のgold_annotationsを返す", async () => {
    const golds = [{ ...sampleGold, id: 1, target_text_ref: "test_case:5" }];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(golds),
          }),
          orderBy: () => Promise.resolve(golds),
        }),
      }),
    };

    const app = buildApp(db);
    const res = await app.request("/api/gold-annotations?test_case_id=5");

    expect(res.status).toBe(200);
    const body = (await res.json()) as MockGoldAnnotation[];
    expect(body).toHaveLength(1);
    expect(body.at(0)?.target_text_ref).toBe("test_case:5");
  });
});
