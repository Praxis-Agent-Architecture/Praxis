import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitPushLocalChangesPractice } from "./anthropic.js";
import { deepmindGitPushLocalChangesPractice } from "./deepmind.js";
import {
  executeGitPushLocalChanges as executeGitPushLocalChangesCore,
  gitPushLocalChangesDescriptor,
  parseGitPushLocalChangesResult,
  planGitLocalPush,
  planGitPushLocalChanges,
  type GitPushLocalChangesOutput,
  type GitPushLocalChangesProvider,
  type GitPushLocalChangesRequest,
  type GitPushLocalChangesResult,
} from "./core.js";
import {
  gitPushLocalChangesDependencyDeclarations,
  type GitPushLocalChangesDependencies,
  type GitPushLocalChangesPracticeProviderName,
  type GitPushLocalChangesProviderPractice,
} from "./dependencies.js";
import { openaiGitPushLocalChangesPractice } from "./openai.js";

export * from "./core.js";

export type GitPushLocalChangesBestPracticeRequest = GitPushLocalChangesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitPushLocalChangesPracticeProviderName;
};

export type GitPushLocalChangesHandlerInput = Omit<GitPushLocalChangesBestPracticeRequest, "executor">;

export type GitPushLocalChangesPracticeSelection = {
  providerName: GitPushLocalChangesPracticeProviderName;
  practice: GitPushLocalChangesProviderPractice;
  provider?: GitPushLocalChangesProvider;
};

export const gitPushLocalChangesProviderPractices = [
  anthropicGitPushLocalChangesPractice,
  openaiGitPushLocalChangesPractice,
  deepmindGitPushLocalChangesPractice,
] as const;

export const gitPushLocalChangesBestPracticeDescriptor = {
  toolId: "git.pushLocalChanges",
  bestPractice: "runtime-gitExecutor-push-remote-network",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitPushLocalChangesDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitPushLocalChangesPracticeProviderName | undefined,
): readonly GitPushLocalChangesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitPushLocalChangesProviderPractices;
  }
  return [
    ...gitPushLocalChangesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitPushLocalChangesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitPushLocalChangesPractice(
  dependencies: GitPushLocalChangesDependencies & { preferredProvider?: GitPushLocalChangesPracticeProviderName } = {},
): GitPushLocalChangesPracticeSelection {
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

function practiceAuditMetadata(selection: GitPushLocalChangesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitPushLocalChanges(
  request: GitPushLocalChangesBestPracticeRequest = {},
): ReturnType<typeof executeGitPushLocalChangesCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitPushLocalChangesBestPracticeRequest);
  const selection = selectGitPushLocalChangesPractice({
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
  return executeGitPushLocalChangesCore({
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

export const gitPushLocalChangesBaseToolDefinition = createGitBaseToolDefinition<
  GitPushLocalChangesHandlerInput,
  GitPushLocalChangesOutput
>({
  toolId: "git.pushLocalChanges",
  title: "Git Push Local Changes",
  description: "Push local Git refs through a fixed git push action.",
  summary: "Use git.pushLocalChanges to push to a remote without exposing arbitrary git commands.",
  storageGroup: "remote",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "network:egress"],
  dependencies: gitPushLocalChangesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitPushLocalChangesDescriptor.runtimeEntryPort,
    operationRisk: gitPushLocalChangesDescriptor.operationRisk,
    allowedGitSubcommand: "push",
    argvMode: "fixed-push-local-changes",
    runtimeOwnsExecution: true,
    mayUseNetwork: true,
  },
  inputSchema: jsonSchema("git.pushLocalChanges.input", {
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
          setUpstream: { type: "boolean" },
          forceWithLease: { type: "boolean" },
          pushTags: { type: "boolean" },
          deleteRemoteBranch: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitPushLocalChangesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.pushLocalChanges.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.pushLocalChanges" },
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

export const gitPushLocalChangesHandler: BaseToolHandler<GitPushLocalChangesHandlerInput, GitPushLocalChangesOutput> =
  createGitBaseCoreHandler(gitPushLocalChangesBaseToolDefinition, async (request) => {
    const selection = selectGitPushLocalChangesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitPushLocalChangesCore({
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

export type { GitPushLocalChangesResult };
export { gitPushLocalChangesDescriptor, parseGitPushLocalChangesResult, planGitLocalPush, planGitPushLocalChanges };
