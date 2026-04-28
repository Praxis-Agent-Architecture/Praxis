import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitShowObjectDetailsPractice } from "./anthropic.js";
import { deepmindGitShowObjectDetailsPractice } from "./deepmind.js";
import {
  executeGitShowObjectDetails as executeGitShowObjectDetailsCore,
  gitShowObjectDetailsDescriptor,
  planShowGitObjectDetails,
  type GitShowObjectDetailsOutput,
  type GitShowObjectDetailsProvider,
  type GitShowObjectDetailsRequest,
  type GitShowObjectDetailsResult,
} from "./core.js";
import {
  gitShowObjectDetailsDependencyDeclarations,
  type GitShowObjectDetailsDependencies,
  type GitShowObjectDetailsPracticeProviderName,
  type GitShowObjectDetailsProviderPractice,
} from "./dependencies.js";
import { openaiGitShowObjectDetailsPractice } from "./openai.js";

export * from "./core.js";

export type GitShowObjectDetailsBestPracticeRequest = GitShowObjectDetailsRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitShowObjectDetailsPracticeProviderName;
};

export type GitShowObjectDetailsHandlerInput = Omit<GitShowObjectDetailsBestPracticeRequest, "executor">;

export type GitShowObjectDetailsPracticeSelection = {
  providerName: GitShowObjectDetailsPracticeProviderName;
  practice: GitShowObjectDetailsProviderPractice;
  provider?: GitShowObjectDetailsProvider;
};

export const gitShowObjectDetailsProviderPractices = [
  anthropicGitShowObjectDetailsPractice,
  openaiGitShowObjectDetailsPractice,
  deepmindGitShowObjectDetailsPractice,
] as const;

export const gitShowObjectDetailsBestPracticeDescriptor = {
  toolId: "git.showGitObjectDetails",
  bestPractice: "runtime-gitExecutor-show-read",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitShowObjectDetailsDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitShowObjectDetailsPracticeProviderName | undefined,
): readonly GitShowObjectDetailsProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitShowObjectDetailsProviderPractices;
  }
  return [
    ...gitShowObjectDetailsProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitShowObjectDetailsProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitShowObjectDetailsPractice(
  dependencies: GitShowObjectDetailsDependencies & {
    preferredProvider?: GitShowObjectDetailsPracticeProviderName;
  } = {},
): GitShowObjectDetailsPracticeSelection {
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

function practiceAuditMetadata(selection: GitShowObjectDetailsPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitShowObjectDetails(
  request: GitShowObjectDetailsBestPracticeRequest = {},
): ReturnType<typeof executeGitShowObjectDetailsCore> {
  const selection = selectGitShowObjectDetailsPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitShowObjectDetailsCore({
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

export const gitShowObjectDetailsBaseToolDefinition = createGitBaseToolDefinition<
  GitShowObjectDetailsHandlerInput,
  GitShowObjectDetailsOutput
>({
  toolId: "git.showGitObjectDetails",
  title: "Git Object Details",
  description: "Read a fixed git show view through the governed runtime git executor.",
  summary: "Use git.showGitObjectDetails to inspect one Git object, commit, or patch without mutation.",
  storageGroup: "inspection",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitShowObjectDetailsDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitShowObjectDetailsDescriptor.runtimeEntryPort,
    operationRisk: gitShowObjectDetailsDescriptor.operationRisk,
    allowedGitSubcommand: "show",
    argvMode: "fixed-show-read",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.showGitObjectDetails.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "objectRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          objectRef: { type: "string", minLength: 1 },
          format: { type: "string", enum: ["summary", "patch", "raw"] },
          maxBytes: { type: "integer", minimum: 1, maximum: 10_000_000 },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitShowObjectDetailsDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.showGitObjectDetails.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.showGitObjectDetails" },
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

export const gitShowObjectDetailsHandler: BaseToolHandler<
  GitShowObjectDetailsHandlerInput,
  GitShowObjectDetailsOutput
> = createGitBaseCoreHandler(gitShowObjectDetailsBaseToolDefinition, async (request) => {
  const selection = selectGitShowObjectDetailsPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitShowObjectDetailsCore({
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

export type { GitShowObjectDetailsResult };
export { gitShowObjectDetailsDescriptor, planShowGitObjectDetails };
