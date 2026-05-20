import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitSwitchBranchPractice } from "./anthropic.js";
import { deepmindGitSwitchBranchPractice } from "./deepmind.js";
import {
  executeGitSwitchBranch as executeGitSwitchBranchCore,
  gitSwitchBranchDescriptor,
  parseGitSwitchBranchResult,
  planGitBranchSwitch,
  planGitSwitchBranch,
  type GitSwitchBranchOutput,
  type GitSwitchBranchProvider,
  type GitSwitchBranchRequest,
  type GitSwitchBranchResult,
} from "./core.js";
import {
  gitSwitchBranchDependencyDeclarations,
  type GitSwitchBranchDependencies,
  type GitSwitchBranchPracticeProviderName,
  type GitSwitchBranchProviderPractice,
} from "./dependencies.js";
import { openaiGitSwitchBranchPractice } from "./openai.js";

export * from "./core.js";

export type GitSwitchBranchBestPracticeRequest = GitSwitchBranchRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitSwitchBranchPracticeProviderName;
};

export type GitSwitchBranchHandlerInput = Omit<GitSwitchBranchBestPracticeRequest, "executor">;

export type GitSwitchBranchPracticeSelection = {
  providerName: GitSwitchBranchPracticeProviderName;
  practice: GitSwitchBranchProviderPractice;
  provider?: GitSwitchBranchProvider;
};

export const gitSwitchBranchProviderPractices = [
  anthropicGitSwitchBranchPractice,
  openaiGitSwitchBranchPractice,
  deepmindGitSwitchBranchPractice,
] as const;

export const gitSwitchBranchBestPracticeDescriptor = {
  toolId: "git.switchBranch",
  bestPractice: "runtime-gitExecutor-switch-branch-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitSwitchBranchDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitSwitchBranchPracticeProviderName | undefined,
): readonly GitSwitchBranchProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitSwitchBranchProviderPractices;
  }
  return [
    ...gitSwitchBranchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitSwitchBranchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitSwitchBranchPractice(
  dependencies: GitSwitchBranchDependencies & {
    preferredProvider?: GitSwitchBranchPracticeProviderName;
  } = {},
): GitSwitchBranchPracticeSelection {
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

function practiceAuditMetadata(selection: GitSwitchBranchPracticeSelection): Readonly<Record<string, unknown>> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function executeGitSwitchBranch(
  request: GitSwitchBranchBestPracticeRequest = {},
): ReturnType<typeof executeGitSwitchBranchCore> {
  const safeRequest =
    typeof request === "object" && request !== null ? request : ({} as GitSwitchBranchBestPracticeRequest);
  const selection = selectGitSwitchBranchPractice({
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
  return executeGitSwitchBranchCore({
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

export const gitSwitchBranchBaseToolDefinition = createGitBaseToolDefinition<
  GitSwitchBranchHandlerInput,
  GitSwitchBranchOutput
>({
  toolId: "git.switchBranch",
  title: "Git Switch Branch",
  description: "Switch the current repository branch through a fixed git switch action.",
  summary: "Use git.switchBranch to switch or create a branch without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitSwitchBranchDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitSwitchBranchDescriptor.runtimeEntryPort,
    operationRisk: gitSwitchBranchDescriptor.operationRisk,
    allowedGitSubcommand: "switch",
    argvMode: "fixed-switch-branch-workspace-mutation",
    runtimeOwnsExecution: true,
    switchesBranch: true,
  },
  inputSchema: jsonSchema("git.switchBranch.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "branchName"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          branchName: { type: "string", minLength: 1 },
          create: { type: "boolean" },
          startPoint: { type: "string" },
          track: { type: "boolean" },
          discardChanges: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitSwitchBranchDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.switchBranch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.switchBranch" },
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
      switchesBranch: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitSwitchBranchHandler: BaseToolHandler<GitSwitchBranchHandlerInput, GitSwitchBranchOutput> =
  createGitBaseCoreHandler(gitSwitchBranchBaseToolDefinition, async (request) => {
    const selection = selectGitSwitchBranchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitSwitchBranchCore({
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

export type { GitSwitchBranchResult };
export { gitSwitchBranchDescriptor, parseGitSwitchBranchResult, planGitBranchSwitch, planGitSwitchBranch };
