import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitRevertCommitPractice } from "./anthropic.js";
import { deepmindGitRevertCommitPractice } from "./deepmind.js";
import {
  executeGitRevertCommit as executeGitRevertCommitCore,
  gitRevertCommitDescriptor,
  parseGitRevertCommitResult,
  planGitRevertCommit,
  planGitCommitRevert,
  type GitRevertCommitOutput,
  type GitRevertCommitProvider,
  type GitRevertCommitRequest,
  type GitRevertCommitResult,
} from "./core.js";
import {
  gitRevertCommitDependencyDeclarations,
  type GitRevertCommitDependencies,
  type GitRevertCommitPracticeProviderName,
  type GitRevertCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitRevertCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitRevertCommitBestPracticeRequest = GitRevertCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitRevertCommitPracticeProviderName;
};

export type GitRevertCommitHandlerInput = Omit<GitRevertCommitBestPracticeRequest, "executor">;

export type GitRevertCommitPracticeSelection = {
  providerName: GitRevertCommitPracticeProviderName;
  practice: GitRevertCommitProviderPractice;
  provider?: GitRevertCommitProvider;
};

export const gitRevertCommitProviderPractices = [
  anthropicGitRevertCommitPractice,
  openaiGitRevertCommitPractice,
  deepmindGitRevertCommitPractice,
] as const;

export const gitRevertCommitBestPracticeDescriptor = {
  toolId: "git.revertCommit",
  bestPractice: "runtime-gitExecutor-revert-commit-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitRevertCommitDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitRevertCommitPracticeProviderName | undefined,
): readonly GitRevertCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitRevertCommitProviderPractices;
  }
  return [
    ...gitRevertCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitRevertCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitRevertCommitPractice(
  dependencies: GitRevertCommitDependencies & {
    preferredProvider?: GitRevertCommitPracticeProviderName;
  } = {},
): GitRevertCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitRevertCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitRevertCommit(
  request: GitRevertCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitRevertCommitCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitRevertCommitBestPracticeRequest);
  const selection = selectGitRevertCommitPractice({
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
  return executeGitRevertCommitCore({
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

export const gitRevertCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitRevertCommitHandlerInput,
  GitRevertCommitOutput
>({
  toolId: "git.revertCommit",
  title: "Git Revert Commit",
  description: "Revert a commit through a fixed git revert action.",
  summary: "Use git.revertCommit to create or stage a reverse patch without exposing arbitrary git commands.",
  storageGroup: "commit",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitRevertCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitRevertCommitDescriptor.runtimeEntryPort,
    operationRisk: gitRevertCommitDescriptor.operationRisk,
    allowedGitSubcommand: "revert",
    argvMode: "fixed-revert-commit",
    runtimeOwnsExecution: true,
    revertsCommit: true,
    mayCreateConflicts: true,
  },
  inputSchema: jsonSchema("git.revertCommit.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "commitRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          commitRef: { type: "string", minLength: 1 },
          noCommit: { type: "boolean" },
          mainlineParent: { type: "integer", minimum: 1 },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitRevertCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.revertCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.revertCommit" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      revertsCommit: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitRevertCommitHandler: BaseToolHandler<GitRevertCommitHandlerInput, GitRevertCommitOutput> =
  createGitBaseCoreHandler(gitRevertCommitBaseToolDefinition, async (request) => {
    const selection = selectGitRevertCommitPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitRevertCommitCore({
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
                {
                  ...practiceAuditMetadata(selection),
                  ...(request.metadata ?? {}),
                },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitRevertCommitResult };
export { gitRevertCommitDescriptor, parseGitRevertCommitResult, planGitRevertCommit, planGitCommitRevert };
