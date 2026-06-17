/*
 * 文件定位：Praxis framework / applicationLayer 合同。
 * 核心目的：定义上层应用接入 framework 的稳定命令、事件、会话和视图模型。
 * 边界：只描述应用层语义，不包含 Raxode 产品逻辑，也不暴露 agentCore 内部对象。
 */

import type { BaseToolProfileName } from "../basetool/types.js";
import type { McpApplicationStateView } from "../runtimeImplementation/runtime.mcpPlane/index.js";
import type {
  InspectMcpRuntimeMountMatrixInput,
  McpRuntimeMountMatrix,
} from "../runtimeImplementation/runtime.mcpPlane/index.js";
import type {
  InspectSandboxRuntimeMountMatrixInput,
  SandboxRuntimeMountMatrix,
} from "../runtimeImplementation/runtime.sandboxPlane/sandboxMountMatrix.js";
import type {
  RuntimeOfficialAdapterIndex,
  RuntimeOfficialAdapterMountMatrix,
  RuntimeOfficialAdapterQuery,
  RuntimeOfficialAdapterQueryResult,
  RuntimeOfficialAdapterReport,
} from "../runtimeImplementation/runtime.officialAdapterPlane/index.js";
import type {
  RuntimeModelCallIndex,
  RuntimeModelCallQuery,
  RuntimeModelCallQueryResult,
  RuntimeModelCallReport,
} from "../runtimeImplementation/runtime.modelCallPlane/index.js";
import type {
  RuntimeGovernanceIndex,
  RuntimeGovernanceQuery,
  RuntimeGovernanceQueryResult,
  RuntimeGovernanceReport,
} from "../runtimeImplementation/runtime.governancePlane/index.js";
import type {
  RuntimeToolCallIndex,
  RuntimeToolCallQuery,
  RuntimeToolCallQueryResult,
  RuntimeToolCallReport,
} from "../runtimeImplementation/runtime.toolCallPlane/index.js";
import type {
  RuntimeManagementPlaneResult,
  RuntimeManagementSurface,
} from "../runtimeImplementation/runtime.managementPlane/runtimeManagementPlane.js";
import type { RuntimeAccessSessionResult } from "../runtimeImplementation/runtime.managementPlane/runtimeAccessSession.js";
import type { RuntimeOperatorConsoleResult } from "../runtimeImplementation/runtime.managementPlane/runtimeOperatorConsole.js";
import type { ManagementPolicyGateResult } from "../runtimeImplementation/runtime.managementPlane/managementPolicyGate.js";
import type { ManagementCommandRouterResult } from "../runtimeImplementation/runtime.managementPlane/managementCommandRouter.js";
import type { RuntimeResourceGovernorResult } from "../runtimeImplementation/runtime.managementPlane/runtimeResourceGovernor.js";
import type { RuntimeMutationPlannerResult } from "../runtimeImplementation/runtime.managementPlane/runtimeMutationPlanner.js";
import type { RuntimeGovernanceBridgeResult } from "../runtimeImplementation/runtime.managementPlane/runtimeGovernanceBridge.js";
import type {
  RuntimeRollbackRequest,
  RuntimeRollbackResult,
  RuntimeRollbackTrace,
} from "../runtimeImplementation/runtime.managementPlane/runtimeRollbackController.js";
import type {
  RuntimeTimelineIndex,
  RuntimeTimelineQuery,
  RuntimeTimelineQueryResult,
  RuntimeTimelineReplayPlan,
  RuntimeTimelineReport,
} from "../runtimeImplementation/runtime.timelinePlane/index.js";
import type { RuntimeSessionReport } from "../runtimeImplementation/runtime.sessionPlane/index.js";
import type {
  RuntimeMultiagentIndex,
  RuntimeMultiagentQuery,
  RuntimeMultiagentQueryResult,
  RuntimeMultiagentReport,
} from "../runtimeImplementation/runtime.multiagentPlane/index.js";
import type { RuntimeSessionSnapshot } from "../runtimeImplementation/runtimeSessionStateEventStore.js";

export type PraxisApplicationRuntimeMode = "dry-run" | "live";

export type PraxisApplicationToolProfile = BaseToolProfileName;

export type PraxisApplicationPermissionProfile =
  | "restricted"
  | "standard"
  | "permissive"
  | "yolo"
  | "bapr";

export type PraxisApplicationReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type PraxisApplicationStatus =
  | "idle"
  | "starting"
  | "ready"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "closed";

export type PraxisApplicationEventKind =
  | "lifecycle"
  | "conversation"
  | "runtime"
  | "tool"
  | "approval"
  | "model"
  | "permission"
  | "workspace"
  | "stdout"
  | "stderr"
  | "stream"
  | "error"
  | "final";

export type PraxisApplicationEvent = {
  eventId: string;
  kind: PraxisApplicationEventKind;
  status: PraxisApplicationStatus;
  message: string;
  createdAt: string;
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  publicSafe: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisApplicationModelState = {
  model: string;
  reasoningEffort: PraxisApplicationReasoningEffort;
  provider?: string;
  endpointShape?: string;
  baseURL?: string;
  providerRoute?: string;
  contextWindowTokens?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  inputBudgetThreshold?: number;
  usableInputTokens?: number;
  metadataSource?: string;
};

export type PraxisApplicationAuthProfileView = {
  profileId: string;
  provider: string;
  providerLabel: string;
  endpointShape?: string;
  baseURL?: string;
  credentialRefId?: string;
  secretId?: string;
  secretPresent: boolean;
  expiresAt?: string;
  status: "unknown" | "active" | "expired" | "missing" | "error";
  publicSafe: true;
};

export type PraxisApplicationAuthState = {
  defaultRole?: string;
  activeProfileId?: string;
  profiles: readonly PraxisApplicationAuthProfileView[];
  lastAuditEventKind?: string;
  lastAuditAt?: string;
  publicSafe: true;
};

export type PraxisApplicationToolCatalogState = {
  profile: PraxisApplicationToolProfile;
  availableProfiles: readonly PraxisApplicationToolProfile[];
  defaultPolicyProfile: PraxisApplicationPermissionProfile;
  extensionSlots: readonly string[];
  total: number;
  mounted: number;
  byFamily: Readonly<Record<string, number>>;
  byRiskLevel: Readonly<Record<string, number>>;
  byReadiness: Readonly<Record<string, number>>;
  mountedToolIds: readonly string[];
};

export type PraxisApplicationUsageTelemetry = {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  lastInputTokens?: number;
  lastTotalTokens?: number;
  lastPromptPackTokens?: number;
  source?: string;
  estimated: boolean;
  modelCalls: number;
};

export type PraxisApplicationContextTelemetry = {
  activeTokens: number;
  promptTokens: number;
  sessionContextTokens: number;
  compressionLimitTokens?: number;
  transcriptTokens: number;
  summaryTokens: number;
  historyMessages: number;
  lastRequestInputTokens?: number;
  lastRequestTotalTokens?: number;
  promptPackTokens?: number;
  historyEstimatedTokens?: number;
  contextSource?: "application.history.estimate" | "provider.model-call.usage";
  usageSource?: string;
  estimated: boolean;
  compacted: boolean;
  source: "application.history.estimate" | "provider.model-call.usage";
};

export type PraxisApplicationManifestView = {
  manifestId: string;
  manifestHash: string;
  agentId: string;
  promptPackId: string;
  toolPolicyProfile: string;
  sandboxProfile: string;
  sessionPersistence: string;
  storageKind: string;
};

export type PraxisApplicationAgentEntryView = {
  key: string;
  agentId?: string;
  role: "primary" | "sidecar";
};

export type PraxisApplicationSessionSummary = {
  sessionId: string;
  name?: string;
  workspaceRoot: string;
  status: PraxisApplicationStatus;
  lastActiveAt: string;
  turns: number;
};

export type PraxisApplicationApprovalSummary = {
  approvalId: string;
  decision?: "approve" | "reject" | "approve_always";
  feature?: string;
  featureKey?: string;
  requestedScopes?: readonly string[];
  riskLevel?: string;
  status: "pending" | "decided";
  note?: string;
  updatedAt: string;
};

export type PraxisApplicationViewModel = {
  applicationId: string;
  projectId: string;
  runtimeId: string;
  sessionId: string;
  agentId: string;
  agentEntries: readonly PraxisApplicationAgentEntryView[];
  agents: {
    active: number;
  };
  status: PraxisApplicationStatus;
  workspaceRoot: string;
  mode: PraxisApplicationRuntimeMode;
  model: PraxisApplicationModelState;
  auth?: PraxisApplicationAuthState;
  permissionProfile: PraxisApplicationPermissionProfile;
  toolProfile: PraxisApplicationToolProfile;
  foundationProject?: {
    projectId: string;
    kind: "chat" | "workspace-project";
    workspaceRoot: string;
    sessionSqlitePath: string;
    locked: boolean;
  };
  sessions: readonly PraxisApplicationSessionSummary[];
  approvals: readonly PraxisApplicationApprovalSummary[];
  manifest?: PraxisApplicationManifestView;
  tools: PraxisApplicationToolCatalogState;
  mcp: McpApplicationStateView;
  counters: {
    turns: number;
    events: number;
    modelCalls: number;
    toolCalls: number;
    mainLoopSteps: number;
  };
  usage?: PraxisApplicationUsageTelemetry;
  context?: PraxisApplicationContextTelemetry;
  finalOutput?: string;
  error?: {
    code: string;
    message: string;
  };
  lines: readonly string[];
  events: readonly PraxisApplicationEvent[];
};

export type PraxisApplicationAttachment = {
  id: string;
  kind: "image" | "file" | "text" | "binary";
  tokenText?: string;
  displayName?: string;
  localPath?: string;
  remoteUrl?: string;
  text?: string;
  mimeType?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisApplicationInputEnvelope = {
  type: "application.input";
  text: string;
  attachments?: readonly PraxisApplicationAttachment[];
  cwd?: string;
};

export type PraxisApplicationAuxiliaryTaskInput = {
  taskKind: string;
  schemaVersion: string;
  input: Readonly<Record<string, unknown>>;
  agentId?: string;
  agentKey?: string;
  sessionId?: string;
  correlationId?: string;
  timeoutMs?: number;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
};

export type PraxisApplicationOfficialAdapterReportOutput = {
  kind: "praxis.application.officialAdapterReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeOfficialAdapterReport;
  index: RuntimeOfficialAdapterIndex;
  query: RuntimeOfficialAdapterQueryResult;
};

export type PraxisApplicationOfficialAdapterMountMatrixOutput = {
  kind: "praxis.application.officialAdapterMountMatrix";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  matrix: RuntimeOfficialAdapterMountMatrix;
};

export type PraxisApplicationModelCallReportOutput = {
  kind: "praxis.application.modelCallReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeModelCallReport;
  index: RuntimeModelCallIndex;
  query: RuntimeModelCallQueryResult;
};

export type PraxisApplicationGovernanceReportOutput = {
  kind: "praxis.application.governanceReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeGovernanceReport;
  index: RuntimeGovernanceIndex;
  query: RuntimeGovernanceQueryResult;
};

export type PraxisApplicationToolCallReportOutput = {
  kind: "praxis.application.toolCallReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeToolCallReport;
  index: RuntimeToolCallIndex;
  query: RuntimeToolCallQueryResult;
};

export type PraxisApplicationTimelineReplayInput = {
  checkpointTurnId?: string;
  targetSessionId?: string;
};

export type PraxisApplicationTimelineReportOutput = {
  kind: "praxis.application.timelineReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeTimelineReport;
  index: RuntimeTimelineIndex;
  query: RuntimeTimelineQueryResult;
  replayPlan: RuntimeTimelineReplayPlan;
};

export type PraxisApplicationRollbackPlanOutput = {
  kind: "praxis.application.rollbackPlan";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  checkpointTurnId: string | undefined;
  currentRevision: number;
  allowedCheckpointIds: readonly string[];
  result: RuntimeRollbackResult;
};

export type PraxisApplicationManagementPlaneOutput = {
  kind: "praxis.application.managementPlane";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  result: RuntimeManagementPlaneResult;
  componentSummary: {
    totalComponents: number;
    readyComponents: number;
    surfaces: readonly RuntimeManagementSurface[];
    readyComponentIds: readonly string[];
  };
  accessSession: RuntimeAccessSessionResult;
  operatorConsole: RuntimeOperatorConsoleResult;
  policyGate: ManagementPolicyGateResult;
  commandRouter: ManagementCommandRouterResult;
  resourceGovernor: RuntimeResourceGovernorResult;
  mutationPlanner: RuntimeMutationPlannerResult;
  rollbackPlan: RuntimeRollbackResult;
  governanceBridge: RuntimeGovernanceBridgeResult;
};

export type PraxisApplicationSessionReportOutput = {
  kind: "praxis.application.sessionReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeSessionReport;
};

export type PraxisApplicationMultiagentReportOutput = {
  kind: "praxis.application.multiagentReport";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  report: RuntimeMultiagentReport;
  index: RuntimeMultiagentIndex;
  query: RuntimeMultiagentQueryResult;
};

export type PraxisApplicationMcpMountMatrixOutput = {
  kind: "praxis.application.mcpMountMatrix";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  matrix: McpRuntimeMountMatrix;
};

export type PraxisApplicationSandboxMountMatrixOutput = {
  kind: "praxis.application.sandboxMountMatrix";
  publicSafe: true;
  sessionId: string;
  runtimeId: string;
  matrix: SandboxRuntimeMountMatrix;
};

export type PraxisApplicationCommand =
  | {
      type: "application.start";
      sessionId?: string;
      cwd?: string;
      mode?: PraxisApplicationRuntimeMode;
    }
  | {
      type: "application.submitTurn";
      input: PraxisApplicationInputEnvelope;
      sessionId?: string;
      mode?: PraxisApplicationRuntimeMode;
    }
  | ({
      type: "application.invokeAuxiliaryTask";
      mode?: PraxisApplicationRuntimeMode;
    } & PraxisApplicationAuxiliaryTaskInput)
  | {
      type: "application.cancelAuxiliaryTask";
      sessionId?: string;
      correlationId: string;
      reason?: string;
    }
  | {
      type: "application.inspectOfficialAdapters";
      sessionId?: string;
      query?: RuntimeOfficialAdapterQuery;
      expectedCallOrder?: readonly string[];
    }
  | {
      type: "application.inspectOfficialAdapterMountMatrix";
      sessionId?: string;
    }
  | {
      type: "application.inspectModelCalls";
      sessionId?: string;
      query?: RuntimeModelCallQuery;
    }
  | {
      type: "application.inspectGovernance";
      sessionId?: string;
      query?: RuntimeGovernanceQuery;
    }
  | {
      type: "application.inspectToolCalls";
      sessionId?: string;
      query?: RuntimeToolCallQuery;
    }
  | {
      type: "application.inspectTimeline";
      sessionId?: string;
      query?: RuntimeTimelineQuery;
      replay?: PraxisApplicationTimelineReplayInput;
    }
  | {
      type: "application.inspectRollbackPlan";
      sessionId?: string;
      checkpointTurnId?: string;
      reason?: string;
      contract?: RuntimeRollbackRequest["contract"];
      governance?: RuntimeRollbackRequest["governance"];
      trace?: RuntimeRollbackTrace;
    }
  | {
      type: "application.inspectManagementPlane";
      sessionId?: string;
      requestedScopes?: readonly string[];
      allowedScopes?: readonly string[];
    }
  | {
      type: "application.inspectSessionReport";
      sessionId?: string;
    }
  | {
      type: "application.inspectMultiagent";
      sessionId?: string;
      query?: RuntimeMultiagentQuery;
    }
  | {
      type: "application.inspectMcpMountMatrix";
      sessionId?: string;
      nativeToolInventoryByServerId?: InspectMcpRuntimeMountMatrixInput["nativeToolInventoryByServerId"];
    }
  | {
      type: "application.inspectSandboxMountMatrix";
      sessionId?: string;
      toolId?: string;
      command?: InspectSandboxRuntimeMountMatrixInput["command"];
      effectKinds?: InspectSandboxRuntimeMountMatrixInput["effectKinds"];
      sandboxHint?: InspectSandboxRuntimeMountMatrixInput["sandboxHint"];
    }
  | {
      type: "application.interrupt";
      sessionId?: string;
      reason?: string;
    }
  | {
      type: "application.resume";
      sessionId?: string;
    }
  | {
      type: "application.createSession";
      sessionId?: string;
      name?: string;
      cwd?: string;
    }
  | {
      type: "application.renameSession";
      sessionId: string;
      name: string;
    }
  | {
      type: "application.rewind";
      sessionId?: string;
      turnId?: string;
      turnIndex?: number;
    }
  | {
      type: "application.switchWorkspace";
      sessionId?: string;
      cwd: string;
    }
  | {
      type: "application.approvalDecision";
      sessionId?: string;
      approvalId: string;
      decision: "approve" | "reject" | "approve_always";
      note?: string;
    }
  | {
      type: "application.requestApproval";
      sessionId?: string;
      approvalId: string;
      reason: string;
    }
  | {
      type: "application.changeModel";
      sessionId?: string;
      model: string;
      reasoningEffort?: PraxisApplicationReasoningEffort;
      provider?: string;
      endpointShape?: string;
      baseURL?: string;
      providerRoute?: string;
      maxOutputTokens?: number;
    }
  | {
      type: "application.changePermissionProfile";
      sessionId?: string;
      profile: PraxisApplicationPermissionProfile;
    }
  | {
      type: "application.changeToolProfile";
      sessionId?: string;
      profile: PraxisApplicationToolProfile;
    }
  | {
      type: "application.close";
      sessionId?: string;
    };

export type PraxisApplicationCommandResult =
  | {
      ok: true;
      view: PraxisApplicationViewModel;
      events: readonly PraxisApplicationEvent[];
      runtimeSnapshot?: RuntimeSessionSnapshot;
      output?: unknown;
    }
  | {
      ok: false;
      view: PraxisApplicationViewModel;
      events: readonly PraxisApplicationEvent[];
      runtimeSnapshot?: RuntimeSessionSnapshot;
      output?: unknown;
      error: {
        code: string;
        message: string;
      };
    };

export type PraxisApplicationRuntime = {
  readonly applicationId: string;
  readonly projectId: string;
  getView(): PraxisApplicationViewModel;
  dispatch(command: PraxisApplicationCommand): Promise<PraxisApplicationCommandResult>;
  subscribe(listener: (event: PraxisApplicationEvent) => void): () => void;
};
