# API仕様

prompt-reviewer の REST API 案（Hono / Node.js）

ベースURL: `http://localhost:3001/api`

この仕様は、`project` を所有単位ではなく分類ラベルとして扱う新データモデルに基づく。

## この文書の範囲

この文書は、現行の移行対象である基盤 API を中心にまとめたものである。

- annotation 機能のドメイン仕様は `doc/annotation-feature-spec.md` を参照する
- annotation 関連 API は、`context_assets` / `test_cases` / `runs` の移行後に別途この文書へ追加する
- そのため、現時点では annotation 用の resource や endpoint は未定義とする

## 共通仕様

### レスポンス形式

すべてのレスポンスは `application/json`。

### タイムスタンプ

`created_at` / `updated_at` は Unix タイムスタンプ（ミリ秒）。

### エラーレスポンス

```json
{
  "error": "エラーメッセージ"
}
```

| ステータス | 説明 |
|---|---|
| `400` | バリデーションエラー |
| `404` | リソースが見つからない |
| `409` | 一意制約違反や競合 |
| `500` | サーバー内部エラー |

### 分類ラベルの考え方

- `projects` は Gmail のラベルのような分類用途で使う
- `test_cases` / `prompt_versions` / `context_assets` は `project` に所属しなくても存在できる
- `未分類` は `project` レコードではなく、ラベルが 1 件も付いていない状態を指す

## ヘルスチェック

### `GET /health`

**レスポンス `200`**

```json
{ "status": "ok" }
```

## Projects

分類ラベルを管理する API。

### `GET /projects`

ラベル一覧を返す。

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "name": "返金対応",
    "description": "返金問い合わせ系の分類",
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /projects`

ラベルを作成する。

**リクエストボディ**

```json
{
  "name": "返金対応",
  "description": "返金問い合わせ系の分類"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✅ | ラベル名 |
| `description` | string | | 説明 |

### `GET /projects/:id`

ラベル詳細を返す。

### `PATCH /projects/:id`

ラベル名または説明を更新する。

### `DELETE /projects/:id`

ラベルを削除する。資産本体は削除せず、中間テーブルの関連付けのみ解除される。

**レスポンス `204`**

## Context Assets

再利用可能なコンテキスト素材を管理する API。

### `GET /context-assets`

コンテキスト素材一覧を返す。

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `project_id` | number | 指定ラベルが付いた素材に絞り込む |
| `unclassified` | boolean | 未分類のみ返す |
| `linked_to` | string | `test_case:12` / `prompt_family:4` のような関連先で絞り込む |
| `q` | string | `name` / `path` に対する検索文字列 |

**レスポンス `200`**

```json
[
  {
    "id": 10,
    "name": "refund-policy.md",
    "path": "policies/refund-policy.md",
    "mime_type": "text/markdown",
    "content_hash": "sha256:...",
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /context-assets`

素材を作成する。

**リクエストボディ**

```json
{
  "name": "refund-policy.md",
  "path": "policies/refund-policy.md",
  "content": "購入から30日以内であれば返金可能です。",
  "mime_type": "text/markdown"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✅ | 表示名 |
| `path` | string | ✅ | 論理パスまたは元ファイル名 |
| `content` | string | ✅ | 素材本文 |
| `mime_type` | string | ✅ | MIME タイプ |

### `GET /context-assets/:id`

素材詳細を返す。

**レスポンス `200`**

```json
{
  "id": 10,
  "name": "refund-policy.md",
  "path": "policies/refund-policy.md",
  "content": "購入から30日以内であれば返金可能です。",
  "mime_type": "text/markdown",
  "content_hash": "sha256:...",
  "created_at": 1744281600000,
  "updated_at": 1744281600000
}
```

### `PATCH /context-assets/:id`

素材の表示名、パス、本文、MIME タイプを更新する。

**リクエストボディ例**

```json
{
  "name": "refund-policy-v2.md",
  "content": "購入から45日以内であれば返金可能です。"
}
```

### `DELETE /context-assets/:id`

素材を削除する。

**レスポンス `204`**

### `PUT /context-assets/:id/projects`

素材に付与するラベル一覧を全置換する。

**リクエストボディ**

```json
{
  "project_ids": [1, 5]
}
```

## Test Cases

テストケース本体を管理する API。

### `GET /test-cases`

テストケース一覧を返す。

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `project_id` | number | 指定ラベルが付いたテストケースに絞り込む |
| `unclassified` | boolean | 未分類のみ返す |
| `q` | string | タイトル検索 |

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "title": "返金手続きの問い合わせ",
    "turns": [
      { "role": "user", "content": "返金の手続きを教えてください" }
    ],
    "context_content": "【返金ポリシー】購入から30日以内であれば返金可能です。",
    "expected_description": "丁寧に返金手続きを案内すること",
    "display_order": 0,
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /test-cases`

テストケースを作成する。

**リクエストボディ**

```json
{
  "title": "返金手続きの問い合わせ",
  "turns": [
    { "role": "user", "content": "返金の手続きを教えてください" }
  ],
  "context_content": "【返金ポリシー】購入から30日以内であれば返金可能です。",
  "expected_description": "丁寧に返金手続きを案内すること",
  "display_order": 0
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `title` | string | ✅ | テストケース名 |
| `turns` | `{role, content}[]` | | マルチターン会話履歴 |
| `context_content` | string | | 実行時に埋め込む最終コンテキスト |
| `expected_description` | string | | 期待する出力の自由記述 |
| `display_order` | number | | 一覧表示順 |

### `GET /test-cases/:id`

テストケース詳細を返す。

### `PATCH /test-cases/:id`

テストケースを更新する。

### `DELETE /test-cases/:id`

テストケースを削除する。

**レスポンス `204`**

### `PUT /test-cases/:id/projects`

テストケースに付与するラベル一覧を全置換する。

**リクエストボディ**

```json
{
  "project_ids": [1, 5]
}
```

### `PUT /test-cases/:id/context-assets`

テストケースに関連付ける素材一覧を全置換する。

**リクエストボディ**

```json
{
  "context_asset_ids": [10, 12, 18]
}
```

補足:
- これは「関連素材」の管理用 API
- 実行時に使う最終文面は引き続き `context_content` に保存する

## Prompt Families

同一系統のプロンプト群を管理する API。

### `GET /prompt-families`

プロンプト系統一覧を返す。

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `q` | string | 系統名検索 |

**レスポンス `200`**

```json
[
  {
    "id": 4,
    "name": "返金対応プロンプト",
    "description": "返金問い合わせに対応するプロンプト系列",
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /prompt-families`

プロンプト系統を作成する。

**リクエストボディ**

```json
{
  "name": "返金対応プロンプト",
  "description": "返金問い合わせに対応するプロンプト系列"
}
```

### `GET /prompt-families/:id`

プロンプト系統詳細を返す。

### `PATCH /prompt-families/:id`

プロンプト系統を更新する。

### `DELETE /prompt-families/:id`

プロンプト系統を削除する。

**レスポンス `204`**

### `PUT /prompt-families/:id/context-assets`

プロンプト系統に関連付ける素材一覧を全置換する。

**リクエストボディ**

```json
{
  "context_asset_ids": [4, 7]
}
```

## Prompt Versions

プロンプトバージョンを管理する API。

### `GET /prompt-versions`

プロンプトバージョン一覧を返す。

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `prompt_family_id` | number | 系統で絞り込む |
| `project_id` | number | 指定ラベルが付いたバージョンに絞り込む |
| `selected_only` | boolean | `is_selected = true` のみ返す |

**レスポンス `200`**

```json
[
  {
    "id": 10,
    "prompt_family_id": 4,
    "version": 3,
    "name": "返金対応 v3",
    "memo": "確認質問を先に入れる",
    "content": "あなたは返金問い合わせ対応ボットです。",
    "workflow_definition": null,
    "parent_version_id": 8,
    "is_selected": true,
    "created_at": 1744281600000
  }
]
```

### `POST /prompt-versions`

プロンプトバージョンを作成する。

**リクエストボディ**

```json
{
  "prompt_family_id": 4,
  "name": "返金対応 v3",
  "memo": "確認質問を先に入れる",
  "content": "あなたは返金問い合わせ対応ボットです。",
  "workflow_definition": null,
  "parent_version_id": 8
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `prompt_family_id` | number | ✅ | 所属する系列 ID |
| `name` | string | | バージョン名 |
| `memo` | string | | 変更メモ |
| `content` | string | ✅ | システムプロンプト本文 |
| `workflow_definition` | object | | 将来のステップ定義 |
| `parent_version_id` | number | | 分岐元バージョン ID |

`version` は `prompt_family` 内の連番としてサーバー側で自動採番する。

### `GET /prompt-versions/:id`

プロンプトバージョン詳細を返す。

### `PATCH /prompt-versions/:id`

プロンプトバージョンを更新する。

### `POST /prompt-versions/:id/branch`

既存バージョンを分岐元にして新しいバージョンを作る。

### `PATCH /prompt-versions/:id/selected`

対象バージョンを `is_selected = true` にする。

### `PUT /prompt-versions/:id/projects`

プロンプトバージョンに付与するラベル一覧を全置換する。

**リクエストボディ**

```json
{
  "project_ids": [1, 5]
}
```

## Execution Profiles

Run 実行時の設定テンプレートを管理する API。

### `GET /execution-profiles`

設定一覧を返す。

**レスポンス `200`**

```json
[
  {
    "id": 2,
    "name": "Claude Sonnet 低温度",
    "description": "比較用の低温度設定",
    "model": "claude-sonnet-4-6",
    "temperature": 0.2,
    "api_provider": "anthropic",
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /execution-profiles`

設定を作成する。

**リクエストボディ**

```json
{
  "name": "Claude Sonnet 低温度",
  "description": "比較用の低温度設定",
  "model": "claude-sonnet-4-6",
  "temperature": 0.2,
  "api_provider": "anthropic"
}
```

### `GET /execution-profiles/:id`

設定詳細を返す。

### `PATCH /execution-profiles/:id`

設定を更新する。

### `DELETE /execution-profiles/:id`

設定を削除する。過去の Run はスナップショット値を持つため参照可能。

**レスポンス `204`**

### `POST /execution-profiles/models`

指定プロバイダ・API キーで利用可能なモデル一覧を取得する。

**リクエストボディ**

```json
{
  "api_provider": "anthropic",
  "api_key": "..."
}
```

## Runs

プロンプトバージョン × テストケース × 実行設定の実行結果を管理する API。

### `GET /runs`

Run 一覧を返す。

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `prompt_version_id` | number | プロンプトバージョンで絞り込む |
| `test_case_id` | number | テストケースで絞り込む |
| `execution_profile_id` | number | 実行設定で絞り込む |
| `project_id` | number | プロンプト側ラベル基準で絞り込む |
| `include_discarded` | boolean | 破棄済み Run も含める |

補足:
- `project_id` は `prompt_version_projects` に指定ラベルが付いた `prompt_version` の Run を返す
- `test_case_projects` は `runs` のラベル絞り込みには使わない
- 破棄済み Run は既定で含めない

**レスポンス `200`**

```json
[
  {
    "id": 100,
    "prompt_version_id": 10,
    "test_case_id": 1,
    "execution_profile_id": 2,
    "conversation": [
      { "role": "user", "content": "返金の手続きを教えてください" },
      { "role": "assistant", "content": "購入日を確認させてください。" }
    ],
    "execution_trace": null,
    "model": "claude-sonnet-4-6",
    "temperature": 0.2,
    "api_provider": "anthropic",
    "is_best": false,
    "is_discarded": false,
    "created_at": 1744281600000
  }
]
```

### `POST /runs`

Run を手動保存する。

**リクエストボディ**

```json
{
  "prompt_version_id": 10,
  "test_case_id": 1,
  "execution_profile_id": 2,
  "conversation": [
    { "role": "user", "content": "返金の手続きを教えてください" },
    { "role": "assistant", "content": "購入日を確認させてください。" }
  ],
  "execution_trace": null
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `prompt_version_id` | number | ✅ | 使用したプロンプトバージョン |
| `test_case_id` | number | ✅ | 対象テストケース |
| `execution_profile_id` | number | ✅ | 実行設定 |
| `conversation` | `{role, content}[]` | ✅ | 実行時の全会話履歴 |
| `execution_trace` | object[] \| null | | ステップ実行ログ |

補足:
- `model` / `temperature` / `api_provider` はサーバー側で `execution_profile` から取得してスナップショット保存する

### `POST /runs/execute`

LLM を使って Run を実行し、SSE で進捗を返す。

**リクエストボディ**

```json
{
  "prompt_version_id": 10,
  "test_case_id": 1,
  "execution_profile_id": 2,
  "api_key": "..."
}
```

SSE イベント:
- `delta`
- `step-start`
- `step-delta`
- `step-complete`
- `run`
- `error`

### `GET /runs/:id`

Run 詳細を返す。

### `PATCH /runs/:id/best`

対象 Run の `is_best` を更新する。

**リクエストボディ**

```json
{
  "unset": false
}
```

補足:
- `unset = false` の場合、同一 `prompt_version_id × test_case_id` の他 Run の `is_best` は `false` にリセットする

### `PATCH /runs/:id/discard`

対象 Run の `is_discarded` を更新する。

**リクエストボディ**

```json
{
  "is_discarded": true
}
```

## Scores

Run に対する評価スコアを管理する API。

現行 UI は 1 Run = 1 Score の使い方に寄っているが、データモデル上は複数保持できる。

### `GET /runs/:runId/scores`

指定 Run のスコア一覧を返す。

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "run_id": 100,
    "human_score": 4,
    "human_comment": "確認質問が適切",
    "judge_score": null,
    "judge_reason": null,
    "is_discarded": false,
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

### `POST /runs/:runId/scores`

スコアを作成する。

**リクエストボディ**

```json
{
  "human_score": 4,
  "human_comment": "確認質問が適切"
}
```

### `GET /runs/:runId/score`

現行 UI 互換のため、非破棄スコア 1 件を返す簡易エンドポイント。

補足:
- 複数存在する場合の選択ルールは別途固定する
- 新規 UI では `GET /runs/:runId/scores` を優先する

### `PATCH /runs/:runId/score`

現行 UI 互換の簡易更新エンドポイント。

### `PATCH /runs/:runId/scores/:id`

スコアを更新する。

**リクエストボディ例**

```json
{
  "human_score": 5,
  "human_comment": "完璧な回答",
  "is_discarded": false
}
```

### `PATCH /runs/:runId/scores/:id/discard`

対象スコアの `is_discarded` を `true` にする。

## Score Progression

スコア推移を返す API。

### `GET /score-progression`

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `project_id` | number | プロンプト側ラベル基準で絞り込む |
| `prompt_family_id` | number | 系列単位で絞り込む |
| `score_type` | string | `human` または `judge` |

補足:
- `project_id` は `runs` と同様に `prompt_version_projects` 基準で解釈する

**レスポンス `200`**

```json
{
  "versionSummaries": [
    {
      "versionId": 10,
      "versionNumber": 3,
      "versionName": "返金対応 v3",
      "avgHumanScore": 4.2,
      "avgJudgeScore": null,
      "runCount": 5,
      "scoredCount": 4
    }
  ],
  "testCaseBreakdown": [
    {
      "testCaseId": 1,
      "testCaseTitle": "返金手続きの問い合わせ",
      "versions": [
        {
          "versionId": 10,
          "versionNumber": 3,
          "versionName": "返金対応 v3",
          "humanScore": 4,
          "judgeScore": null,
          "runId": 100
        }
      ]
    }
  ]
}
```

## Runs API と Annotation API の責務境界

この文書の現時点での対象は基盤 API（Projects / Context Assets / Test Cases / Prompt Families / Prompt Versions / Execution Profiles / Runs / Scores）に限る。annotation 関連エンドポイントは別途追加する。

ただし runs API と annotation API の責務を以下のように定義する。

### runs API の責務

- run の作成・実行・保存
- `structured_output`（annotation 向け構造化 JSON 出力）の保存
- Candidate 生成のトリガー

#### `POST /runs/:id/candidates/extract`

指定した run の出力を解析して Candidate を生成し、annotation API へ投入する。

**リクエストボディ**

```json
{
  "annotation_task_id": 1,
  "source_type": "structured_json"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `annotation_task_id` | number | ✅ | 対象 AnnotationTask の ID |
| `source_type` | string | | `final_answer` \| `structured_json` \| `trace_step`。省略時は `structured_output` が存在すれば `structured_json`、なければ `final_answer` |
| `source_step_id` | string | | `trace_step` を指定した場合の step ID |

**レスポンス `201`**

```json
{
  "candidates_created": 3,
  "run_id": 100,
  "annotation_task_id": 1
}
```

### `POST /runs` および `POST /runs/execute` の変更

`structured_output` フィールドを追加する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `structured_output` | object \| null | | annotation 向け JSON フォーマットの構造化出力。`{ "items": [...] }` 形式 |

`structured_output` を保存することで `POST /runs/:id/candidates/extract` が `structured_json` ソースを参照できるようになる。

### annotation API の責務（将来追加）

annotation 関連エンドポイント（`/annotation-tasks`、`/candidates`、`/gold-annotations` 等）は runs / test_cases / context_assets の責務整理完了後に別途この文書へ追加する。

## 互換レイヤの扱い

旧 API との互換が必要な場合は、当面次のパスを互換レイヤとして残せる。

- `/projects/:projectId/test-cases`
- `/projects/:projectId/prompt-versions`
- `/projects/:projectId/runs`
- `/projects/:projectId/context-files`
- `/projects/:projectId/settings`

ただし新規実装は、以下を正とする。

- `/test-cases`
- `/prompt-families`
- `/prompt-versions`
- `/context-assets`
- `/execution-profiles`
- `/runs`
