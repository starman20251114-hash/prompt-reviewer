/**
 * サンプルデータ投入スクリプト
 *
 * 全テーブルにサンプルデータを投入して動作確認に使用する。
 * 実行: pnpm run seed
 *
 * ※ 既存データは削除されるため、開発環境のみで使用すること
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";
import type { ConversationMessage } from "./schema/runs.js";

const dbPath = process.env.DB_PATH ?? "./dev.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

/**
 * returning() の結果から最初の要素を取得する。
 * undefined の場合はエラーをスローして型安全性を確保する。
 */
function getFirstOrThrow<T>(rows: T[], label: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${label} の挿入に失敗しました: returning() が空を返しました`);
  }
  return row;
}

async function seed() {
  console.log("サンプルデータの投入を開始します...");

  // 既存データをクリア（外部キー制約の順序に従って削除）
  sqlite.exec("DELETE FROM scores");
  sqlite.exec("DELETE FROM runs");
  sqlite.exec("DELETE FROM prompt_versions");
  sqlite.exec("DELETE FROM prompt_families");
  sqlite.exec("DELETE FROM test_cases");
  sqlite.exec("DELETE FROM project_settings");
  sqlite.exec("DELETE FROM projects");
  console.log("既存データを削除しました");

  // 1. プロジェクト作成
  const now = Date.now();
  const project = getFirstOrThrow(
    await db
      .insert(schema.projects)
      .values({
        name: "カスタマーサポートBotの改善",
        description: "ECサイト向けカスタマーサポートのシステムプロンプトを最適化するプロジェクト",
        created_at: now,
        updated_at: now,
      })
      .returning(),
    "project",
  );
  console.log(`プロジェクト作成: id=${project.id}`);

  // 2. プロジェクト設定作成
  const settings = getFirstOrThrow(
    await db
      .insert(schema.project_settings)
      .values({
        project_id: project.id,
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
        created_at: now,
        updated_at: now,
      })
      .returning(),
    "project_settings",
  );
  console.log(`プロジェクト設定作成: id=${settings.id}`);

  // 3. テストケース作成
  const turns1 = JSON.stringify([
    { role: "user", content: "注文した商品がまだ届いていません。注文番号は#12345です。" },
  ] satisfies ConversationMessage[]);

  const turns2 = JSON.stringify([
    { role: "user", content: "返品したいのですが、どうすればいいですか？" },
    {
      role: "assistant",
      content: "返品ポリシーについてご説明します。購入から30日以内であれば...",
    },
    { role: "user", content: "30日以上経過しているのですが、それでも返品できますか？" },
  ] satisfies ConversationMessage[]);

  const testCase1 = getFirstOrThrow(
    await db
      .insert(schema.test_cases)
      .values({
        project_id: project.id,
        title: "配送遅延の問い合わせ",
        turns: turns1,
        context_content:
          "注文履歴:\n- 注文番号: #12345\n- 商品: ワイヤレスヘッドフォン\n- 注文日: 2025-04-01\n- 配送予定日: 2025-04-05",
        expected_description:
          "配送状況を確認し、謝罪と解決策（追跡番号の提供、再発送の提案など）を提示する",
        display_order: 1,
        created_at: now,
        updated_at: now,
      })
      .returning(),
    "testCase1",
  );
  console.log(`テストケース1作成: id=${testCase1.id}`);

  const testCase2 = getFirstOrThrow(
    await db
      .insert(schema.test_cases)
      .values({
        project_id: project.id,
        title: "返品条件外の返品依頼（マルチターン）",
        turns: turns2,
        context_content:
          "顧客情報:\n- 会員ランク: シルバー\n- 購入日: 2025-01-15\n- 商品: スマートウォッチ（使用済み）",
        expected_description:
          "30日超過の場合でも、状況に応じた代替案（修理サービス、ポイント補償など）を提案し、顧客満足度を維持する",
        display_order: 2,
        created_at: now,
        updated_at: now,
      })
      .returning(),
    "testCase2",
  );
  console.log(`テストケース2作成: id=${testCase2.id}`);

  // 4. プロンプトファミリー作成
  const promptFamily = getFirstOrThrow(
    await db
      .insert(schema.prompt_families)
      .values({
        name: "カスタマーサポートBot",
        description: "ECサイト向けカスタマーサポートのプロンプト系列",
        created_at: now,
        updated_at: now,
      })
      .returning(),
    "promptFamily",
  );
  console.log(`プロンプトファミリー作成: id=${promptFamily.id}`);

  // 5. プロンプトバージョン作成
  const promptV1 = getFirstOrThrow(
    await db
      .insert(schema.prompt_versions)
      .values({
        prompt_family_id: promptFamily.id,
        project_id: project.id,
        version: 1,
        name: "初期バージョン",
        memo: "基本的な対応ができるシンプルなプロンプト",
        content:
          "あなたはECサイトのカスタマーサポート担当者です。お客様の問い合わせに丁寧に回答してください。",
        created_at: now,
      })
      .returning(),
    "promptV1",
  );
  console.log(`プロンプトバージョン1作成: id=${promptV1.id}`);

  const promptV2 = getFirstOrThrow(
    await db
      .insert(schema.prompt_versions)
      .values({
        prompt_family_id: promptFamily.id,
        project_id: project.id,
        version: 2,
        name: "共感強化バージョン",
        memo: "共感表現と具体的な解決策の提示を強化",
        content: `あなたはECサイトのカスタマーサポート担当者です。

以下の原則に従って対応してください:
1. まずお客様の状況に共感を示す
2. {{context}} に記載された情報を参照して具体的な回答を提供する
3. 解決策を明確に提示し、次のステップを案内する
4. 必要に応じてエスカレーションを提案する`,
        parent_version_id: promptV1.id,
        created_at: now + 1000,
      })
      .returning(),
    "promptV2",
  );
  console.log(`プロンプトバージョン2作成: id=${promptV2.id}`);

  // 6. 実行結果（runs）作成
  const conversation1 = JSON.stringify([
    { role: "user", content: "注文した商品がまだ届いていません。注文番号は#12345です。" },
    {
      role: "assistant",
      content:
        "ご不便をおかけして申し訳ございません。注文番号#12345について確認いたします。現在の状況をお調べしますので、少々お待ちください。配送の追跡番号をご案内できます。",
    },
  ] satisfies ConversationMessage[]);

  const run1 = getFirstOrThrow(
    await db
      .insert(schema.runs)
      .values({
        project_id: project.id,
        prompt_version_id: promptV1.id,
        test_case_id: testCase1.id,
        conversation: conversation1,
        is_best: false,
        created_at: now + 2000,
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      })
      .returning(),
    "run1",
  );
  console.log(`実行結果1作成: id=${run1.id}`);

  const conversation2 = JSON.stringify([
    { role: "user", content: "注文した商品がまだ届いていません。注文番号は#12345です。" },
    {
      role: "assistant",
      content:
        "お待たせしてしまい、大変申し訳ございません。注文番号#12345のご注文を確認しました。配送状況をご案内いたします。追跡番号: TRK-789456 でヤマト運輸のサイトでご確認いただけます。本日中に配送予定となっておりますが、何かご不明な点がございましたらお気軽にお申し付けください。",
    },
  ] satisfies ConversationMessage[]);

  const run2 = getFirstOrThrow(
    await db
      .insert(schema.runs)
      .values({
        project_id: project.id,
        prompt_version_id: promptV2.id,
        test_case_id: testCase1.id,
        conversation: conversation2,
        is_best: true,
        created_at: now + 3000,
        model: "claude-opus-4-5",
        temperature: 0.7,
        api_provider: "anthropic",
      })
      .returning(),
    "run2",
  );
  console.log(`実行結果2作成: id=${run2.id} (ベスト回答)`);

  // 7. スコア（scores）作成
  const score1 = getFirstOrThrow(
    await db
      .insert(schema.scores)
      .values({
        run_id: run1.id,
        human_score: 3,
        human_comment: "基本的な対応はできているが、共感表現が不足。追跡番号の提供が遅い。",
        judge_score: null,
        judge_reason: null,
        is_discarded: false,
        created_at: now + 4000,
        updated_at: now + 4000,
      })
      .returning(),
    "score1",
  );
  console.log(`スコア1作成: id=${score1.id}, human_score=${score1.human_score}`);

  const score2 = getFirstOrThrow(
    await db
      .insert(schema.scores)
      .values({
        run_id: run2.id,
        human_score: 5,
        human_comment:
          "共感表現が適切で、具体的な追跡番号も提供できている。顧客目線の対応ができている。",
        judge_score: null,
        judge_reason: null,
        is_discarded: false,
        created_at: now + 5000,
        updated_at: now + 5000,
      })
      .returning(),
    "score2",
  );
  console.log(`スコア2作成: id=${score2.id}, human_score=${score2.human_score}`);

  console.log("\nサンプルデータの投入が完了しました！");
  console.log(`
投入データのサマリー:
  - プロジェクト: 1件
  - プロジェクト設定: 1件
  - テストケース: 2件
  - プロンプトファミリー: 1件
  - プロンプトバージョン: 2件 (v1 -> v2 の分岐)
  - 実行結果: 2件 (run2 がベスト回答)
  - スコア: 2件 (3点, 5点)
  `);
}

seed()
  .then(() => {
    sqlite.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error("シードデータの投入に失敗しました:", error);
    sqlite.close();
    process.exit(1);
  });
