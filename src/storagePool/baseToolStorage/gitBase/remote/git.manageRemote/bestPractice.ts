import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageRemotePractice } from "./anthropic.js";
import { deepmindGitManageRemotePractice } from "./deepmind.js";
import {
  executeGitManageRemote as executeGitManageRemoteCore,
  gitManageRemoteDescriptor,
  parseGitManageRemoteResult,
  planGitManageRemote,
  planGitRemoteManagement,
  type GitManageRemoteOutput,
  type GitManageRemoteProvider,
  type GitManageRemoteRequest,
  type GitManageRemoteResult,
} from "./core.js";
import {
  gitManageRemoteDependencyDeclarations,
  type GitManageRemoteDependencies,
  type GitManageRemotePracticeProviderName,
  type GitManageRemoteProviderPractice,
} from "./dependencies.js";
import { openaiGitManageRemotePractice } from "./openai.js";

export * from "./core.js";

export type GitManageRemoteBestPracticeRequest = GitManageRemoteRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageRemotePracticeProviderName;
};

export type GitManageRemoteHandlerInput = Omit<GitManageRemoteBestPracticeRequest, "executor">;

export type GitManageRemotePracticeSelection = {
  providerName: GitManageRemotePracticeProviderName;
  practice: GitManageRemoteProviderPractice;
  provider?: GitManageRemoteProvider;
};

export const gitManageRemoteProviderPractices = [
  anthropicGitManageRemotePractice,
  openaiGitManageRemotePractice,
  deepmindGitManageRemotePractice,
] as const;

export const gitManageRemoteBestPracticeDescriptor = {
  toolId: "git.manageRemote",
  bestPractice: "runtime-gitExecutor-manage-remote-config",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageRemoteDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(preferredProvider: GitManageRemotePracticeProviderName | undefined): readonly GitManageRemoteProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitManageRemoteProviderPractices;
  }
  return [
    ...gitManageRemoteProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageRemoteProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageRemotePractice(
  dependencies: GitManageRemoteDependencies & { preferredProvider?: GitManageRemotePracticeProviderName } = {},
): GitManageRemotePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or runtime git provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: GitManageRemotePracticeSelection): Readonly<Record<string, unknown>> {
  return buildGitBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeGitManageRemote(
  request: GitManageRemoteBestPracticeRequest = {},
): ReturnType<typeof executeGitManageRemoteCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitManageRemoteBestPracticeRequest);
  const selection = selectGitManageRemotePractice({
    executor: safeRequest.executor,
    provider: safeRequest.provider,
    preferredProvider: safeRequest.preferredProvider,
  });
  const context =
    safeRequest.context === undefined || isRecord(safeRequest.context)
      ? {
          ...safeRequest.context,
          auditMetadata: {
            ...(safeRequest.context?.auditMetadata ?? {}),
            ...practiceAuditMetadata(selection),
          },
        }
      : safeRequest.context;
  return executeGitManageRemoteCore({
    ...safeRequest,
    provider: selection.provider,
    context,
  });
}

const invocationContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
    allowedRepositoryRoots: { type: "array", items: { type: "string" } },
    grantedPermissions: { type: "array", items: { type: "string" } },
  },
} as const;

export const gitManageRemoteBaseToolDefinition = createGitBaseToolDefinition<
  GitManageRemoteHandlerInput,
  GitManageRemoteOutput
>({
  toolId: "git.manageRemote",
  title: "Git Manage Remote",
  description: "List or update Git remote configuration through fixed git remote actions.",
  summary: "Use git.manageRemote to manage remotes without exposing arbitrary git commands.",
  storageGroup: "remote",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitManageRemoteDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageRemoteDescriptor.runtimeEntryPort,
    operationRisk: gitManageRemoteDescriptor.operationRisk,
    allowedGitSubcommand: "remote",
    argvMode: "fixed-manage-remote",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.manageRemote.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["list", "show", "add", "remove", "rename", "set-url"] },
          remoteName: { type: "string" },
          newRemoteName: { type: "string" },
          remoteUrl: { type: "string" },
          urlMode: { type: "string", enum: ["fetch", "push"] },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageRemoteDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageRemote.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.manageRemote" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitManageRemoteHandler: BaseToolHandler<GitManageRemoteHandlerInput, GitManageRemoteOutput> =
  createGitBaseCoreHandler(gitManageRemoteBaseToolDefinition, async (request) => {
    const selection = selectGitManageRemotePractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitManageRemoteCore({
      ...request.input,
      provider: selection.provider,
      context:
        request.input.context === undefined || isRecord(request.input.context)
          ? {
              ...inputContext,
              runtimeId: inputContext.runtimeId ?? request.runtimeId,
              sessionId: inputContext.sessionId ?? request.sessionId,
              invocationId: inputContext.invocationId ?? request.toolCallId,
              auditMetadata: injectRuntimeInvocationMetadata(
                { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitManageRemoteResult };
export { gitManageRemoteDescriptor, parseGitManageRemoteResult, planGitManageRemote, planGitRemoteManagement };
