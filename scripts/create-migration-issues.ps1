$issues = @(
  @{
    Title = "新ドメインモデル用スキーマを追加する"
    Body = @'
## 目的

新データモデルの土台となるテーブルを Drizzle schema と migration に追加する。

## 対象

- `packages/core/src/schema/`
- `packages/core/drizzle/`
- `packages/core/drizzle.config.ts`
- 必要なら `packages/core/scripts/check-db-schema.mjs`

## 実装内容

- `prompt_families` テーブルを追加
- `execution_profiles` テーブルを追加
- `context_assets` テーブルを追加
- `test_case_projects` 中間テーブルを追加
- `prompt_version_projects` 中間テーブルを追加
- `test_case_context_assets` 中間テーブルを追加
- `prompt_family_context_assets` 中間テーブルを追加
- `runs.execution_profile_id` を追加
- 一意制約を追加
  - `UNIQUE(test_case_id, project_id)`
  - `UNIQUE(prompt_version_id, project_id)`
  - `UNIQUE(test_case_id, context_asset_id)`
  - `UNIQUE(prompt_family_id, context_asset_id)`

## 完了条件

- Drizzle schema が新 ER 図と整合している
- migration ファイルが生成済み
- schema 検証スクリプトが通る

## テスト

- schema の型テスト
- `check-db-schema.mjs` の期待カラム更新

## 依存

- なし
'@
  },
  @{
    Title = "既存データを新スキーマへ移す移行方針とスクリプトを作成する"
    Body = @'
## 目的

旧テーブル/旧ファイル構造のデータを、新テーブルへ安全に移す。

## 対象

- `packages/core/scripts/`
- 必要なら `scripts/`
- `README.md` または `README.local.md`

## 実装内容

- 既存 `projects` をそのままラベルとして流用する方針を明文化
- 既存 `prompt_versions.project_id` から `prompt_version_projects` を生成
- 既存 `test_cases.project_id` から `test_case_projects` を生成
- 既存 `project_settings` から `execution_profiles` を生成
- 既存 `runs` に `execution_profile_id` を補完するルールを実装
- 既存 `data/context-files/<projectId>/...` を走査し、`context_assets` と関連テーブルへ変換するスクリプトを作成
- 重複ファイルの扱いを決める
  - 初期実装は project ごとに別 asset でも可

## 完了条件

- 空でない既存 DB に対して移行スクリプトが動く
- 主要データが新テーブルへコピーされる
- 再実行時の挙動が明確

## テスト

- サンプル DB を使った移行テスト
- `context-files` 取り込みテスト

## 依存

- 新ドメインモデル用スキーマを追加する
'@
  },
  @{
    Title = "`execution_profiles` の schema/export と API ルーターを追加する"
    Body = @'
## 目的

旧 `project_settings` を置き換える新 API を追加する。

## 対象

- `packages/core/src/schema/index.ts`
- `packages/server/src/routes/execution-profiles.ts` 新規
- `packages/server/src/routes/execution-profiles.test.ts` 新規
- `packages/server/src/index.ts`

## 実装内容

- `GET /api/execution-profiles`
- `POST /api/execution-profiles`
- `GET /api/execution-profiles/:id`
- `PATCH /api/execution-profiles/:id`
- `DELETE /api/execution-profiles/:id`
- `POST /api/execution-profiles/models`
- モデル一覧取得ロジックを `project-settings` ルーターから切り出す

## 完了条件

- `execution_profiles` CRUD が API から利用できる
- モデル一覧取得 API が新経路で使える

## テスト

- CRUD テスト
- バリデーションテスト
- モデル一覧取得テスト

## 依存

- 新ドメインモデル用スキーマを追加する
'@
  },
  @{
    Title = "`project_settings` を互換レイヤ化する"
    Body = @'
## 目的

旧 UI を壊さずに、`project_settings` API を `execution_profiles` ベースへ寄せる。

## 対象

- `packages/server/src/routes/project-settings.ts`
- `packages/server/src/routes/project-settings.test.ts`

## 実装内容

- `GET /api/projects/:projectId/settings` を、対応する既定 `execution_profile` を返す実装に寄せる
- `PUT /api/projects/:projectId/settings` を、内部的には `execution_profiles` を更新/作成する挙動へ変更
- 互換のためレスポンス形は当面維持
- project ごとの既定 profile 選定ルールを明文化

## 完了条件

- 旧 settings UI から操作しても新テーブル側が更新される
- 既存テストが通る

## テスト

- 互換レスポンステスト
- 新旧整合テスト

## 依存

- 既存データを新スキーマへ移す移行方針とスクリプトを作成する
- `execution_profiles` の schema/export と API ルーターを追加する
'@
  },
  @{
    Title = "`prompt_families` API を追加する"
    Body = @'
## 目的

プロンプトの系列単位を扱う API を追加する。

## 対象

- `packages/core/src/schema/`
- `packages/server/src/routes/prompt-families.ts` 新規
- `packages/server/src/routes/prompt-families.test.ts` 新規
- `packages/server/src/index.ts`

## 実装内容

- `GET /api/prompt-families`
- `POST /api/prompt-families`
- `GET /api/prompt-families/:id`
- `PATCH /api/prompt-families/:id`
- `DELETE /api/prompt-families/:id`
- 検索・ページ内並び順に必要な最小限のクエリ対応

## 完了条件

- prompt family の CRUD が成立する

## テスト

- CRUD テスト
- 404 / 400 テスト

## 依存

- 新ドメインモデル用スキーマを追加する
'@
  },
  @{
    Title = "`prompt_versions` を `prompt_family` 前提へ移行する"
    Body = @'
## 目的

`prompt_versions` の主従を `project` から `prompt_family` に切り替える。

## 対象

- `packages/core/src/schema/prompt-versions.ts`
- `packages/server/src/routes/prompt-versions.ts`
- `packages/server/src/routes/prompt-versions.test.ts`

## 実装内容

- `GET /api/prompt-versions`
- `POST /api/prompt-versions`
- `GET /api/prompt-versions/:id`
- `PATCH /api/prompt-versions/:id`
- `POST /api/prompt-versions/:id/branch`
- `PATCH /api/prompt-versions/:id/selected`
- `prompt_family_id` ベースで `version` を採番する
- `PUT /api/prompt-versions/:id/projects` を追加する

## 完了条件

- 新 API で prompt version の一覧/作成/分岐/選択が可能
- `project_id` 依存なしで動作する

## テスト

- family 単位の連番採番テスト
- branch テスト
- selected 切り替えテスト
- ラベル付けテスト

## 依存

- 新ドメインモデル用スキーマを追加する
- 既存データを新スキーマへ移す移行方針とスクリプトを作成する
- `prompt_families` API を追加する
'@
  },
  @{
    Title = "旧 `prompt-versions` API を互換レイヤ化する"
    Body = @'
## 目的

既存 UI の `/projects/:projectId/prompt-versions` を新モデル上で動かす。

## 対象

- `packages/server/src/routes/prompt-versions.ts`
- `packages/server/src/routes/prompt-versions.test.ts`

## 実装内容

- 旧 `/api/projects/:projectId/prompt-versions` を維持しつつ、内部的には `prompt_version_projects` でフィルタする
- 旧レスポンスに必要な `project_id` は互換のため補完する
- family が複数 project にラベル付けされている場合の挙動を明示

## 完了条件

- 既存 UI が壊れない
- 新旧 API の結果が矛盾しない

## テスト

- project フィルタ互換テスト
- legacy path の CRUD テスト

## 依存

- `prompt_versions` を `prompt_family` 前提へ移行する
'@
  },
  @{
    Title = "`context_assets` API を追加する"
    Body = @'
## 目的

旧 `context-files` を置き換える独立資産 API を追加する。

## 対象

- `packages/server/src/routes/context-assets.ts` 新規
- `packages/server/src/routes/context-assets.test.ts` 新規
- `packages/server/src/index.ts`

## 実装内容

- `GET /api/context-assets`
- `POST /api/context-assets`
- `GET /api/context-assets/:id`
- `PATCH /api/context-assets/:id`
- `DELETE /api/context-assets/:id`
- `PUT /api/context-assets/:id/projects`
- `linked_to=test_case:*` / `linked_to=prompt_family:*` フィルタ対応
- `q`, `project_id`, `unclassified` フィルタ対応

## 完了条件

- DB 保存の context asset CRUD が成立する

## テスト

- CRUD テスト
- フィルタテスト
- ラベル付けテスト

## 依存

- 新ドメインモデル用スキーマを追加する
'@
  },
  @{
    Title = "旧 `context-files` API を互換レイヤ化する"
    Body = @'
## 目的

既存 `ContextFilesPage` と `TestCasesPage` の素材取り込みを、新 `context_assets` で裏打ちする。

## 対象

- `packages/server/src/routes/context-files.ts`
- `packages/server/src/routes/context-files.test.ts`

## 実装内容

- 旧 `GET /api/projects/:projectId/context-files` を、project ラベル付きの `context_assets` 一覧に変換して返す
- 旧 `POST /api/projects/:projectId/context-files` を、内部的には `context_assets` 作成 + project ラベル付けに変換する
- 旧 `GET/PUT /content` も `context_assets` ベースへ置換する
- path ベース指定と asset ID ベース内部処理の対応を持つ

## 完了条件

- 旧 UI からのコンテキスト一覧/編集/取り込みが動く

## テスト

- 既存互換テスト更新
- project フィルタ互換テスト

## 依存

- 既存データを新スキーマへ移す移行方針とスクリプトを作成する
- `context_assets` API を追加する
'@
  },
  @{
    Title = "`test_cases` API を独立資産化する"
    Body = @'
## 目的

テストケース API を project 親子モデルから独立資産モデルへ移す。

## 対象

- `packages/server/src/routes/test-cases.ts`
- `packages/server/src/routes/test-cases.test.ts`

## 実装内容

- `GET /api/test-cases`
- `POST /api/test-cases`
- `GET /api/test-cases/:id`
- `PATCH /api/test-cases/:id`
- `DELETE /api/test-cases/:id`
- `PUT /api/test-cases/:id/projects`
- `PUT /api/test-cases/:id/context-assets`
- `project_id` / `unclassified` / `q` フィルタ対応

## 完了条件

- project 非依存で test case CRUD が成立する
- context asset 関連付けが可能

## テスト

- CRUD テスト
- ラベル付けテスト
- context asset 関連付けテスト

## 依存

- 新ドメインモデル用スキーマを追加する
- `context_assets` API を追加する
'@
  },
  @{
    Title = "旧 `test-cases` API を互換レイヤ化する"
    Body = @'
## 目的

既存 UI の `/projects/:projectId/test-cases` を新モデル上で動かす。

## 対象

- `packages/server/src/routes/test-cases.ts`
- `packages/server/src/routes/test-cases.test.ts`

## 実装内容

- 旧 path を維持しつつ内部的には `test_case_projects` で project フィルタする
- 互換レスポンス用の `project_id` を補完する
- 新旧 API 間のバリデーション差分を吸収する

## 完了条件

- 既存 UI が壊れない

## テスト

- 旧 path 互換テスト
- 新旧 API 同値テスト

## 依存

- `test_cases` API を独立資産化する
'@
  },
  @{
    Title = "`runs` API を `execution_profile` / prompt-label 基準に移行する"
    Body = @'
## 目的

Run API を新モデルへ移し、`project` 絞り込みをプロンプト側ラベル基準に統一する。

## 対象

- `packages/server/src/routes/runs.ts`
- `packages/server/src/routes/runs.test.ts`
- `packages/server/src/routes/score-progression.ts`

## 実装内容

- `GET /api/runs`
- `POST /api/runs`
- `POST /api/runs/execute`
- `GET /api/runs/:id`
- `PATCH /api/runs/:id/best`
- `PATCH /api/runs/:id/discard`
- `project_id` フィルタを `prompt_version_projects` 基準で実装
- Run 作成時に `execution_profile` から snapshot を保存
- score progression の集計条件も同じ基準にそろえる

## 完了条件

- 新 API で runs の CRUD/execute が成立する
- score progression が新フィルタ定義で動く

## テスト

- project フィルタの基準テスト
- execution_profile snapshot テスト
- best/discard テスト
- progression 集計テスト

## 依存

- `execution_profiles` の schema/export と API ルーターを追加する
- `prompt_versions` を `prompt_family` 前提へ移行する
- `test_cases` API を独立資産化する
'@
  },
  @{
    Title = "旧 `runs` / `score-progression` API を互換レイヤ化する"
    Body = @'
## 目的

既存 Runs / Score / Progression 画面を壊さずに新モデルへつなぐ。

## 対象

- `packages/server/src/routes/runs.ts`
- `packages/server/src/routes/score-progression.ts`

## 実装内容

- `/api/projects/:projectId/runs` を新 `runs` API の project フィルタへ委譲
- `/api/projects/:projectId/score-progression` を新集計へ委譲
- legacy response shape の `project_id` を補完

## 完了条件

- 既存 UI から Run 一覧/実行/推移表示が継続利用できる

## テスト

- legacy path 互換テスト

## 依存

- `runs` API を `execution_profile` / prompt-label 基準に移行する
'@
  },
  @{
    Title = "UI API クライアントを新エンドポイントへ対応させる"
    Body = @'
## 目的

新 API を呼ぶフロント API クライアントを追加する。

## 対象

- `packages/ui/src/lib/api.ts`

## 実装内容

- `getContextAssets` / `createContextAsset` / `updateContextAsset` / `deleteContextAsset`
- `getPromptFamilies` / `createPromptFamily`
- `getExecutionProfiles` / `createExecutionProfile` / `updateExecutionProfile`
- 独立 `getTestCases` / `getPromptVersions` / `getRuns` を追加
- 旧メソッドは互換利用のため一旦残す

## 完了条件

- UI から新 API を呼ぶための関数群がそろう

## テスト

- 必要なら API クライアント単体テスト

## 依存

- `execution_profiles` の schema/export と API ルーターを追加する
- `prompt_versions` を `prompt_family` 前提へ移行する
- `context_assets` API を追加する
- `test_cases` API を独立資産化する
- `runs` API を `execution_profile` / prompt-label 基準に移行する
'@
  },
  @{
    Title = "Project Settings 画面を Execution Profiles 画面へ置き換える"
    Body = @'
## 目的

`ProjectSettingsPage` を廃止し、独立した `ExecutionProfilesPage` を導入する。

## 対象

- `packages/ui/src/pages/ProjectSettingsPage.tsx`
- `packages/ui/src/pages/ProjectSettingsPage.module.css`
- `packages/ui/src/pages/ExecutionProfilesPage.tsx` 新規
- `packages/ui/src/pages/ExecutionProfilesPage.module.css` 新規
- `packages/ui/src/App.tsx`
- `packages/ui/src/components/Layout.tsx`

## 実装内容

- execution profiles 一覧/作成/編集 UI を作る
- モデル一覧取得 UI を新 API に接続
- 旧 project settings 画面導線を新画面へ差し替える

## 完了条件

- settings 依存なしで実行設定を管理できる

## テスト

- 必要ならコンポーネントテスト

## 依存

- UI API クライアントを新エンドポイントへ対応させる
'@
  },
  @{
    Title = "Prompts 画面を Prompt Families + Prompt Versions モデルへ置き換える"
    Body = @'
## 目的

`PromptsPage` を project 前提から family 前提へ移す。

## 対象

- `packages/ui/src/pages/PromptsPage.tsx`
- `packages/ui/src/pages/PromptsPage.module.css`

## 実装内容

- prompt family の選択 UI を追加
- family 単位の version 履歴表示に変更
- project ラベルはフィルタ/タグ表示として扱う
- version 作成・branch・selected 更新を新 API に接続

## 完了条件

- prompt family ベースで UI が成立する

## テスト

- 必要ならコンポーネントテスト

## 依存

- UI API クライアントを新エンドポイントへ対応させる
'@
  },
  @{
    Title = "ContextFiles 画面を ContextAssets 画面へ置き換える"
    Body = @'
## 目的

旧 `ContextFilesPage` を、独立資産を扱う `ContextAssetsPage` に置き換える。

## 対象

- `packages/ui/src/pages/ContextFilesPage.tsx`
- `packages/ui/src/pages/ContextFilesPage.module.css`
- `packages/ui/src/pages/ContextAssetsPage.tsx` 新規
- `packages/ui/src/pages/ContextAssetsPage.module.css` 新規
- `packages/ui/src/App.tsx`

## 実装内容

- context assets 一覧/作成/編集/削除 UI を作る
- project ラベルによるフィルタを追加
- `linked_to` による関連状況表示を追加
- 旧 page からの導線を新 page へ差し替える

## 完了条件

- コンテキスト素材を独立画面で管理できる

## テスト

- 必要ならコンポーネントテスト

## 依存

- UI API クライアントを新エンドポイントへ対応させる
'@
  },
  @{
    Title = "Test Cases 画面を独立資産 + context assets 関連付け対応へ移す"
    Body = @'
## 目的

`TestCasesPage` から `projectId` 前提を外し、context asset 関連付けを扱えるようにする。

## 対象

- `packages/ui/src/pages/TestCasesPage.tsx`
- `packages/ui/src/pages/TestCasesPage.module.css`

## 実装内容

- 画面 URL を `/test-cases` 基準へ変更
- project はフィルタまたはタグ編集として扱う
- コンテキスト取り込み UI を `context_assets` 一覧から取得する実装へ変更
- 取り込み後は `context_content` 保存を維持
- 必要なら関連 asset の一覧表示を追加

## 完了条件

- project 親子に依存せず test cases を管理できる

## テスト

- 必要ならコンポーネントテスト

## 依存

- UI API クライアントを新エンドポイントへ対応させる
- ContextFiles 画面を ContextAssets 画面へ置き換える
'@
  },
  @{
    Title = "Runs / Score / Progression 画面を新フィルタモデルへ移す"
    Body = @'
## 目的

Run 関連 UI を project 親子から独立させ、プロンプト側ラベル基準に合わせる。

## 対象

- `packages/ui/src/pages/RunsPage.tsx`
- `packages/ui/src/pages/ScorePage.tsx`
- `packages/ui/src/pages/ScoreProgressionPage.tsx`
- 関連 CSS

## 実装内容

- projectId 付き URL 前提を外す
- prompt version / prompt family / execution profile / project label フィルタを追加
- score progression の `project` フィルタを prompt 側ラベル基準で表示に反映する
- Run 実行 UI で `execution_profile` を選択可能にする

## 完了条件

- Run 作成/一覧/採点/推移表示が新 API で動く

## テスト

- 必要ならコンポーネントテスト

## 依存

- UI API クライアントを新エンドポイントへ対応させる
- Project Settings 画面を Execution Profiles 画面へ置き換える
- Prompts 画面を Prompt Families + Prompt Versions モデルへ置き換える
- Test Cases 画面を独立資産 + context assets 関連付け対応へ移す
'@
  },
  @{
    Title = "Projects 画面を「ラベル管理画面」へ再設計する"
    Body = @'
## 目的

`ProjectsPage` / `ProjectDetailPage` を、所有単位 UI からラベル管理 UI へ置き換える。

## 対象

- `packages/ui/src/pages/ProjectsPage.tsx`
- `packages/ui/src/pages/ProjectDetailPage.tsx`
- 関連 CSS
- `packages/ui/src/components/Layout.tsx`

## 実装内容

- projects 一覧をラベル管理 UI に変更
- ラベルの作成/編集/削除に特化する
- project detail の配下ページ導線を廃止または再設計する
- 全体ナビゲーションを資産中心に組み替える

## 完了条件

- project が「分類ラベル」として UI 上で一貫している

## テスト

- 必要ならコンポーネントテスト

## 依存

- Project Settings 画面を Execution Profiles 画面へ置き換える
- Prompts 画面を Prompt Families + Prompt Versions モデルへ置き換える
- ContextFiles 画面を ContextAssets 画面へ置き換える
- Test Cases 画面を独立資産 + context assets 関連付け対応へ移す
- Runs / Score / Progression 画面を新フィルタモデルへ移す
'@
  },
  @{
    Title = "旧 API / 旧 UI 導線の削除"
    Body = @'
## 目的

互換レイヤと旧前提コードを取り除く。

## 対象

- `packages/server/src/routes/project-settings.ts`
- `packages/server/src/routes/context-files.ts`
- legacy `/projects/:projectId/...` ルーティング
- 旧 UI ページ/導線

## 実装内容

- 互換ルート削除
- 旧 API クライアント削除
- 旧ページ/コンポーネント削除
- 不要テスト削除
- ドキュメント更新

## 完了条件

- 旧 project 親子前提コードが repo に残っていない
- README / doc が現状と一致する

## テスト

- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run check`

## 依存

- `project_settings` を互換レイヤ化する
- 旧 `prompt-versions` API を互換レイヤ化する
- 旧 `context-files` API を互換レイヤ化する
- 旧 `test-cases` API を互換レイヤ化する
- 旧 `runs` / `score-progression` API を互換レイヤ化する
- Projects 画面を「ラベル管理画面」へ再設計する
'@
  }
)

$created = @()

foreach ($issue in $issues) {
  $result = gh issue create --title $issue.Title --body $issue.Body
  $created += $result
  Write-Output $result
}
