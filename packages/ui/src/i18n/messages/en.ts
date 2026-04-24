export const enMessages = {
  common: {
    appName: "Prompt Reviewer",
  },
  layout: {
    navHintHasChildren: "Has children",
    prompts: "Prompts",
    extraction: "Extraction",
    testCases: "Test Cases",
    contextAssets: "Context Assets",
    labels: "Labels",
    runs: "Runs",
    scoring: "Scoring",
    executionProfiles: "Execution Profiles",
    health: "Health Check",
  },
  annotation: {
    tabs: {
      ariaLabel: "Extraction page tabs",
      settings: "Settings",
      review: "Review",
      goldAnnotations: "Gold Annotations",
    },
  },
  prompts: {
    title: "Prompt Management",
    description: "Manage history by prompt family and filter by project label when needed.",
    familyPanelLabel: "Prompt Families",
    familySummaryLabel: "Family",
    projectFilterLabel: "Project Filter",
  },
} as const;
