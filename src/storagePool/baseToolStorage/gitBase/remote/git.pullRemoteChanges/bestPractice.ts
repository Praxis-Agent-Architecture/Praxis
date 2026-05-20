import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitPullRemoteChangesPractice } from "./anthropic.js";
import { deepmindGitPullRemoteChangesPractice } from "./deepmind.js";
import {
  executeGitPullRemoteChanges as executeGitPullRemoteChangesCore,
  gitPullRemoteChangesDescriptor,
  parseGitPullRemoteChangesResult,
  planGitRemotePull,
  planGitPullRemoteChanges,
  type GitPullRemoteChangesOutput,
  type GitPullRemoteChangesProvider,
  type GitPullRemoteChangesRequest,
  type GitPullRemoteChangesResult,
} from "./core.js";
import {
  gitPullRemoteChangesDependencyDeclarations,
  type GitPullRemoteChangesDependencies,
  type GitPullRemoteChangesPracticeProviderName,
  type GitPullRemoteChangesProviderPractice,
} from "./dependencies.js";
import { openaiGitPullRemoteChangesPractice } from "./openai.js";

export * from "./core.js";

export type GitPullRemoteChangesBestPracticeRequest = GitPullRemoteChangesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitPullRemoteChangesPracticeProviderName;
};

export type GitPullRemoteChangesHandlerInput = Omit<GitPullRemoteChangesBestPracticeRequest, "executor">;

export type GitPullRemoteChangesPracticeSelection = {
  providerName: GitPullRemoteChangesPracticeProviderName;
  practice: GitPullRemoteChangesProviderPractice;
  provider?: GitPullRemoteChangesProvider;
};

export const gitPullRemoteChangesProviderPractices = [
  anthropicGitPullRemoteChangesPractice,
  openaiGitPullRemoteChangesPractice,
  deepmindGitPullRemoteChangesPractice,
] as const;

export const gitPullRemoteChangesBestPracticeDescriptor = {
  toolId: "git.pullRemoteChanges",
  bestPractice: "runtime-gitExecutor-pull-remote-network",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitPullRemoteChangesDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitPullRemoteChangesPracticeProviderName | undefined,
): readonly GitPullRemoteChangesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitPullRemoteChangesProviderPractices;
  }
  return [
    ...gitPullRemoteChangesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitPullRemoteChangesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitPullRemoteChangesPractice(
  dependencies: GitPullRemoteChangesDependencies & { preferredProvider?: GitPullRemoteChangesPracticeProviderName } = {},
): GitPullRemoteChangesPracticeSelection {
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

function practiceAuditMetadata(selection: GitPullRemoteChangesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitPullRemoteChanges(
  request: GitPullRemoteChangesBestPracticeRequest = {},
): ReturnType<typeof executeGitPullRemoteChangesCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitPullRemoteChangesBestPracticeRequest);
  const selection = selectGitPullRemoteChangesPractice({
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
  return executeGitPullRemoteChangesCore({
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

export const gitPullRemoteChangesBaseToolDefinition = createGitBaseToolDefinition<
  GitPullRemoteChangesHandlerInput,
  GitPullRemoteChangesOutput
>({
  toolId: "git.pullRemoteChanges",
  title: "Git Pull Remote Changes",
  description: "Pull remote Git changes through a fixed git pull action.",
  summary: "Use git.pullRemoteChanges to pull from a remote without exposing arbitrary git commands.",
  storageGroup: "remote",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:write", "network:egress"],
  dependencies: gitPullRemoteChangesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitPullRemoteChangesDescriptor.runtimeEntryPort,
    operationRisk: gitPullRemoteChangesDescriptor.operationRisk,
    allowedGitSubcommand: "pull",
    argvMode: "fixed-pull-remote-changes",
    runtimeOwnsExecution: true,
    mayUseNetwork: true,
  },
  inputSchema: jsonSchema("git.pullRemoteChanges.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          remoteName: { type: "string" },
          branchName: { type: "string" },
          integrationMode: { type: "string", enum: ["merge", "rebase", "ff-only"] },
          autostash: { type: "boolean" },
          prune: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitPullRemoteChangesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.pullRemoteChanges.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.pullRemoteChanges" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      mayUseNetwork: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitPullRemoteChangesHandler: BaseToolHandler<GitPullRemoteChangesHandlerInput, GitPullRemoteChangesOutput> =
  createGitBaseCoreHandler(gitPullRemoteChangesBaseToolDefinition, async (request) => {
    const selection = selectGitPullRemoteChangesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitPullRemoteChangesCore({
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

export type { GitPullRemoteChangesResult };
export { gitPullRemoteChangesDescriptor, parseGitPullRemoteChangesResult, planGitRemotePull, planGitPullRemoteChanges };
