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
    createFamily: "+ Create Family",
  },
  contextAssets: {
    description: "Manage context assets used by test cases.",
    properties: "Properties",
    name: "Name",
    path: "Path",
    mimeType: "MIME Type",
    projectAssignment: "Project Assignment",
    save: "Save",
    saving: "Saving...",
    confirmDelete: "Are you sure you want to delete this?",
    deleting: "Deleting...",
    delete: "Delete",
    cancel: "Cancel",
  },
  testCases: {
    title: "Test Case Management",
    description:
      "Manage test cases and link context assets or projects later as needed.",
    turnUser: "User",
    turnAssistant: "Assistant",
    contextImportHint:
      "Import the selected asset content into the context field as a snapshot.",
    titleHint:
      "If the prompt does not reference anything else, you can create it by entering only a title.",
    projectLabelHint: "Tag any projects you need.",
  },
} as const;
