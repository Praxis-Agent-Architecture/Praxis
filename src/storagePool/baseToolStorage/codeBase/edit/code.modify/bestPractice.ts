import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { anthropicCodeModifyPractice } from "./anthropic.js";
import { deepmindCodeModifyPractice } from "./deepmind.js";
import { codeModifyDependencyDeclarations, type CodeModifyDependencies, type CodeModifyPracticeProviderName, type CodeModifyProviderPractice } from "./dependencies.js";
import { openaiCodeModifyPractice } from "./openai.js";
import type { CodeEditContext } from "../_shared/editCore.js";
import {
  codeModifyDescriptor,
  executeCodeModify as executeCodeModifyCore,
  planCodeModify,
  type CodeModifyOutput,
  type CodeModifyProvider,
  type CodeModifyRequest,
  type CodeModifyResult,
} from "./core.js";

export * from "./core.js";

export type CodeModifyBestPracticeRequest = CodeModifyRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CodeModifyPracticeProviderName;
};
export type CodeModifyHandlerInput = Omit<CodeModifyBestPracticeRequest, "executor">;
export type CodeModifyPracticeSelection = {
  providerName: CodeModifyPracticeProviderName;
  practice: CodeModifyProviderPractice;
  provider?: CodeModifyProvider;
};

export const codeModifyProviderPractices = [anthropicCodeModifyPractice, openaiCodeModifyPractice, deepmindCodeModifyPractice] as const;
export const codeModifyBestPracticeDescriptor = {
  toolId: "code.modify",
  bestPractice: "storage-owned-bounded-code-modify-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeModifyDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeModifyPracticeProviderName | undefined): readonly CodeModifyProviderPractice[] {
  if (preferredProvider === undefined) return codeModifyProviderPractices;
  return [...codeModifyProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeModifyProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeModifyPractice(
  dependencies: CodeModifyDependencies & { preferredProvider?: CodeModifyPracticeProviderName } = {},
): CodeModifyPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or host filesystem edit provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: CodeModifyPracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeCodeModify(request: CodeModifyBestPracticeRequest = {}): ReturnType<typeof executeCodeModifyCore> {
  const selection = selectCodeModifyPractice({
    executor: request.executor,
    provider: request.modifier ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeCodeModifyCore({
    ...request,
    modifier: selection.provider,
    context: {
      ...request.context,
      auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) },
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
    workspaceRoot: { type: "string" },
    guard: { type: "object", additionalProperties: true },
  },
} as const;

export const codeModifyBaseToolDefinition = createCodeBaseToolDefinition<CodeModifyHandlerInput, CodeModifyOutput>({
  toolId: "code.modify",
  title: "Code Modify",
  description: "Apply a governed bounded replacement inside an existing code file.",
  summary: "Use code.modify for bounded search/replace edits instead of shell text rewrites.",
  storageGroup: "edit",
  riskLevel: "risky",
  permissionHints: ["filesystem:read", "filesystem:write"],
  dependencies: codeModifyDependencyDeclarations,
  inputSchema: jsonSchema("code.modify.input", { type: "object", additionalProperties: true, properties: { workspaceRoot: { type: "string" }, targetPath: { type: "string" }, searchText: { type: "string" }, replacementText: { type: "string" }, occurrence: { enum: ["first", "all"] }, maxReplacements: { type: "integer", minimum: 1 }, dryRun: { type: "boolean" }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("code.modify.output", { type: "object", additionalProperties: true }),
});

export const codeModifyHandler: BaseToolHandler<CodeModifyHandlerInput, CodeModifyOutput> = createCodeBaseCoreHandler(
  codeModifyBaseToolDefinition,
  async (request) => {
    const selection = selectCodeModifyPractice({ ...request.input, executor: request.executor, provider: request.input.modifier ?? request.input.provider });
    const inputContext = request.input.context ?? {};
    const context: CodeEditContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request),
    };
    return executeCodeModifyCore({ ...request.input, modifier: selection.provider, context });
  },
);

export type { CodeModifyResult };
export { codeModifyDescriptor, planCodeModify };
