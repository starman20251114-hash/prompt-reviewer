import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { runs } from "./runs";

export const annotation_tasks = sqliteTable(
  "annotation_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    output_mode: text("output_mode", { enum: ["span_label"] })
      .notNull()
      .default("span_label"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [check("annotation_tasks_output_mode_check", sql`${t.output_mode} in ('span_label')`)],
);

export const annotation_labels = sqliteTable(
  "annotation_labels",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    annotation_task_id: integer("annotation_task_id")
      .notNull()
      .references(() => annotation_tasks.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    display_order: integer("display_order").notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("annotation_labels_task_key_unique").on(t.annotation_task_id, t.key)],
);

export const annotation_candidates = sqliteTable(
  "annotation_candidates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    run_id: integer("run_id")
      .notNull()
      .references(() => runs.id),
    annotation_task_id: integer("annotation_task_id")
      .notNull()
      .references(() => annotation_tasks.id),
    // "test_case:{id}" 形式。将来 "context_asset:{id}" へ拡張可能
    target_text_ref: text("target_text_ref").notNull(),
    source_type: text("source_type", {
      enum: ["final_answer", "structured_json", "trace_step"],
    }).notNull(),
    source_step_id: text("source_step_id"),
    label: text("label").notNull(),
    start_line: integer("start_line").notNull(),
    end_line: integer("end_line").notNull(),
    quote: text("quote").notNull(),
    rationale: text("rationale"),
    status: text("status", { enum: ["pending", "accepted", "rejected"] })
      .notNull()
      .default("pending"),
    note: text("note"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "annotation_candidates_source_type_check",
      sql`${t.source_type} in ('final_answer', 'structured_json', 'trace_step')`,
    ),
    check(
      "annotation_candidates_status_check",
      sql`${t.status} in ('pending', 'accepted', 'rejected')`,
    ),
  ],
);

export const gold_annotations = sqliteTable("gold_annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  annotation_task_id: integer("annotation_task_id")
    .notNull()
    .references(() => annotation_tasks.id),
  target_text_ref: text("target_text_ref").notNull(),
  label: text("label").notNull(),
  start_line: integer("start_line").notNull(),
  end_line: integer("end_line").notNull(),
  quote: text("quote").notNull(),
  note: text("note"),
  source_candidate_id: integer("source_candidate_id").references(() => annotation_candidates.id),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export type AnnotationTask = typeof annotation_tasks.$inferSelect;
export type NewAnnotationTask = typeof annotation_tasks.$inferInsert;

export type AnnotationLabel = typeof annotation_labels.$inferSelect;
export type NewAnnotationLabel = typeof annotation_labels.$inferInsert;

export type AnnotationCandidate = typeof annotation_candidates.$inferSelect;
export type NewAnnotationCandidate = typeof annotation_candidates.$inferInsert;

export type GoldAnnotation = typeof gold_annotations.$inferSelect;
export type NewGoldAnnotation = typeof gold_annotations.$inferInsert;

export type AnnotationSourceType = "final_answer" | "structured_json" | "trace_step";
export type AnnotationCandidateStatus = "pending" | "accepted" | "rejected";
export type AnnotationOutputMode = "span_label";
