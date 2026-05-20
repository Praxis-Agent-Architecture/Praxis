import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitLocateProblemCommitPractice } from "./anthropic.js";
import { deepmindGitLocateProblemCommitPractice } from "./deepmind.js";
import {
  executeGitLocateProblemCommit as executeGitLocateProblemCommitCore,
  gitLocateProblemCommitDescriptor,
  locateProblemCommitDescriptor,
  parseGitLocateProblemCommitResult,
  planGitLocateProblemCommit,
  planLocateProblemCommit,
  type GitLocateProblemCommitOutput,
  type GitLocateProblemCommitProvider,
  type GitLocateProblemCommitRequest,
  type GitLocateProblemCommitResult,
} from "./core.js";
import {
  gitLocateProblemCommitDependencyDeclarations,
  type GitLocateProblemCommitDependencies,
  type GitLocateProblemCommitPracticeProviderName,
  type GitLocateProblemCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitLocateProblemCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitLocateProblemCommitBestPracticeRequest = GitLocateProblemCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitLocateProblemCommitPracticeProviderName;
};

export type GitLocateProblemCommitHandlerInput = Omit<GitLocateProblemCommitBestPracticeRequest, "executor">;

export type GitLocateProblemCommitPracticeSelection = {
  providerName: GitLocateProblemCommitPracticeProviderName;
  practice: GitLocateProblemCommitProviderPractice;
  provider?: GitLocateProblemCommitProvider;
};

export const gitLocateProblemCommitProviderPractices = [
  anthropicGitLocateProblemCommitPractice,
  openaiGitLocateProblemCommitPractice,
  deepmindGitLocateProblemCommitPractice,
] as const;

export const gitLocateProblemCommitBestPracticeDescriptor = {
  toolId: "git.locateProblemCommit",
  bestPractice: "runtime-gitExecutor-locate-problem-commit",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitLocateProblemCommitDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitLocateProblemCommitPracticeProviderName | undefined,
): readonly GitLocateProblemCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitLocateProblemCommitProviderPractices;
  }
  return [
    ...gitLocateProblemCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitLocateProblemCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitLocateProblemCommitPractice(
  dependencies: GitLocateProblemCommitDependencies & { preferredProvider?: GitLocateProblemCommitPracticeProviderName } = {},
): GitLocateProblemCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitLocateProblemCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitLocateProblemCommit(
  request: GitLocateProblemCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitLocateProblemCommitCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitLocateProblemCommitBestPracticeRequest);
  const selection = selectGitLocateProblemCommitPractice({
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
  return executeGitLocateProblemCommitCore({
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

export const gitLocateProblemCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitLocateProblemCommitHandlerInput,
  GitLocateProblemCommitOutput
>({
  toolId: "git.locateProblemCommit",
  title: "Git Locate Problem Commit",
  description: "Locate likely problem commits through a fixed read-only git rev-list candidate search.",
  summary: "Use git.locateProblemCommit to inspect bisect candidates without mutating git bisect state or running shell verification commands.",
  storageGroup: "advanced",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitLocateProblemCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitLocateProblemCommitDescriptor.runtimeEntryPort,
    operationRisk: gitLocateProblemCommitDescriptor.operationRisk,
    allowedGitSubcommand: "rev-list",
    argvMode: "fixed-locate-problem-commit",
    runtimeOwnsExecution: true,
    verificationCommandExecuted: false,
  },
  inputSchema: jsonSchema("git.locateProblemCommit.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "knownGoodRef", "knownBadRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          knownGoodRef: { type: "string", minLength: 1 },
          knownBadRef: { type: "string", minLength: 1 },
          verificationCommand: { type: "string" },
          maxSteps: { type: "integer", minimum: 1, maximum: 1024 },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitLocateProblemCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.locateProblemCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.locateProblemCommit" },
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
      verificationCommandExecuted: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitLocateProblemCommitHandler: BaseToolHandler<GitLocateProblemCommitHandlerInput, GitLocateProblemCommitOutput> =
  createGitBaseCoreHandler(gitLocateProblemCommitBaseToolDefinition, async (request) => {
    const selection = selectGitLocateProblemCommitPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitLocateProblemCommitCore({
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

export type { GitLocateProblemCommitResult };
export {
  gitLocateProblemCommitDescriptor,
  locateProblemCommitDescriptor,
  parseGitLocateProblemCommitResult,
  planGitLocateProblemCommit,
  planLocateProblemCommit,
};
