# API仕様

prompt-reviewer の REST API（Hono / Node.js）

ベースURL: `http://localhost:3001`

---

## 共通仕様

### レスポンス形式
すべてのレスポンスは `application/json`。

### タイムスタンプ
`created_at` / `updated_at` は **Unix タイムスタンプ（ミリ秒）**。

### エラーレスポンス

```json
{
  "error": "エラーメッセージ"
}
```

| ステータス | 説明 |
|---|---|
| `400` | バリデーションエラー（必須項目不足・型不一致など） |
| `404` | リソースが見つからない |
| `500` | サーバー内部エラー |

---

## ヘルスチェック

```
GET /health
```

**レスポンス**

```json
{ "status": "ok" }
```

---

## Projects

### プロジェクト一覧取得

```
GET /projects
```

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "name": "カスタマーサポートBot改善",
    "description": "問い合わせ対応精度を上げるプロジェクト",
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

---

### プロジェクト作成

```
POST /projects
```

**リクエストボディ**

```json
{
  "name": "カスタマーサポートBot改善",
  "description": "問い合わせ対応精度を上げるプロジェクト"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✅ | プロジェクト名 |
| `description` | string | | プロジェクト説明 |

**レスポンス `201`**

```json
{
  "id": 1,
  "name": "カスタマーサポートBot改善",
  "description": "問い合わせ対応精度を上げるプロジェクト",
  "created_at": 1744281600000,
  "updated_at": 1744281600000
}
```

---

### プロジェクト取得

```
GET /projects/:id
```

**レスポンス `200`**

```json
{
  "id": 1,
  "name": "カスタマーサポートBot改善",
  "description": "問い合わせ対応精度を上げるプロジェクト",
  "created_at": 1744281600000,
  "updated_at": 1744281600000,
  "settings": {
    "id": 1,
    "model": "claude-opus-4-5",
    "temperature": 0.7,
    "api_provider": "anthropic"
  }
}
```

---

### プロジェクト更新

```
PUT /projects/:id
```

**リクエストボディ**（変更するフィールドのみ）

```json
{
  "name": "新しいプロジェクト名",
  "description": "更新された説明"
}
```

**レスポンス `200`**: 更新後のプロジェクトオブジェクト

---

### プロジェクト削除

```
DELETE /projects/:id
```

**レスポンス `204`**: ボディなし

---

## Project Settings

### 設定取得

```
GET /projects/:id/settings
```

**レスポンス `200`**

```json
{
  "id": 1,
  "project_id": 1,
  "model": "claude-opus-4-5",
  "temperature": 0.7,
  "api_provider": "anthropic",
  "created_at": 1744281600000,
  "updated_at": 1744281600000
}
```

---

### 設定更新

```
PUT /projects/:id/settings
```

**リクエストボディ**（変更するフィールドのみ）

```json
{
  "model": "claude-sonnet-4-6",
  "temperature": 0.5,
  "api_provider": "anthropic"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `model` | string | 使用するLLMモデルID |
| `temperature` | number | 0.0〜2.0 |
| `api_provider` | `"anthropic"` \| `"openai"` | APIプロバイダー |

**レスポンス `200`**: 更新後の設定オブジェクト

---

## Test Cases

### テストケース一覧取得

```
GET /projects/:projectId/test-cases
```

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "project_id": 1,
    "title": "返金手続きの問い合わせ",
    "turns": [
      { "role": "user", "content": "返金の手続きを教えてください" }
    ],
    "context_content": "【返金ポリシー】購入から30日以内であれば返金可能です。",
    "expected_description": "丁寧に返金手続きのステップを案内すること",
    "display_order": 0,
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

---

### テストケース作成

```
POST /projects/:projectId/test-cases
```

**リクエストボディ**

```json
{
  "title": "返金手続きの問い合わせ",
  "turns": [
    { "role": "user", "content": "返金の手続きを教えてください" }
  ],
  "context_content": "【返金ポリシー】購入から30日以内であれば返金可能です。",
  "expected_description": "丁寧に返金手続きのステップを案内すること",
  "display_order": 0
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `title` | string | ✅ | テストケース名 |
| `turns` | `{role, content}[]` | | マルチターンの会話履歴（未指定時は空配列） |
| `context_content` | string | | `{{context}}` に挿入するテキスト |
| `expected_description` | string | | 期待する出力の自由記述 |
| `display_order` | number | | 一覧の並び順（デフォルト: 0） |

**レスポンス `201`**: 作成されたテストケースオブジェクト

---

### テストケース取得

```
GET /projects/:projectId/test-cases/:id
```

**レスポンス `200`**: テストケースオブジェクト

---

### テストケース更新

```
PUT /projects/:projectId/test-cases/:id
```

**レスポンス `200`**: 更新後のテストケースオブジェクト

---

### テストケース削除

```
DELETE /projects/:projectId/test-cases/:id
```

**レスポンス `204`**: ボディなし

---

## Prompt Versions

### バージョン一覧取得

```
GET /projects/:projectId/prompt-versions
```

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "project_id": 1,
    "version": 1,
    "name": "初期バージョン",
    "memo": "ベースラインとして作成",
    "content": "あなたはカスタマーサポートの担当者です...",
    "parent_version_id": null,
    "created_at": 1744281600000
  }
]
```

---

### バージョン作成

```
POST /projects/:projectId/prompt-versions
```

**リクエストボディ**

```json
{
  "name": "改善版v2",
  "memo": "返金フローの説明を追加",
  "content": "あなたはカスタマーサポートの担当者です...",
  "parent_version_id": 1
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | | バージョン名 |
| `memo` | string | | 変更メモ |
| `content` | string | ✅ | システムプロンプト本文 |
| `parent_version_id` | number | | 分岐元バージョンID |

`version` はサーバー側でプロジェクト内の連番として自動採番。

**レスポンス `201`**: 作成されたバージョンオブジェクト

---

### バージョン取得

```
GET /projects/:projectId/prompt-versions/:id
```

**レスポンス `200`**: バージョンオブジェクト

---

## Runs

### Run一覧取得

```
GET /projects/:projectId/runs
```

クエリパラメータ:

| パラメータ | 型 | 説明 |
|---|---|---|
| `prompt_version_id` | number | バージョンで絞り込み |
| `test_case_id` | number | テストケースで絞り込み |
| `is_best` | `0`\|`1` | ベスト回答のみ |
| `is_discarded` | `0`\|`1` | 破棄フラグで絞り込み |

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "project_id": 1,
    "prompt_version_id": 1,
    "test_case_id": 1,
    "conversation": [
      { "role": "user", "content": "返金の手続きを教えてください" },
      { "role": "assistant", "content": "ご不便をおかけして..." }
    ],
    "model": "claude-opus-4-5",
    "temperature": 0.7,
    "api_provider": "anthropic",
    "is_best": 0,
    "created_at": 1744281600000
  }
]
```

---

### Run作成

```
POST /projects/:projectId/runs
```

**リクエストボディ**

```json
{
  "prompt_version_id": 1,
  "test_case_id": 1,
  "conversation": [
    { "role": "user", "content": "返金の手続きを教えてください" },
    { "role": "assistant", "content": "ご不便をおかけして..." }
  ],
  "model": "claude-opus-4-5",
  "temperature": 0.7,
  "api_provider": "anthropic"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `prompt_version_id` | number | ✅ | 使用したプロンプトバージョンID |
| `test_case_id` | number | ✅ | 対象テストケースID |
| `conversation` | `{role, content}[]` | ✅ | 実行時の全会話履歴 |
| `model` | string | ✅ | 実行時のモデルID（`project_settings` からコピー） |
| `temperature` | number | ✅ | 実行時のtemperature（`project_settings` からコピー） |
| `api_provider` | `"anthropic"` \| `"openai"` | ✅ | 実行時のAPIプロバイダー（`project_settings` からコピー） |

> `model` / `temperature` / `api_provider` はサーバー側で `project_settings` から自動取得することも可能だが、クライアントが明示的に渡すことで「表示中の設定と実行時の設定のズレ」を防ぐ。

**レスポンス `201`**: 作成されたRunオブジェクト（スコアフィールドは含まない）

---

### Run取得

```
GET /projects/:projectId/runs/:id
```

**レスポンス `200`**: Runオブジェクト

---

### ベスト回答フラグ設定

```
PATCH /projects/:projectId/runs/:id/best
```

バージョン×テストケースの組み合わせで他のRunの `is_best` を `0` にリセットし、対象Runを `1` に設定する。

**レスポンス `200`**: 更新後のRunオブジェクト

---

### Run破棄

```
PATCH /projects/:projectId/runs/:id/discard
```

**レスポンス `200`**: 更新後のRunオブジェクト（`is_discarded: 1`）

---

## Scores

Run に対する評価スコアを管理する。`runs` テーブルとは分離され、1つの Run に対して複数のスコアレコードを保持できる。

### スコア一覧取得

```
GET /projects/:projectId/runs/:runId/scores
```

**レスポンス `200`**

```json
[
  {
    "id": 1,
    "run_id": 1,
    "human_score": 4,
    "human_comment": "手順が明確で良い",
    "judge_score": null,
    "judge_reason": null,
    "is_discarded": 0,
    "created_at": 1744281600000,
    "updated_at": 1744281600000
  }
]
```

---

### スコア作成

```
POST /projects/:projectId/runs/:runId/scores
```

**リクエストボディ**

```json
{
  "human_score": 4,
  "human_comment": "手順が明確で良い"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `human_score` | number | | 1〜5点（NULL=未採点） |
| `human_comment` | string | | フリーテキストコメント |

**レスポンス `201`**: 作成されたScoreオブジェクト

---

### スコア更新

```
PATCH /projects/:projectId/runs/:runId/scores/:id
```

**リクエストボディ**（変更するフィールドのみ）

```json
{
  "human_score": 5,
  "human_comment": "完璧な回答"
}
```

**レスポンス `200`**: 更新後のScoreオブジェクト

---

### スコア破棄

```
PATCH /projects/:projectId/runs/:runId/scores/:id/discard
```

`is_discarded` を `1` に設定する。不正データや再採点後の古いスコアを無効化する際に使用。

**レスポンス `200`**: 更新後のScoreオブジェクト（`is_discarded: 1`）

---

## 集計

### バージョン別平均スコア

`scores` テーブルの `human_score`（`is_discarded = 0` のもの）を集計する。

```
GET /projects/:projectId/stats/scores
```

**レスポンス `200`**

```json
[
  {
    "prompt_version_id": 1,
    "version": 1,
    "name": "初期バージョン",
    "avg_score": 3.5,
    "run_count": 4,
    "scored_count": 2
  }
]
```
