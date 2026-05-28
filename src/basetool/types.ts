import type { ToolSpec } from "../runtimeImplementation/runtimeAgentManifest.js";

export type BaseToolLayer = "core" | "agent" | "optional" | "runtime";

export type BaseToolVisibility = "model" | "deferred" | "runtime" | "disabled";

export type BaseToolRiskLevel =
  | "safe"
  | "read"
  | "write"
  | "network"
  | "execute"
  | "normal"
  | "risky"
  | "medium"
  | "high"
  | "destructive"
  | "dangerous";

export type BaseToolPolicyRisk = "safe" | "risky" | "dangerous";

export type BaseToolFamily =
  | "core"
  | "agent"
  | "optional"
  | "runtime"
  | "file"
  | "patch"
  | "shell"
  | "process"
  | "web"
  | "plan"
  | "user"
  | "mcp"
  | "computer"
  | "work"
  | "media"
  | "skill"
  | "context"
  | "custom";

export type BaseToolDependencyKind =
  | "binary"
  | "npm"
  | "dotnet-tool"
  | "secret-ref"
  | "mcp-server"
  | "package"
  | "service"
  | "permission"
  | "filesystem"
  | "network"
  | "device"
  | "runtime"
  | "custom";

export type BaseToolDependencyDeclaration = {
  dependencyId: string;
  kind: BaseToolDependencyKind;
  required: boolean;
  description: string;
  version?: string;
  acceptedVersions?: readonly string[];
  install?: "auto" | "manual" | "disabled";
  sourceRef?: string;
  requiredScopes?: readonly string[];
  secretRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolInputSchema =
  | {
      kind: "json-schema";
      schema: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "dynamic";
      schema: Readonly<Record<string, unknown>>;
    };

export type BaseToolDefinition = {
  toolId: string;
  family: BaseToolFamily;
  storageFamily: string;
  group: string;
  layer: BaseToolLayer;
  title: string;
  description: string;
  visibility: BaseToolVisibility;
  riskLevel: BaseToolRiskLevel;
  risk?: BaseToolRiskLevel;
  policyRisk: BaseToolPolicyRisk;
  permissionHints: readonly string[];
  runtimePorts: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  inputSchema: BaseToolInputSchema;
  sourcePath?: string;
  toolSkill: {
    docPath: string;
  };
  metadata?: Readonly<Record<string, unknown>>;
  projection?: string;
  modelRequired?: boolean;
};

export type BaseToolProfileName =
  | "codingCore"
  | "researchCore"
  | "workCore"
  | "runtimeCore"
  | "agentCore"
  | "fullCore";

export type BaseToolDefaultPolicyProfile =
  | "bapr"
  | "yolo"
  | "permissive"
  | "standard"
  | "restricted";

export type BaseToolProfileDescribeOverlay = {
  summary?: string;
  description?: string;
  useWhen?: readonly string[];
  avoidWhen?: readonly string[];
  examples?: readonly string[];
};

export type BaseToolProfile = {
  name: BaseToolProfileName;
  title: string;
  description: string;
  summary: string;
  defaultPolicyProfile: BaseToolDefaultPolicyProfile;
  visibleToolIds: readonly string[];
  deferredToolIds: readonly string[];
  runtimeToolIds: readonly string[];
  extensionSlots?: readonly string[];
  describeOverlays?: Readonly<Record<string, BaseToolProfileDescribeOverlay>>;
};

export type BaseToolSpecInput = Omit<ToolSpec, "toolId" | "family" | "group"> & {
  profileName?: BaseToolProfileName;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolInvokeRequest = {
  toolId?: string;
  toolCallId?: string;
  operation?: string;
  input?: unknown;
  arguments?: unknown;
  runtime?: {
    runtimeId?: string;
    sessionId?: string;
    toolCallId?: string;
    cwd?: string;
    allowedScopes?: readonly string[];
    metadata?: Readonly<Record<string, unknown>>;
  };
  executor?: BaseToolExecutorPort;
  metadata?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
};

export type BaseToolPublicSafeError = {
  code: string;
  message: string;
  retryable?: boolean;
  publicSafe: true;
};

export type BaseToolExecutorResult<T = unknown> = {
  ok: boolean;
  value?: any;
  output?: any;
  error?: BaseToolPublicSafeError & Readonly<Record<string, unknown>>;
  events?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
};

export type BaseToolInvokeResult<T = unknown> = BaseToolExecutorResult<T> & {
  toolId: string;
  events?: readonly string[];
};

export type BaseToolHandler = {
  definition: BaseToolDefinition;
  invoke(request: BaseToolInvokeRequest): Promise<BaseToolInvokeResult> | BaseToolInvokeResult;
};

export type BaseToolRegistryLookupResult =
  | { ok: true; definition: BaseToolDefinition; handler: BaseToolHandler }
  | { ok: false; error: BaseToolPublicSafeError };

export type BaseToolRegistry = {
  all(): readonly BaseToolDefinition[];
  lookup(toolId: string): BaseToolRegistryLookupResult;
  lookupHandler(toolId: string): BaseToolRegistryLookupResult;
};

export type BaseToolExecutorNamespace = Record<string, ((request: any) => any) | undefined>;

export type BaseToolShellServiceProbe = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  expectExitCode?: number;
  expectStdoutIncludes?: string;
  url?: string;
  method?: string;
  type?: string;
  host?: string;
  port?: number;
  stream?: string;
  pattern?: string;
  regex?: string;
  expectedStatus?: number;
  [key: string]: unknown;
};

export type BaseToolShellServiceStatus =
  | "unknown"
  | "unverified"
  | "launching"
  | "spawned"
  | "alive"
  | "healthy"
  | "unhealthy"
  | "failed"
  | "exited"
  | "stopped"
  | string;
export type BaseToolShellServiceHealth = {
  status: BaseToolShellServiceStatus;
  healthy?: boolean;
  verified?: boolean;
  message?: string;
  [key: string]: unknown;
};
export type BaseToolShellServiceVerification = BaseToolExecutorResult & {
  kind?: string;
  host?: string;
  port?: number;
  [key: string]: unknown;
};
export type BaseToolShellServiceStatusSnapshot = {
  status: BaseToolShellServiceStatus;
  pid?: number;
  port?: number;
  url?: string;
  metadata?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
};

export type BaseToolExecutorPort = {
  [namespace: string]: BaseToolExecutorNamespace | undefined;
  agent?: BaseToolExecutorNamespace;
  artifact?: BaseToolExecutorNamespace;
  computer?: BaseToolExecutorNamespace;
  custom?: BaseToolExecutorNamespace;
  debug?: BaseToolExecutorNamespace;
  device?: BaseToolExecutorNamespace;
  filesystem?: BaseToolExecutorNamespace;
  git?: BaseToolExecutorNamespace;
  lsp?: BaseToolExecutorNamespace;
  mcp?: BaseToolExecutorNamespace;
  network?: BaseToolExecutorNamespace;
  work?: BaseToolExecutorNamespace;
  media?: BaseToolExecutorNamespace;
  process?: BaseToolExecutorNamespace;
  search?: BaseToolExecutorNamespace;
  shell?: BaseToolExecutorNamespace;
  skill?: BaseToolExecutorNamespace;
  web?: BaseToolExecutorNamespace;
  plan?: BaseToolExecutorNamespace;
  userInteraction?: BaseToolExecutorNamespace;
  context?: BaseToolExecutorNamespace;
  approval?: BaseToolExecutorNamespace;
  sandbox?: BaseToolExecutorNamespace;
  output?: BaseToolExecutorNamespace;
};
