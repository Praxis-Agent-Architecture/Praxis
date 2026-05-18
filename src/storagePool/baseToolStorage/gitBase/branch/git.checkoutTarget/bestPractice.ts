import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCheckoutTargetPractice } from "./anthropic.js";
import { deepmindGitCheckoutTargetPractice } from "./deepmind.js";
import {
  executeGitCheckoutTarget as executeGitCheckoutTargetCore,
  gitCheckoutTargetDescriptor,
  parseGitCheckoutTargetResult,
  planGitCheckoutTarget,
  planGitTargetCheckout,
  type GitCheckoutTargetOutput,
  type GitCheckoutTargetProvider,
  type GitCheckoutTargetRequest,
  type GitCheckoutTargetResult,
} from "./core.js";
import {
  gitCheckoutTargetDependencyDeclarations,
  type GitCheckoutTargetDependencies,
  type GitCheckoutTargetPracticeProviderName,
  type GitCheckoutTargetProviderPractice,
} from "./dependencies.js";
import { openaiGitCheckoutTargetPractice } from "./openai.js";

export * from "./core.js";

export type GitCheckoutTargetBestPracticeRequest = GitCheckoutTargetRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitCheckoutTargetPracticeProviderName;
};

export type GitCheckoutTargetHandlerInput = Omit<GitCheckoutTargetBestPracticeRequest, "executor">;

export type GitCheckoutTargetPracticeSelection = {
  providerName: GitCheckoutTargetPracticeProviderName;
  practice: GitCheckoutTargetProviderPractice;
  provider?: GitCheckoutTargetProvider;
};

export const gitCheckoutTargetProviderPractices = [
  anthropicGitCheckoutTargetPractice,
  openaiGitCheckoutTargetPractice,
  deepmindGitCheckoutTargetPractice,
] as const;

export const gitCheckoutTargetBestPracticeDescriptor = {
  toolId: "git.checkoutTarget",
  bestPractice: "runtime-gitExecutor-checkout-target-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitCheckoutTargetDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitCheckoutTargetPracticeProviderName | undefined,
): readonly GitCheckoutTargetProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitCheckoutTargetProviderPractices;
  }
  return [
    ...gitCheckoutTargetProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitCheckoutTargetProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitCheckoutTargetPractice(
  dependencies: GitCheckoutTargetDependencies & {
    preferredProvider?: GitCheckoutTargetPracticeProviderName;
  } = {},
): GitCheckoutTargetPracticeSelection {
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

function practiceAuditMetadata(selection: GitCheckoutTargetPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCheckoutTarget(
  request: GitCheckoutTargetBestPracticeRequest = {},
): ReturnType<typeof executeGitCheckoutTargetCore> {
  const safeRequest =
    typeof request === "object" && request !== null ? request : ({} as GitCheckoutTargetBestPracticeRequest);
  const selection = selectGitCheckoutTargetPractice({
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
  return executeGitCheckoutTargetCore({
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

export const gitCheckoutTargetBaseToolDefinition = createGitBaseToolDefinition<
  GitCheckoutTargetHandlerInput,
  GitCheckoutTargetOutput
>({
  toolId: "git.checkoutTarget",
  title: "Git Checkout Target",
  description: "Check out a safe git target ref through a fixed git checkout action.",
  summary: "Use git.checkoutTarget to check out a target ref without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitCheckoutTargetDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitCheckoutTargetDescriptor.runtimeEntryPort,
    operationRisk: gitCheckoutTargetDescriptor.operationRisk,
    allowedGitSubcommand: "checkout",
    argvMode: "fixed-checkout-target-workspace-mutation",
    runtimeOwnsExecution: true,
    checksOutTarget: true,
  },
  inputSchema: jsonSchema("git.checkoutTarget.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "targetRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          targetRef: { type: "string", minLength: 1 },
          newBranchName: { type: "string" },
          detach: { type: "boolean" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitCheckoutTargetDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.checkoutTarget.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.checkoutTarget" },
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
      checksOutTarget: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitCheckoutTargetHandler: BaseToolHandler<GitCheckoutTargetHandlerInput, GitCheckoutTargetOutput> =
  createGitBaseCoreHandler(gitCheckoutTargetBaseToolDefinition, async (request) => {
    const selection = selectGitCheckoutTargetPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitCheckoutTargetCore({
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

export type { GitCheckoutTargetResult };
export { gitCheckoutTargetDescriptor, parseGitCheckoutTargetResult, planGitCheckoutTarget, planGitTargetCheckout };
