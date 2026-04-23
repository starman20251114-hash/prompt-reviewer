# Issue #120 Handoff

`UI API クライアントを新エンドポイントへ対応させる` 向けの着手メモ。

## 目的

`packages/ui/src/lib/api.ts` に、新ドメインモデル向け API クライアントを追加する。

- 旧 `/projects/:projectId/...` クライアントは当面残す
- 新 UI 実装で必要になる関数・型を先にそろえる
- 既存画面はこの Issue では差し替えない

## 完了条件

- `packages/ui/src/lib/api.ts` から新 API を呼ぶ関数群が利用可能
- 型定義が新レスポンス形と矛盾しない
- 旧クライアント関数は壊さない
- 後続 Issue `#121` `#122` `#123` `#124` `#125` がこのファイルだけを使って着手できる

## 実装対象

- [packages/ui/src/lib/api.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\ui\src\lib\api.ts)

参考:

- [packages/server/src/index.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\index.ts)
- [packages/server/src/routes/execution-profiles.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\routes\execution-profiles.ts)
- [packages/server/src/routes/prompt-families.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\routes\prompt-families.ts)
- [packages/server/src/routes/prompt-versions.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\routes\prompt-versions.ts)
- [packages/server/src/routes/context-assets.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\routes\context-assets.ts)
- [packages/server/src/routes/test-cases.ts](C:\Users\kazuh\work\claude_playground\prompt-reviewer\packages\server\src\routes\test-cases.ts)

## サーバー側で見えている新 API

### Execution Profiles

- `GET /api/execution-profiles`
- `POST /api/execution-profiles`
- `GET /api/execution-profiles/:id`
- `PATCH /api/execution-profiles/:id`
- `DELETE /api/execution-profiles/:id`
- `POST /api/execution-profiles/models`

### Prompt Families

- `GET /api/prompt-families`
- `POST /api/prompt-families`
- `GET /api/prompt-families/:id`
- `PATCH /api/prompt-families/:id`
- `DELETE /api/prompt-families/:id`

### Prompt Versions

- `GET /api/prompt-versions?prompt_family_id=:id`
- `POST /api/prompt-versions`
- `GET /api/prompt-versions/:id`
- `PATCH /api/prompt-versions/:id`
- `POST /api/prompt-versions/:id/branch`
- `PATCH /api/prompt-versions/:id/selected`
- `PUT /api/prompt-versions/:id/projects`

### Context Assets

- `GET /api/context-assets`
- `POST /api/context-assets`
- `GET /api/context-assets/:id`
- `PATCH /api/context-assets/:id`
- `DELETE /api/context-assets/:id`
- `PUT /api/context-assets/:id/projects`

`GET /api/context-assets` は以下の query を受ける:

- `q`
- `project_id`
- `unclassified`
- `linked_to=test_case:<id>`
- `linked_to=prompt_family:<id>`

### Test Cases

- `GET /api/test-cases`
- `POST /api/test-cases`
- `GET /api/test-cases/:id`
- `PATCH /api/test-cases/:id`
- `DELETE /api/test-cases/:id`
- `PUT /api/test-cases/:id/projects`
- `PUT /api/test-cases/:id/context-assets`

`GET /api/test-cases` は以下の query を受ける:

- `q`
- `project_id`
- `unclassified`

### Runs

新モデルの `runs` API 本体は migration 済みだが、現時点の UI はまだ legacy path 中心。

`#120` では runs 系の新クライアント追加は最小限にとどめてよい。
後続の `#125` で必要な API 形に合わせて追加・整理する。

## この Issue で追加したい型と関数

### 1. Execution Profiles

追加型:

- `ExecutionProfile`

追加関数:

- `getExecutionProfiles()`
- `getExecutionProfile(id)`
- `createExecutionProfile(data)`
- `updateExecutionProfile(id, data)`
- `deleteExecutionProfile(id)`
- `listExecutionProfileModels(data)`

補足:

- `ProjectSettings` 系は legacy として残す
- `ApiProvider`, `LLMModelOption` は使い回せる

### 2. Prompt Families

追加型:

- `PromptFamily`

追加関数:

- `getPromptFamilies()`
- `getPromptFamily(id)`
- `createPromptFamily(data)`
- `updatePromptFamily(id, data)`
- `deletePromptFamily(id)`

### 3. Prompt Versions の新 API

既存 `PromptVersion` 型はほぼ流用できるが、`project_id` は新 API では常に意味を持つとは限らない。
必要なら次のどちらかで吸収する:

- `project_id: number | null` に広げる
- 新旧を分けて `PromptVersion` / `LegacyPromptVersion` に分ける

おすすめ:

- 後続 UI 差し替えを楽にするため、今の段階では `project_id: number | null` に広げる

追加関数:

- `getPromptVersionsByFamily(promptFamilyId)`
- `getIndependentPromptVersion(id)`
- `createIndependentPromptVersion(data)`
- `updateIndependentPromptVersion(id, data)`
- `branchIndependentPromptVersion(id, data)`
- `setSelectedIndependentPromptVersion(id)`
- `setPromptVersionProjects(id, data)`

命名メモ:

- 既存の `getPromptVersions(projectId)` と衝突しないよう、`ByFamily` / `Independent` を付ける

### 4. Context Assets

追加型:

- `ContextAssetSummary`
- `ContextAssetDetail`

追加関数:

- `getContextAssets(filters?)`
- `getContextAsset(id)`
- `createContextAsset(data)`
- `updateContextAsset(id, data)`
- `deleteContextAsset(id)`
- `setContextAssetProjects(id, data)`

フィルタ型候補:

```ts
type ContextAssetFilters = {
  q?: string;
  project_id?: number;
  unclassified?: boolean;
  linked_to?: `test_case:${number}` | `prompt_family:${number}`;
};
```

### 5. Test Cases の新 API

既存 `TestCase` 型は概ね流用可能。

追加関数:

- `getIndependentTestCases(filters?)`
- `getIndependentTestCase(id)`
- `createIndependentTestCase(data)`
- `updateIndependentTestCase(id, data)`
- `deleteIndependentTestCase(id)`
- `setTestCaseProjects(id, data)`
- `setTestCaseContextAssets(id, data)`

フィルタ型候補:

```ts
type TestCaseFilters = {
  q?: string;
  project_id?: number;
  unclassified?: boolean;
};
```

## 実装順

1. 共通型を足す
2. Execution Profiles を追加
3. Prompt Families を追加
4. Prompt Versions 新 API を追加
5. Context Assets を追加
6. Test Cases 新 API を追加
7. 必要なら runs 系の下準備だけ追加

## 注意点

### 1. 旧 API は消さない

`RunsPage` など現行画面がまだ legacy クライアントに依存している。
この Issue では削除・改名で既存 import を壊さない。

### 2. 名前衝突を避ける

既存の `getPromptVersions`, `getTestCases` は legacy UI で使用中。
新 API は suffix を付けて共存させる。

### 3. 型を無理に完成させすぎない

`runs` は `#125`、`quick run` は `#175` でさらに動く。
この Issue で先回りしすぎない。

### 4. `fetchJson` 共通ヘルパーはそのまま使う

新クライアントは既存 `api.get/post/put/patch/delete` の上に載せる。

## 実装後の確認候補

- `pnpm --filter @prompt-reviewer/ui typecheck`

余裕があれば:

- 新関数を import しただけの型確認
- 既存 import が壊れていないことの確認

## 後続 Issue への受け渡し

- `#121` は Execution Profiles の関数群を使う
- `#122` は Prompt Families / Prompt Versions 新 API を使う
- `#123` は Context Assets を使う
- `#124` は Independent Test Cases を使う
- `#125` は Runs / Score / Progression の新 API と必要な不足分を詰める
- `#184` は `#125` の続きとして、`AnnotationReviewPage` / `AnnotationTaskSettingsPage` 側の状態管理・導線・API 利用を `RunsPage` の score 新フィルタ対応と整合させる

## 追記: Issue #184 の観点

`#125` の修正対象は `RunsPage` が中心だが、同じデータ導線を使うアノテーション関連ページにも追随対応が必要になる可能性が高い。

特に確認したいポイント:

- `AnnotationReviewPage` が `RunsPage` 側で追加した filter / 遷移条件と矛盾しないこと
- `AnnotationTaskSettingsPage` からの導線や task 選択状態が、`#125` の変更後も破綻しないこと
- `api.ts` に `#125` で追加した関数・型が annotation 系ページでも不足なく再利用できること

実装順の目安:

1. `#125` で入った `api.ts` と `RunsPage` の変更差分を基準として確認する
2. `AnnotationReviewPage` の検索条件・URL パラメータ・遷移先を見直す
3. `AnnotationTaskSettingsPage` の関連導線と依存 API を見直す
4. 必要なら UI テストや型チェックを追加して回帰を防ぐ
