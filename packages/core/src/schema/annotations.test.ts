/**
 * annotations スキーマの型定義テスト
 *
 * better-sqlite3 はネイティブバイナリのビルドが必要なため、
 * ここではDBへの実際の接続なしにスキーマの型安全性のみを検証する。
 * マイグレーションの動作検証は `pnpm run migrate` で別途確認済み。
 */
import { describe, expectTypeOf, it } from "vitest";
import type {
  AnnotationCandidate,
  AnnotationCandidateStatus,
  AnnotationLabel,
  AnnotationOutputMode,
  AnnotationSourceType,
  AnnotationTask,
  GoldAnnotation,
  NewAnnotationCandidate,
  NewAnnotationLabel,
  NewAnnotationTask,
  NewGoldAnnotation,
} from "./annotations.js";

describe("annotation_tasks スキーマ型定義", () => {
  it("AnnotationTask は必須フィールドを持つ", () => {
    type RequiredFields = {
      id: number;
      name: string;
      output_mode: "span_label";
      created_at: number;
      updated_at: number;
    };
    expectTypeOf<
      Pick<AnnotationTask, "id" | "name" | "output_mode" | "created_at" | "updated_at">
    >().toMatchTypeOf<RequiredFields>();
  });

  it("AnnotationTask の description はオプショナル（null許容）", () => {
    expectTypeOf<AnnotationTask["description"]>().toEqualTypeOf<string | null>();
  });

  it("AnnotationTask の output_mode は span_label のみ許容", () => {
    expectTypeOf<AnnotationTask["output_mode"]>().toEqualTypeOf<"span_label">();
  });

  it("NewAnnotationTask は id なしで作成できる（AutoIncrement）", () => {
    const now = Date.now();
    const task: NewAnnotationTask = {
      name: "会話価値抽出",
      output_mode: "span_label",
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(task).toMatchTypeOf<NewAnnotationTask>();
  });

  it("NewAnnotationTask の output_mode はデフォルト値があるためオプショナル", () => {
    expectTypeOf<NewAnnotationTask["output_mode"]>().toEqualTypeOf<"span_label" | undefined>();
  });
});

describe("annotation_labels スキーマ型定義", () => {
  it("AnnotationLabel は必須フィールドを持つ", () => {
    type RequiredFields = {
      id: number;
      annotation_task_id: number;
      key: string;
      name: string;
      display_order: number;
      created_at: number;
      updated_at: number;
    };
    expectTypeOf<
      Pick<
        AnnotationLabel,
        "id" | "annotation_task_id" | "key" | "name" | "display_order" | "created_at" | "updated_at"
      >
    >().toMatchTypeOf<RequiredFields>();
  });

  it("AnnotationLabel の color はオプショナル（null許容）", () => {
    expectTypeOf<AnnotationLabel["color"]>().toEqualTypeOf<string | null>();
  });

  it("NewAnnotationLabel を作成できる", () => {
    const now = Date.now();
    const label: NewAnnotationLabel = {
      annotation_task_id: 1,
      key: "insight",
      name: "気づき",
      color: "#FF5733",
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(label).toMatchTypeOf<NewAnnotationLabel>();
  });

  it("NewAnnotationLabel の display_order はデフォルト値があるためオプショナル", () => {
    expectTypeOf<NewAnnotationLabel["display_order"]>().toEqualTypeOf<number | undefined>();
  });
});

describe("annotation_candidates スキーマ型定義", () => {
  it("AnnotationCandidate は必須フィールドを持つ", () => {
    type RequiredFields = {
      id: number;
      run_id: number;
      annotation_task_id: number;
      target_text_ref: string;
      source_type: "final_answer" | "structured_json" | "trace_step";
      label: string;
      start_line: number;
      end_line: number;
      quote: string;
      status: "pending" | "accepted" | "rejected";
      created_at: number;
      updated_at: number;
    };
    expectTypeOf<
      Pick<
        AnnotationCandidate,
        | "id"
        | "run_id"
        | "annotation_task_id"
        | "target_text_ref"
        | "source_type"
        | "label"
        | "start_line"
        | "end_line"
        | "quote"
        | "status"
        | "created_at"
        | "updated_at"
      >
    >().toMatchTypeOf<RequiredFields>();
  });

  it("AnnotationCandidate の source_step_id はオプショナル（null許容）", () => {
    expectTypeOf<AnnotationCandidate["source_step_id"]>().toEqualTypeOf<string | null>();
  });

  it("AnnotationCandidate の rationale はオプショナル（null許容）", () => {
    expectTypeOf<AnnotationCandidate["rationale"]>().toEqualTypeOf<string | null>();
  });

  it("AnnotationCandidate の note はオプショナル（null許容）", () => {
    expectTypeOf<AnnotationCandidate["note"]>().toEqualTypeOf<string | null>();
  });

  it("AnnotationCandidate の status は pending / accepted / rejected のみ許容", () => {
    expectTypeOf<AnnotationCandidate["status"]>().toEqualTypeOf<
      "pending" | "accepted" | "rejected"
    >();
  });

  it("NewAnnotationCandidate を structured_json ソースで作成できる", () => {
    const now = Date.now();
    const candidate: NewAnnotationCandidate = {
      run_id: 1,
      annotation_task_id: 1,
      target_text_ref: "test_case:42",
      source_type: "structured_json",
      label: "insight",
      start_line: 5,
      end_line: 8,
      quote: "新しい認識が含まれているため",
      rationale: "気づきのパターンに一致する",
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(candidate).toMatchTypeOf<NewAnnotationCandidate>();
  });

  it("NewAnnotationCandidate を trace_step ソースで作成できる", () => {
    const now = Date.now();
    const candidate: NewAnnotationCandidate = {
      run_id: 2,
      annotation_task_id: 1,
      target_text_ref: "test_case:42",
      source_type: "trace_step",
      source_step_id: "step-001",
      label: "action_trigger",
      start_line: 12,
      end_line: 15,
      quote: "行動を促す表現が含まれる",
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(candidate).toMatchTypeOf<NewAnnotationCandidate>();
  });

  it("NewAnnotationCandidate の status はデフォルト値があるためオプショナル", () => {
    expectTypeOf<NewAnnotationCandidate["status"]>().toEqualTypeOf<
      "pending" | "accepted" | "rejected" | undefined
    >();
  });
});

describe("gold_annotations スキーマ型定義", () => {
  it("GoldAnnotation は必須フィールドを持つ", () => {
    type RequiredFields = {
      id: number;
      annotation_task_id: number;
      target_text_ref: string;
      label: string;
      start_line: number;
      end_line: number;
      quote: string;
      created_at: number;
      updated_at: number;
    };
    expectTypeOf<
      Pick<
        GoldAnnotation,
        | "id"
        | "annotation_task_id"
        | "target_text_ref"
        | "label"
        | "start_line"
        | "end_line"
        | "quote"
        | "created_at"
        | "updated_at"
      >
    >().toMatchTypeOf<RequiredFields>();
  });

  it("GoldAnnotation の note はオプショナル（null許容）", () => {
    expectTypeOf<GoldAnnotation["note"]>().toEqualTypeOf<string | null>();
  });

  it("GoldAnnotation の source_candidate_id はオプショナル（null許容）", () => {
    expectTypeOf<GoldAnnotation["source_candidate_id"]>().toEqualTypeOf<number | null>();
  });

  it("NewGoldAnnotation を候補採用で作成できる", () => {
    const now = Date.now();
    const gold: NewGoldAnnotation = {
      annotation_task_id: 1,
      target_text_ref: "test_case:42",
      label: "insight",
      start_line: 5,
      end_line: 8,
      quote: "新しい認識が含まれているため",
      source_candidate_id: 10,
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(gold).toMatchTypeOf<NewGoldAnnotation>();
  });

  it("NewGoldAnnotation を手動作成できる（source_candidate_id なし）", () => {
    const now = Date.now();
    const gold: NewGoldAnnotation = {
      annotation_task_id: 1,
      target_text_ref: "test_case:42",
      label: "idea",
      start_line: 20,
      end_line: 22,
      quote: "アイディアの断片",
      note: "手動で追加したアノテーション",
      created_at: now,
      updated_at: now,
    };
    expectTypeOf(gold).toMatchTypeOf<NewGoldAnnotation>();
  });
});

describe("AnnotationSourceType / AnnotationCandidateStatus / AnnotationOutputMode ユーティリティ型", () => {
  it("AnnotationSourceType は 3 種類の値を持つ", () => {
    expectTypeOf<AnnotationSourceType>().toEqualTypeOf<
      "final_answer" | "structured_json" | "trace_step"
    >();
  });

  it("AnnotationCandidateStatus は 3 種類の値を持つ", () => {
    expectTypeOf<AnnotationCandidateStatus>().toEqualTypeOf<"pending" | "accepted" | "rejected">();
  });

  it("AnnotationOutputMode は span_label のみ", () => {
    expectTypeOf<AnnotationOutputMode>().toEqualTypeOf<"span_label">();
  });
});
