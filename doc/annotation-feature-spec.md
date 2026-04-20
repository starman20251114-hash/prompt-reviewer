# Annotation Feature Spec

AI の抽出結果を候補として保存し、人手で取捨選択・修正しながら正解データを育てるための機能仕様。

## この文書の位置づけ

この文書は annotation 機能のドメイン仕様を先に整理するためのメモであり、DB テーブル名や REST API の最終形を確定するものではない。

- ドメインモデル移行全体は `doc/migration-plan.md` を参照する
- 既存の新 API 方針は `doc/api-spec.md` を参照する
- annotation 機能の DB / API 接続方法は、移行計画における `context_assets` / `test_cases` / `runs` の整理後に確定する

そのため、この文書では移行後もぶれにくい原則と UI / 操作フローを主に定義する。

## 目的

この機能の目的は、AI の抽出結果を一度きりの試行結果として眺めるだけで終わらせず、候補から正解データを作成できるようにすること。

主な用途は以下を想定する。

- 会話履歴やコンテキスト本文から気づきを抽出する
- アイディアや提案を抽出する
- 行動を促せた箇所を抽出する
- 不満、課題、意思決定などの意味的な断片を抽出する

この機能は、プロンプト改善の評価補助であると同時に、将来の検証用データセット作成機能でもある。

## 基本方針

AI の出力と人手で確定した正解は明確に分離する。

- Candidate
  AI が出した抽出候補
- Gold Annotation
  人が採択・修正して確定した正解

Candidate は一時的で試行依存のデータ、Gold Annotation は評価基準として再利用するデータとして扱う。

## スコープ

初期実装では、ラベル付きスパン抽出に限定する。

具体的には、本文中のどの範囲がどのラベルに該当するかを扱う。

初期実装に含めるもの:

- Annotation Task の定義
- Label の定義
- AI 抽出結果を Candidate として取り込むこと
- Candidate の採用 / 却下 / 修正
- Gold Annotation の保存
- 本文上でのハイライト表示

初期実装に含めないもの:

- 文書全体分類専用モード
- 複雑な階層構造抽出
- 文字単位の厳密なスパン選択 UI
- annotator 複数人対応
- annotation の版管理
- 学習データエクスポートの高度な設定

## 中核概念

### Annotation Task

何を抽出したいかを定義する単位。

例:

- 会話価値抽出
- 課題抽出
- 意思決定抽出

Task は少なくとも以下の情報を持つ。

- name
- description
- labels
- output_mode

初期実装では `output_mode` は `span_label` のみを扱う。

### Label

Task 内で利用する分類ラベル。

例:

- insight
- idea
- action_trigger

表示名は日本語でもよいが、内部キーは安定した識別子として扱う。

例:

- key: `insight`, name: `気づき`
- key: `idea`, name: `アイディア`
- key: `action_trigger`, name: `行動喚起`

### Candidate

AI が出した抽出候補。

Candidate は以下の意味を持つ。

- ある Task に対する抽出結果である
- ある本文に対する候補である
- あるラベルと範囲を持つ
- 人手レビュー前の未確定データである

Candidate はレビューを通じて以下のいずれかになる。

- pending
- accepted
- rejected

### Gold Annotation

人が最終的に正解として確定した annotation。

Gold Annotation は以下に利用する。

- 抽出品質の評価基準
- prompt の比較評価
- 取りこぼし確認
- 将来の検証データ / 学習データ

Gold Annotation は Candidate 由来で作られてもよいが、Candidate に従属しない独立データとして扱う。

## 1件の Annotation の定義

1件の annotation は以下を意味する。

- ある本文の
- ある範囲が
- あるラベルに該当する

初期実装の最小フィールドは以下とする。

- label
- start_line
- end_line
- quote

必要に応じて将来追加可能なフィールド:

- start_offset
- end_offset
- rationale
- confidence
- note

初期実装では行単位で十分とし、文字単位の厳密な範囲指定は後回しにする。

## Candidate の入出力契約

AI の抽出結果は JSON 形式で扱う。

最小フォーマット例:

```json
{
  "items": [
    {
      "label": "insight",
      "start_line": 12,
      "end_line": 15,
      "quote": "……",
      "rationale": "新しい認識や整理が含まれているため"
    },
    {
      "label": "idea",
      "start_line": 28,
      "end_line": 30,
      "quote": "……",
      "rationale": "次の打ち手の提案になっているため"
    }
  ]
}
```

各 item の意味:

- `label`
  Label の内部キー
- `start_line`
  抽出開始行
- `end_line`
  抽出終了行
- `quote`
  抽出箇所の抜粋
- `rationale`
  抽出理由。任意

初期実装では、AI の最終出力または構造化出力をこの形式に寄せる。

## レビュー操作

レビュー画面では、Candidate に対して以下の操作を行えるようにする。

- 採用
- 却下
- 修正

修正対象は初期実装では以下に限定する。

- label
- start_line
- end_line
- note

採用時は Gold Annotation を作成する。  
却下時は Candidate を rejected とする。  
修正後に採用した場合は、修正版の内容で Gold Annotation を作成する。

## 画面構成

初期実装では以下の 3 画面を想定する。

### Runs

抽出試行結果を見る画面。

役割:

- run の出力確認
- Candidate 生成の入口
- Annotation Review への導線

### Annotation Review

Candidate を確認し、Gold Annotation を作成する画面。

役割:

- 対象本文の表示
- Candidate の一覧表示
- ハイライト表示
- 採用 / 却下 / 修正
- Gold Annotation の確認

### Task Settings

Annotation Task と Label を定義する画面。

役割:

- Task の作成と編集
- Label の作成と並び順管理
- 色設定や表示名設定

## Annotation Review 画面の基本フロー

1. Task を選ぶ
2. 対象本文を開く
3. Candidate を一覧表示する
4. 本文上で Candidate の範囲をハイライトする
5. 候補ごとに採用 / 却下 / 修正する
6. 採用されたものを Gold Annotation として保存する

本文表示は行番号付きとし、行範囲の確認と修正をしやすくする。

## 初期 Task の推奨設定

初期導入時は以下の Task を想定する。

Task:

- 会話価値抽出

Labels:

- insight
- idea
- action_trigger

表示名例:

- 気づき
- アイディア
- 行動喚起

この Task によって、現在の主な利用目的を広くカバーできる。

## 評価観点

この機能では単純な正解率だけでなく、以下を見られるようにすることが望ましい。

- Candidate 採用率
- ラベルごとの採用率
- 取りこぼし
  Gold はあるが Candidate が存在しない
- 過剰抽出
  Candidate はあるが却下された

これらは後続の集計画面や比較機能の土台になる。

## 今は固定してよい原則

以下は DB / API の詳細が変わっても維持する前提でよい。

- AI の候補と人が確定した正解は分離する
- 初期実装はラベル付きスパン抽出に限定する
- Annotation の最小単位は `label + line range + quote` とする
- レビュー画面で採用 / 却下 / 修正を行えるようにする
- AI の抽出結果は JSON 契約に寄せる
- 初期 Task は `会話価値抽出` を基本とする

## annotation対象本文の責務

### annotation 一次対象

`test_cases.context_content` を annotation の一次対象とする。

理由:

- Run で実際に使われるテキストは `context_content` であり、`context_assets.content` ではない
- annotation は Run の評価に紐づくため、Run 時点で確定していた本文を参照すべきである
- `context_assets` がその後更新されても、過去の annotation に影響しない

### `context_assets` と `test_cases` の責務分担

- `context_assets`: 素材置き場。編集・再利用可能なオリジナル。annotation の直接対象ではない。
- `test_cases.context_content`: 取り込み後のスナップショット。**これが annotation の本文**。取り込み後は `context_assets` と独立して管理する。

### 取り込み後の本文変化の扱い

スナップショット固定方式を採用する。

- `context_assets` を更新しても `test_cases.context_content` は自動同期しない
- 再同期が必要な場合はユーザーが明示的に再取り込みを行う
- 再取り込み後は `context_content` が更新され、以前の annotation の行番号が無効になる可能性があるため、UI で警告する（将来課題）

### 行番号ルール

annotation の行番号は以下のルールで採番する。

- **改行コード正規化**: annotation 処理前に CRLF → LF に正規化する
- **先頭行番号**: 1-indexed（1行目 = line 1）
- **空行の扱い**: 空行もカウントする（行番号をスキップしない）
- **再現性保証**: `context_content` の内容と行番号ルールが定まっていれば、いつでも同じ行番号が再現できる

## 未確定事項

以下は移行計画の進行後に確定する。

- DB テーブル名と外部キー設計
- REST API の最終パス設計
- 既存 Runs / Test Cases / Context Assets との接続方法
- project ラベルとの関係
