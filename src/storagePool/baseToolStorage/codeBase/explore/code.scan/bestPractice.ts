import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicCodeScanPractice } from "./anthropic.js";
import { deepmindCodeScanPractice } from "./deepmind.js";
import { openaiCodeScanPractice } from "./openai.js";
import {
  buildCodeBasePracticeAuditMetadata,
  createCodeBaseCoreHandler,
  createCodeBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeCodeScan as executeCodeScanCore,
  type CodeScanContext,
  type CodeScanOutput,
  type CodeScanProvider,
  type CodeScanRequest,
} from "./core.js";
import {
  codeScanDependencyDeclarations,
  type CodeScanDependencies,
  type CodeScanPracticeProviderName,
  type CodeScanProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type CodeScanBestPracticeRequest = CodeScanRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: CodeScanPracticeProviderName;
};

export type CodeScanHandlerInput = Omit<CodeScanBestPracticeRequest, "executor">;

export type CodeScanPracticeSelection = {
  providerName: CodeScanPracticeProviderName;
  practice: CodeScanProviderPractice;
  provider?: CodeScanProvider;
};

export const codeScanProviderPractices = [
  anthropicCodeScanPractice,
  openaiCodeScanPractice,
  deepmindCodeScanPractice,
] as const;

export const codeScanBestPracticeDescriptor = {
  toolId: "code.scan",
  bestPractice: "storage-owned-code-scan-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeScanDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeScanPracticeProviderName | undefined): readonly CodeScanProviderPractice[] {
  if (preferredProvider === undefined) return codeScanProviderPractices;
  return [
    ...codeScanProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...codeScanProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectCodeScanPractice(
  dependencies: CodeScanDependencies & { preferredProvider?: CodeScanPracticeProviderName } = {},
): CodeScanPracticeSelection {
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
      sideEffectPolicy: "read-only",
      notes: ["No injected or host directory scanner is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: CodeScanPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeCodeScan(request: CodeScanBestPracticeRequest = {}): ReturnType<typeof executeCodeScanCore> {
  const selection = selectCodeScanPractice({
    executor: request.executor,
    provider: request.scanner ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeCodeScanCore({
    ...request,
    scanner: selection.provider,
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
    workspaceRoot: { type: "string" },
    allowedRoots: { type: "array", items: { type: "string" } },
    guard: { type: "object", additionalProperties: true },
  },
} as const;

export const codeScanBaseToolDefinition = createCodeBaseToolDefinition<CodeScanHandlerInput, CodeScanOutput>({
  toolId: "code.scan",
  title: "Code Scan",
  description: "Scan a code directory through governed runtime filesystem support.",
  summary: "Use code.scan for directory and code-structure scans without shell.",
  storageGroup: "explore",
  riskLevel: "normal",
  permissionHints: ["filesystem:read"],
  dependencies: codeScanDependencyDeclarations,
  inputSchema: jsonSchema("code.scan.input", {
    type: "object",
    additionalProperties: true,
    required: ["directoryPath"],
    properties: {
      directoryPath: { type: "string" },
      maxEntries: { type: "integer", minimum: 1 },
      depth: { type: "integer", minimum: 1 },
      offset: { type: "integer", minimum: 0 },
      includeGlobs: { type: "array", items: { type: "string" } },
      excludeGlobs: { type: "array", items: { type: "string" } },
      context: invocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.scan.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "directoryPath", "entries", "truncated"],
    properties: {
      kind: { const: "agentCore.basicTool.code.scan.output" },
      directoryPath: { type: "string" },
      entries: { type: "array" },
      offset: { type: "integer", minimum: 0 },
      maxEntries: { type: "integer", minimum: 1 },
      truncated: { type: "boolean" },
    },
  }),
});

export const codeScanHandler: BaseToolHandler<CodeScanHandlerInput, CodeScanOutput> = createCodeBaseCoreHandler(
  codeScanBaseToolDefinition,
  async (request) => {
    const selection = selectCodeScanPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.scanner ?? request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    const context: CodeScanContext = {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
        inputContext.auditMetadata,
        request,
      ),
    };
    return executeCodeScanCore({
      ...request.input,
      scanner: selection.provider,
      context,
    });
  },
);
