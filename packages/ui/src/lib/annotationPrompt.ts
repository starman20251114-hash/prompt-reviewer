import type { AnnotationLabel } from "./api";

export type AnnotationPromptParams = {
  taskName: string;
  labels: AnnotationLabel[];
  extractionTarget: string;
  criteria?: string;
};

export function generateAnnotationPrompt(params: AnnotationPromptParams): string {
  const { labels, extractionTarget, criteria } = params;

  const labelLines = labels.map((label) => `- ${label.key}: ${label.name}`).join("\n");

  const criteriaSection = criteria?.trim() ? `## 判定基準\n${criteria.trim()}\n\n` : "";

  return `あなたはテキストアノテーターです。
${extractionTarget}を読み、以下のカテゴリに該当する箇所をすべて特定してください。

## アノテーションカテゴリ
${labelLines}

${criteriaSection}## 出力形式
必ず以下のJSON形式のみで回答してください（前後に説明文を入れないこと）:
{"items":[
  {"label":"カテゴリキー","start_line":行番号,"end_line":行番号,"quote":"該当テキストの引用","rationale":"アノテーション理由"}
]}

## 注意事項
- start_line と end_line はテキストの行番号（1始まり）
- quote は対象行のテキストを正確に引用すること
- 該当箇所がない場合は {"items":[]} のみを返すこと
- JSON以外の文字列は一切出力しないこと`;
}
