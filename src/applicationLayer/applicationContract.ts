/*
 * 文件定位：Praxis framework / applicationLayer 合同。
 * 核心目的：定义上层应用接入 framework 的稳定命令、事件、会话和视图模型。
 * 边界：只描述应用层语义，不包含 Raxode 产品逻辑，也不暴露 agentCore 内部对象。
 */

import type { BaseToolProfileName } from "../basetool/types.js";

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
      output?: unknown;
    }
  | {
      ok: false;
      view: PraxisApplicationViewModel;
      events: readonly PraxisApplicationEvent[];
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
