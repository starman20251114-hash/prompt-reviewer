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
  },
} as const;
