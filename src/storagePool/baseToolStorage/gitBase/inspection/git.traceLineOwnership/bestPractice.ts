import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitTraceLineOwnershipPractice } from "./anthropic.js";
import { deepmindGitTraceLineOwnershipPractice } from "./deepmind.js";
import {
  executeGitTraceLineOwnership as executeGitTraceLineOwnershipCore,
  gitTraceLineOwnershipDescriptor,
  planTraceLineOwnership,
  type GitTraceLineOwnershipOutput,
  type GitTraceLineOwnershipProvider,
  type GitTraceLineOwnershipRequest,
  type GitTraceLineOwnershipResult,
} from "./core.js";
import {
  gitTraceLineOwnershipDependencyDeclarations,
  type GitTraceLineOwnershipDependencies,
  type GitTraceLineOwnershipPracticeProviderName,
  type GitTraceLineOwnershipProviderPractice,
} from "./dependencies.js";
import { openaiGitTraceLineOwnershipPractice } from "./openai.js";

export * from "./core.js";

export type GitTraceLineOwnershipBestPracticeRequest = GitTraceLineOwnershipRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitTraceLineOwnershipPracticeProviderName;
};

export type GitTraceLineOwnershipHandlerInput = Omit<GitTraceLineOwnershipBestPracticeRequest, "executor">;

export type GitTraceLineOwnershipPracticeSelection = {
  providerName: GitTraceLineOwnershipPracticeProviderName;
  practice: GitTraceLineOwnershipProviderPractice;
  provider?: GitTraceLineOwnershipProvider;
};

export const gitTraceLineOwnershipProviderPractices = [
  anthropicGitTraceLineOwnershipPractice,
  openaiGitTraceLineOwnershipPractice,
  deepmindGitTraceLineOwnershipPractice,
] as const;

export const gitTraceLineOwnershipBestPracticeDescriptor = {
  toolId: "git.traceLineOwnership",
  bestPractice: "runtime-gitExecutor-blame-read",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitTraceLineOwnershipDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitTraceLineOwnershipPracticeProviderName | undefined,
): readonly GitTraceLineOwnershipProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitTraceLineOwnershipProviderPractices;
  }
  return [
    ...gitTraceLineOwnershipProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitTraceLineOwnershipProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitTraceLineOwnershipPractice(
  dependencies: GitTraceLineOwnershipDependencies & {
    preferredProvider?: GitTraceLineOwnershipPracticeProviderName;
  } = {},
): GitTraceLineOwnershipPracticeSelection {
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

function practiceAuditMetadata(selection: GitTraceLineOwnershipPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitTraceLineOwnership(
  request: GitTraceLineOwnershipBestPracticeRequest = {},
): ReturnType<typeof executeGitTraceLineOwnershipCore> {
  const selection = selectGitTraceLineOwnershipPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitTraceLineOwnershipCore({
    ...request,
    provider: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...practiceAuditMetadata(selection),
      },
    },
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

export const gitTraceLineOwnershipBaseToolDefinition = createGitBaseToolDefinition<
  GitTraceLineOwnershipHandlerInput,
  GitTraceLineOwnershipOutput
>({
  toolId: "git.traceLineOwnership",
  title: "Git Line Ownership",
  description: "Read fixed git blame line ownership through the governed runtime git executor.",
  summary: "Use git.traceLineOwnership to inspect commit ownership for a repository-relative file range without mutation.",
  storageGroup: "inspection",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitTraceLineOwnershipDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitTraceLineOwnershipDescriptor.runtimeEntryPort,
    operationRisk: gitTraceLineOwnershipDescriptor.operationRisk,
    allowedGitSubcommand: "blame",
    argvMode: "fixed-blame-read",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.traceLineOwnership.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "filePath", "range"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          filePath: { type: "string", minLength: 1 },
          range: {
            type: "object",
            required: ["startLine", "endLine"],
            additionalProperties: true,
            properties: {
              startLine: { type: "integer", minimum: 1 },
              endLine: { type: "integer", minimum: 1 },
            },
          },
          revision: { type: "string" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitTraceLineOwnershipDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.traceLineOwnership.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.traceLineOwnership" },
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
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitTraceLineOwnershipHandler: BaseToolHandler<
  GitTraceLineOwnershipHandlerInput,
  GitTraceLineOwnershipOutput
> = createGitBaseCoreHandler(gitTraceLineOwnershipBaseToolDefinition, async (request) => {
  const selection = selectGitTraceLineOwnershipPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitTraceLineOwnershipCore({
    ...request.input,
    provider: selection.provider,
    context: {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...practiceAuditMetadata(selection),
          ...(request.metadata ?? {}),
        },
        inputContext.auditMetadata,
        request,
      ),
    },
  });
});

export type { GitTraceLineOwnershipResult };
export { gitTraceLineOwnershipDescriptor, planTraceLineOwnership };
