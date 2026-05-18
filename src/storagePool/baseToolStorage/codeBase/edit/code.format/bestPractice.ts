import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { CodeEditContext } from "../_shared/editCore.js";
import { anthropicCodeFormatPractice } from "./anthropic.js";
import { deepmindCodeFormatPractice } from "./deepmind.js";
import { codeFormatDependencyDeclarations, type CodeFormatDependencies, type CodeFormatPracticeProviderName, type CodeFormatProviderPractice } from "./dependencies.js";
import { openaiCodeFormatPractice } from "./openai.js";
import {
  codeFormatDescriptor,
  executeCodeFormat as executeCodeFormatCore,
  planCodeFormat,
  type CodeFormatOutput,
  type CodeFormatProvider,
  type CodeFormatRequest,
  type CodeFormatResult,
} from "./core.js";

export * from "./core.js";

export type CodeFormatBestPracticeRequest = CodeFormatRequest & { executor?: BaseToolExecutorPort; preferredProvider?: CodeFormatPracticeProviderName };
export type CodeFormatHandlerInput = Omit<CodeFormatBestPracticeRequest, "executor">;
export type CodeFormatPracticeSelection = { providerName: CodeFormatPracticeProviderName; practice: CodeFormatProviderPractice; provider?: CodeFormatProvider };

export const codeFormatProviderPractices = [anthropicCodeFormatPractice, openaiCodeFormatPractice, deepmindCodeFormatPractice] as const;
export const codeFormatBestPracticeDescriptor = {
  toolId: "code.format",
  bestPractice: "storage-owned-code-format-with-runtime-lsp-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeFormatDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeFormatPracticeProviderName | undefined): readonly CodeFormatProviderPractice[] {
  if (preferredProvider === undefined) return codeFormatProviderPractices;
  return [...codeFormatProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeFormatProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeFormatPractice(dependencies: CodeFormatDependencies & { preferredProvider?: CodeFormatPracticeProviderName } = {}): CodeFormatPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host formatting provider is available; dry-run remains available."], createProvider: () => undefined },
  };
}

function practiceAuditMetadata(selection: CodeFormatPracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeCodeFormat(request: CodeFormatBestPracticeRequest = {}): ReturnType<typeof executeCodeFormatCore> {
  const selection = selectCodeFormatPractice({ executor: request.executor, provider: request.formatter ?? request.provider, preferredProvider: request.preferredProvider });
  return executeCodeFormatCore({ ...request, formatter: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } });
}

const invocationContextSchema = { type: "object", additionalProperties: true, properties: { runtimeId: { type: "string" }, sessionId: { type: "string" }, invocationId: { type: "string" }, dryRun: { type: "boolean" }, workspaceRoot: { type: "string" }, guard: { type: "object", additionalProperties: true } } } as const;

export const codeFormatBaseToolDefinition = createCodeBaseToolDefinition<CodeFormatHandlerInput, CodeFormatOutput>({
  toolId: "code.format",
  title: "Code Format",
  description: "Apply governed formatting using runtime LSP preview edits and runtime filesystem writes.",
  summary: "Use code.format for formatter-backed edits without shelling out.",
  storageGroup: "edit",
  riskLevel: "risky",
  permissionHints: ["filesystem:read", "filesystem:write", "lsp:format"],
  dependencies: codeFormatDependencyDeclarations,
  inputSchema: jsonSchema("code.format.input", { type: "object", additionalProperties: true, properties: { workspaceRoot: { type: "string" }, targetPath: { type: "string" }, languageHint: { type: "string" }, formatterId: { type: "string" }, range: { type: "object", additionalProperties: true }, options: { type: "object", additionalProperties: true }, dryRun: { type: "boolean" }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("code.format.output", { type: "object", additionalProperties: true }),
});

export const codeFormatHandler: BaseToolHandler<CodeFormatHandlerInput, CodeFormatOutput> = createCodeBaseCoreHandler(
  codeFormatBaseToolDefinition,
  async (request) => {
    const selection = selectCodeFormatPractice({ ...request.input, executor: request.executor, provider: request.input.formatter ?? request.input.provider });
    const inputContext = request.input.context ?? {};
    const context: CodeEditContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeCodeFormatCore({ ...request.input, formatter: selection.provider, context });
  },
);

export type { CodeFormatResult };
export { codeFormatDescriptor, planCodeFormat };
