/*
 * 文件定位：raxode-cli / 前后端共享协议。
 * 核心目的：让 TUI fork 只依赖干净的 application contract，不依赖 agentCore 后端实现。
 * 边界：这里只放可序列化 view/event/command 类型，不导入 React、Ink、agentCore runtime。
 */

export type RaxodeApplicationRunMode = "dry-run" | "live";
export type RaxodeBackendProfile = "coding-full" | "framework-proof" | "custom-agent";

export type RaxodeToolCatalogSummary = {
  total: number;
  byFamily: Readonly<Record<string, number>>;
  byRiskLevel: Readonly<Record<string, number>>;
  byReadiness: Readonly<Record<string, number>>;
  selectedToolIds: readonly string[];
  selectedFamilies: readonly string[];
};

export type RaxodeAgentManifestSummary = {
  manifestId: string;
  manifestHash: string;
  identityId: string;
  model: string;
  promptPackId: string;
  toolPolicyProfile: string;
  sandboxProfile: string;
  sessionPersistence: string;
  storageKind: string;
  toolCount: number;
};

export type RaxodeBackendCapabilitySummary = {
  profile: RaxodeBackendProfile;
  backend: "agentCore";
  defaultAgentPath: string;
  defaultTask: string;
  codingOriented: boolean;
  allCatalogToolsVisible: boolean;
  toolCatalog: RaxodeToolCatalogSummary;
};

export type RaxodeApplicationCommand = {
  kind: "run-agent";
  agentPath?: string;
  exportName?: string;
  task?: string;
  cwd?: string;
  mode?: RaxodeApplicationRunMode;
  profile?: RaxodeBackendProfile;
  sessionId?: string;
  allowToolExecution?: boolean;
  exposeProviderTools?: boolean;
};

export type RaxodeApplicationStatus = "idle" | "running" | "completed" | "failed";

export type RaxodeApplicationEvent = {
  eventId: string;
  kind: "lifecycle" | "runtime" | "state" | "capability" | "approval" | "tool" | "error";
  status: RaxodeApplicationStatus;
  message: string;
  createdAt: string;
  publicSafe: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RaxodeApplicationViewModel = {
  title: string;
  subtitle: string;
  mode: RaxodeApplicationRunMode;
  agentId: string;
  model: string;
  sessionId: string;
  runtimeId: string;
  status: Exclude<RaxodeApplicationStatus, "idle" | "running">;
  finalOutput?: string;
  error?: {
    code: string;
    message: string;
  };
  counters: {
    envelopes: number;
    modelCalls: number;
    toolCalls: number;
    mainLoopSteps: number;
    runtimeEvents: number;
    catalogTools: number;
    mountedTools: number;
  };
  backendCapability: RaxodeBackendCapabilitySummary;
  manifest?: RaxodeAgentManifestSummary;
  events: readonly RaxodeApplicationEvent[];
  lines: readonly string[];
};

export type RaxodeApplicationBackendResult =
  | {
      ok: true;
      view: RaxodeApplicationViewModel;
      events: readonly RaxodeApplicationEvent[];
      backend: "agentCore";
    }
  | {
      ok: false;
      error: {
        code: "AGENT_LOAD_FAILED" | "AGENT_COMPILE_FAILED" | "RUNTIME_FAILED";
        message: string;
      };
      view: RaxodeApplicationViewModel;
      events: readonly RaxodeApplicationEvent[];
      backend: "agentCore";
    };

export type RaxodeApplicationBackend = {
  readonly backendId: "agentCore";
  describe(): Promise<RaxodeBackendCapabilitySummary>;
  run(command: RaxodeApplicationCommand): Promise<RaxodeApplicationBackendResult>;
};
