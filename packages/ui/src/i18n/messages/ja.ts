export const jaMessages = {
  common: {
    appName: "Prompt Reviewer",
  },
  layout: {
    navHintHasChildren: "子項目あり",
    prompts: "プロンプト",
    extraction: "抽出",
    testCases: "テストケース",
    contextAssets: "コンテキスト素材",
    labels: "ラベル管理",
    runs: "Run",
    scoring: "採点",
    executionProfiles: "実行設定",
    health: "ヘルスチェック",
  },
  annotation: {
    tabs: {
      ariaLabel: "抽出ページ切り替え",
      settings: "設定",
      review: "レビュー",
      goldAnnotations: "ゴールドアノテーション",
    },
  },
  prompts: {
    title: "プロンプト管理",
    description:
      "プロンプトファミリー単位で履歴を管理し、必要に応じてプロジェクトラベルで絞り込みます。",
    familyPanelLabel: "プロンプトファミリー",
    familySummaryLabel: "ファミリー",
    projectFilterLabel: "プロジェクトフィルタ",
    createFamily: "+ ファミリー作成",
  },
  contextAssets: {
    description: "テストケースで利用するコンテキスト素材を管理します。",
    properties: "プロパティ",
    name: "名前",
    path: "パス",
    mimeType: "MIMEタイプ",
    projectAssignment: "プロジェクト割り当て",
    save: "保存",
    saving: "保存中...",
    confirmDelete: "本当に削除しますか？",
    deleting: "削除中...",
    delete: "削除",
    cancel: "キャンセル",
  },
  testCases: {
    title: "テストケース管理",
    description:
      "テストケースを管理します。必要なコンテキスト素材やプロジェクトをあとから関連付けられます。",
    turnUser: "ユーザー",
    turnAssistant: "アシスタント",
    contextImportHint:
      "選択した素材の内容をスナップショットとしてコンテキスト欄に取り込みます。",
    titleHint:
      "プロンプトのみで何も参照しない場合はタイトルだけ入力して作成してください。",
    projectLabelHint: "必要なプロジェクトにタグ付けできます。",
  },
} as const;
