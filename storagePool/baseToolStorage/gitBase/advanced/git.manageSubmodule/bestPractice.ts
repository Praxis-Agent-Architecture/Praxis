import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageSubmodulePractice } from "./anthropic.js";
import { deepmindGitManageSubmodulePractice } from "./deepmind.js";
import {
  executeGitManageSubmodule as executeGitManageSubmoduleCore,
  gitManageSubmoduleDescriptor,
  parseGitManageSubmoduleResult,
  planGitManageSubmodule,
  planGitSubmoduleManagement,
  planManageSubmodule,
  type GitManageSubmoduleOutput,
  type GitManageSubmoduleProvider,
  type GitManageSubmoduleRequest,
  type GitManageSubmoduleResult,
} from "./core.js";
import {
  gitManageSubmoduleDependencyDeclarations,
  type GitManageSubmoduleDependencies,
  type GitManageSubmodulePracticeProviderName,
  type GitManageSubmoduleProviderPractice,
} from "./dependencies.js";
import { openaiGitManageSubmodulePractice } from "./openai.js";

export * from "./core.js";

export type GitManageSubmoduleBestPracticeRequest = GitManageSubmoduleRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageSubmodulePracticeProviderName;
};

export type GitManageSubmoduleHandlerInput = Omit<GitManageSubmoduleBestPracticeRequest, "executor">;

export type GitManageSubmodulePracticeSelection = {
  providerName: GitManageSubmodulePracticeProviderName;
  practice: GitManageSubmoduleProviderPractice;
  provider?: GitManageSubmoduleProvider;
};

export const gitManageSubmoduleProviderPractices = [
  anthropicGitManageSubmodulePractice,
  openaiGitManageSubmodulePractice,
  deepmindGitManageSubmodulePractice,
] as const;

export const gitManageSubmoduleBestPracticeDescriptor = {
  toolId: "git.manageSubmodule",
  bestPractice: "runtime-gitExecutor-manage-submodule",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageSubmoduleDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(preferredProvider: GitManageSubmodulePracticeProviderName | undefined): readonly GitManageSubmoduleProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitManageSubmoduleProviderPractices;
  }
  return [
    ...gitManageSubmoduleProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageSubmoduleProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageSubmodulePractice(
  dependencies: GitManageSubmoduleDependencies & { preferredProvider?: GitManageSubmodulePracticeProviderName } = {},
): GitManageSubmodulePracticeSelection {
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

function practiceAuditMetadata(selection: GitManageSubmodulePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitManageSubmodule(
  request: GitManageSubmoduleBestPracticeRequest = {},
): ReturnType<typeof executeGitManageSubmoduleCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitManageSubmoduleBestPracticeRequest);
  const selection = selectGitManageSubmodulePractice({
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
  return executeGitManageSubmoduleCore({
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

export const gitManageSubmoduleBaseToolDefinition = createGitBaseToolDefinition<
  GitManageSubmoduleHandlerInput,
  GitManageSubmoduleOutput
>({
  toolId: "git.manageSubmodule",
  title: "Git Manage Submodule",
  description: "List or update Git submodules through fixed git submodule actions.",
  summary: "Use git.manageSubmodule to manage submodules without exposing arbitrary git commands.",
  storageGroup: "advanced",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write", "network:egress"],
  dependencies: gitManageSubmoduleDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageSubmoduleDescriptor.runtimeEntryPort,
    operationRisk: gitManageSubmoduleDescriptor.operationRisk,
    allowedGitSubcommand: "submodule",
    argvMode: "fixed-manage-submodule",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.manageSubmodule.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["status", "add", "update", "sync", "deinit"] },
          submodulePath: { type: "string" },
          remoteUrl: { type: "string" },
          branch: { type: "string" },
          recursive: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageSubmoduleDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageSubmodule.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.manageSubmodule" },
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

export const gitManageSubmoduleHandler: BaseToolHandler<GitManageSubmoduleHandlerInput, GitManageSubmoduleOutput> =
  createGitBaseCoreHandler(gitManageSubmoduleBaseToolDefinition, async (request) => {
    const selection = selectGitManageSubmodulePractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitManageSubmoduleCore({
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

export type { GitManageSubmoduleResult };
export { gitManageSubmoduleDescriptor, parseGitManageSubmoduleResult, planGitManageSubmodule, planGitSubmoduleManagement, planManageSubmodule };
