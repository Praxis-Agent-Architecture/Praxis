export type MemoryProfile = "off" | "readonly" | "appendOnly" | "full";

export type MemoryScope = "project" | "global";

export type MemorySourceType =
  | "longTerm"
  | "dailyNote"
  | "sessionTranscript"
  | "artifact"
  | "externalMarkdown";

export type MemoryPolicyRisk = "safe" | "risky" | "dangerous";

export type MemoryPermissionProfile = "bapr" | "yolo" | "permissive" | "standard" | "restricted";

export type MemoryRootConfig = {
  root: string;
  scope: MemoryScope;
  label?: string;
};

export type MemoryPlaneOptions = {
  projectMemoryRoot?: string;
  globalMemoryRoot?: string;
  roots?: readonly MemoryRootConfig[];
  profile?: MemoryProfile;
  now?: () => Date | string;
  permissionProfile?: MemoryPermissionProfile;
};

export type MemoryLayout = {
  scope: MemoryScope;
  label: string;
  root: string;
  longTermPath: string;
  dailyDir: string;
  dailyPath: string;
  artifactDir: string;
  indexPath: string;
  lockDir: string;
};

export type MemoryArtifactRef = {
  artifactId: string;
  scope?: MemoryScope;
  summary: string;
  sourcePath?: string;
  line?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MemoryRiskMetadata = {
  operation: string;
  risk: MemoryPolicyRisk;
  allowedByDefault: readonly MemoryPermissionProfile[];
  approvalRecommendedFor: readonly MemoryPermissionProfile[];
  reason: string;
};

export type MemoryIndexedFile = {
  path: string;
  root: string;
  scope: MemoryScope;
  sourceType: MemorySourceType;
  sha256: string;
  mtimeMs: number;
  sizeBytes: number;
  lineCount: number;
  indexedAt: string;
};

export type MemoryIndexStatus = {
  ok: boolean;
  profile: MemoryProfile;
  roots: readonly MemoryLayout[];
  indexedFiles: readonly MemoryIndexedFile[];
  artifactRefs: readonly MemoryArtifactRef[];
  indexAvailable: boolean;
  error?: string;
};

export type MemoryReindexResult = {
  ok: boolean;
  profile: MemoryProfile;
  changedFiles: readonly MemoryIndexedFile[];
  indexedFiles: readonly MemoryIndexedFile[];
  artifactRefs: readonly MemoryArtifactRef[];
  error?: string;
};

export type MemorySearchRequest = {
  query: string;
  scope?: MemoryScope | "all";
  sourceTypes?: readonly MemorySourceType[];
  glob?: string;
};

export type MemorySearchGuide = {
  kind: "basetool.file.search.guide";
  query: string;
  toolId: "file.search";
  roots: readonly string[];
  suggestedInputs: readonly {
    query: string;
    cwd: string;
    glob: string;
  }[];
  instructions: string;
};

export type MemoryPromptGuide = {
  kind: "memory.promptGuide";
  profile: MemoryProfile;
  enabled: boolean;
  roots: readonly MemoryLayout[];
  guide: string;
  searchGuide?: MemorySearchGuide;
};

export type MemoryPlane = {
  readonly profile: MemoryProfile;
  initialize(): Promise<MemoryIndexStatus>;
  reindex(input?: { force?: boolean }): Promise<MemoryReindexResult>;
  indexStatus(): Promise<MemoryIndexStatus>;
  search(input: MemorySearchRequest): Promise<MemorySearchGuide>;
  buildPromptGuide(input?: { query?: string; budgetChars?: number }): Promise<MemoryPromptGuide>;
  describeRisk(operation: string): MemoryRiskMetadata;
  layouts(): readonly MemoryLayout[];
};
