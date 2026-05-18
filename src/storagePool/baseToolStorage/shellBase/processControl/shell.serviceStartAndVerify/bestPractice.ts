/*
 * 文件定位：storagePool / baseToolStorage / shell.serviceStartAndVerify bestPractice。
 * 核心目的：把通用服务启动与 reachability 验证委派给 runtime-owned process provider。
 */

import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { createShellBaseToolDefinition, createShellCoreHandler, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import { plainJsonRecord, readRecord, safeMetadata, trimmedString } from "../_shared/processControlJson.js";
import { withUnverifiedServiceLifecycle } from "../_shared/serviceLifecycle.js";
import { anthropicShellServiceStartAndVerifyPractice } from "./anthropic.js";
import { deepmindShellServiceStartAndVerifyPractice } from "./deepmind.js";
import { openaiShellServiceStartAndVerifyPractice } from "./openai.js";
import {
  planShellServiceStartAndVerify,
  shellServiceStartAndVerifyDescriptor,
  type ShellServiceStartAndVerifyOutput,
  type ShellServiceStartAndVerifyRequest,
} from "./core.js";
import type { ShellToolAuditEvent, ShellToolContext, ShellToolResult } from "../../shellExecution/shell.commandExecution/core.js";
import {
  shellServiceStartAndVerifyDependencyDeclarations,
  type ShellServiceStartAndVerifyDependencies,
  type ShellServiceStartAndVerifyPracticeProviderName,
  type ShellServiceStartAndVerifyProvider,
  type ShellServiceStartAndVerifyProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type ShellServiceStartAndVerifyBestPracticeRequest = ShellServiceStartAndVerifyRequest & {
  executor?: ShellServiceStartAndVerifyDependencies["executor"];
  provider?: ShellServiceStartAndVerifyProvider;
  preferredProvider?: ShellServiceStartAndVerifyPracticeProviderName;
};

export type ShellServiceStartAndVerifyHandlerInput = Omit<ShellServiceStartAndVerifyBestPracticeRequest, "executor" | "provider">;

export type ShellServiceStartAndVerifyPracticeSelection = {
  providerName: ShellServiceStartAndVerifyPracticeProviderName;
  practice: ShellServiceStartAndVerifyProviderPractice;
  provider?: ShellServiceStartAndVerifyProvider;
};

export const shellServiceStartAndVerifyProviderPractices = [
  anthropicShellServiceStartAndVerifyPractice,
  openaiShellServiceStartAndVerifyPractice,
  deepmindShellServiceStartAndVerifyPractice,
] as const;

export const shellServiceStartAndVerifyBestPracticeDescriptor = {
  toolId: "shell.serviceStartAndVerify",
  bestPractice: "runtime-governed-service-lifecycle",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: shellServiceStartAndVerifyDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: ShellServiceStartAndVerifyPracticeProviderName | undefined,
): readonly ShellServiceStartAndVerifyProviderPractice[] {
  if (preferredProvider === undefined) return shellServiceStartAndVerifyProviderPractices;
  return [
    ...shellServiceStartAndVerifyProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...shellServiceStartAndVerifyProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectShellServiceStartAndVerifyPractice(
  dependencies: ShellServiceStartAndVerifyDependencies & { preferredProvider?: ShellServiceStartAndVerifyPracticeProviderName } = {},
): ShellServiceStartAndVerifyPracticeSelection {
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
      notes: ["No injected or host service lifecycle provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requestRecord(input: unknown): Readonly<Record<string, unknown>> {
  return readRecord(input) ?? {};
}

function bestPracticeRequest(input: unknown): ShellServiceStartAndVerifyBestPracticeRequest {
  return requestRecord(input) as ShellServiceStartAndVerifyBestPracticeRequest;
}

function runtimeContext(input: unknown): ShellToolContext {
  return (readRecord(requestRecord(input).context) ?? {}) as ShellToolContext;
}

function realExecutionRequested(input: unknown): boolean {
  return readRecord(requestRecord(input).context)?.dryRun === false;
}

function guardAllows(context: ShellToolContext): boolean {
  return context.guard?.allowed === true || context.guard?.accepted === true;
}

function auditEvent(type: string, context: ShellToolContext, metadata?: Readonly<Record<string, unknown>>): ShellToolAuditEvent {
  return {
    type,
    toolId: "shell.serviceStartAndVerify",
    invocationId: trimmedString(context.invocationId) || "shell.serviceStartAndVerify:dry-run",
    dryRun: context.dryRun !== false,
    metadata: {
      ...safeMetadata(context.auditMetadata),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: string,
  message: string,
  boundary: "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider",
  context?: ShellToolContext,
): ShellToolResult<ShellServiceStartAndVerifyOutput, string> {
  return {
    ok: false,
    toolId: "shell.serviceStartAndVerify",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.serviceStartAndVerify.rejected", context ?? {}, { code, boundary })],
    events: ["basicTool.shell.serviceStartAndVerify.rejected"],
  };
}

function convertPlanResult(result: ReturnType<typeof planShellServiceStartAndVerify>): ShellToolResult<ShellServiceStartAndVerifyOutput, string> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: "shell.serviceStartAndVerify",
      error: {
        code: result.error.code,
        message: result.error.message,
        boundary: ((result.error.boundary as string) === "approval" ? "governance" : result.error.boundary) as "input" | "contract" | "governance" | "scope" | "resource" | "permission" | "provider",
        safeForRuntimeInspection: true,
        internalDetailExposed: false,
      },
      audit: result.audit as readonly ShellToolAuditEvent[],
      events: result.events,
    };
  }

  return { ok: true, toolId: "shell.serviceStartAndVerify", output: result.output, audit: result.audit as readonly ShellToolAuditEvent[], events: result.events };
}

function providerVerification(target: ShellServiceStartAndVerifyOutput["target"]): Readonly<Record<string, unknown>> {
  return {
    kind: target.verification.kind,
    url: target.verification.kind === "http" ? target.verification.url : undefined,
    expectedStatus: target.verification.kind === "http" ? target.verification.expectedStatus : undefined,
    expectedText: target.verification.kind === "http" || target.verification.kind === "command" ? target.verification.expectedText : undefined,
    method: target.verification.kind === "http" ? target.verification.method : undefined,
    timeoutMs: target.verification.timeoutMs ?? 30_000,
    intervalMs: target.verification.intervalMs ?? 500,
    maxAttempts: target.verification.maxAttempts ?? 60,
  };
}

function providerProbe(target: ShellServiceStartAndVerifyOutput["target"]): Readonly<Record<string, unknown>> {
  if (target.verification.kind === "process") return { type: "process" };
  if (target.verification.kind === "tcp") {
    return {
      type: "tcp",
      host: target.verification.host,
      port: target.verification.port,
    };
  }
  if (target.verification.kind === "http") {
    return {
      type: "http",
      url: target.verification.url,
      expectedStatus: target.verification.expectedStatus,
      method: target.verification.method,
    };
  }
  if (target.verification.kind === "log") {
    return {
      type: "log",
      pattern: target.verification.pattern,
      stream: target.verification.stream,
      regex: target.verification.regex,
    };
  }
  return {
    type: "command",
    command: target.verification.command,
    args: target.verification.args,
    cwd: target.verification.cwd,
    timeoutMs: target.verification.timeoutMs,
  };
}

function normalizedProviderRequest(
  request: unknown,
  plannedOutput: ShellServiceStartAndVerifyOutput,
): ShellServiceStartAndVerifyRequest {
  const requestInput = requestRecord(request);
  return {
    target: {
      command: plannedOutput.target.command,
      workingDirectory: plannedOutput.target.workingDirectory,
      shell: plannedOutput.target.shell,
      serviceId: plannedOutput.target.serviceId,
      launchMode: plannedOutput.target.launchMode,
      restartPolicy: plannedOutput.target.restartPolicy,
      outputBufferLimitBytes: plannedOutput.target.outputBufferLimitBytes,
      captureOutput: plannedOutput.target.captureOutput,
      verification: providerVerification(plannedOutput.target),
    },
    context: { ...(readRecord(requestInput.context) ?? {}), dryRun: false },
  };
}

function normalizeProviderResult(
  providerResult: unknown,
  plannedOutput: ShellServiceStartAndVerifyOutput,
): { resultEnvelope: Readonly<Record<string, unknown>>; metadata: Readonly<Record<string, unknown>> } | undefined {
  const resultRecord = readRecord(providerResult);
  if (resultRecord === undefined) return undefined;

  const resultEnvelope = plainJsonRecord(resultRecord.resultEnvelope);
  if (resultEnvelope === undefined || resultEnvelope.planned === true) return undefined;

  return {
    resultEnvelope: withUnverifiedServiceLifecycle(resultEnvelope, {
      command: plannedOutput.target.command,
      handle: plannedOutput.target.serviceId,
      cwd: plannedOutput.target.workingDirectory,
      lifecycleKind: "service",
      launchMode: plannedOutput.target.launchMode,
      statusSource: "shell.serviceStartAndVerify.provider",
    }),
    metadata: safeMetadata(resultRecord.metadata),
  };
}

export async function executeShellServiceStartAndVerify(
  request: unknown = {},
): Promise<ShellToolResult<ShellServiceStartAndVerifyOutput, string>> {
  const normalizedRequest = bestPracticeRequest(request);
  if (!realExecutionRequested(normalizedRequest)) {
    return convertPlanResult(planShellServiceStartAndVerify(normalizedRequest));
  }

  const context = runtimeContext(normalizedRequest);
  const runtimeId = stringValue(context.runtimeId)?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return failure("MISSING_RUNTIME_ID", "shell.serviceStartAndVerify requires context.runtimeId for real execution audit", "input", context);
  }

  if (!guardAllows(context)) {
    return failure("GOVERNANCE_REJECTED", "shell.serviceStartAndVerify requires an allowed runtime governance guard when dryRun is false", "governance", context);
  }

  const planned = planShellServiceStartAndVerify({ ...normalizedRequest, context: { ...runtimeContext(normalizedRequest), dryRun: true } });
  if (!planned.ok) return convertPlanResult(planned);

  const selection = selectShellServiceStartAndVerifyPractice({
    executor: normalizedRequest.executor,
    provider: normalizedRequest.provider,
    preferredProvider: normalizedRequest.preferredProvider,
  });
  if (selection.provider === undefined) {
    return failure("PROVIDER_UNAVAILABLE", "shell.serviceStartAndVerify requires a runtime-provided service lifecycle provider when dryRun is false", "provider", context);
  }

  try {
    const providerResult = normalizeProviderResult(
      await selection.provider(normalizedProviderRequest(request, planned.output), context),
      planned.output,
    );
    if (providerResult === undefined) {
      return failure("PROVIDER_REJECTED", "shell.serviceStartAndVerify provider must return a plain JSON runtime envelope", "provider", context);
    }

    return {
      ok: true,
      toolId: "shell.serviceStartAndVerify",
      output: {
        ...(planned.output as object),
        dryRun: false,
        executionBlocked: false,
        providerCalled: true,
        resultEnvelope: providerResult.resultEnvelope as ShellServiceStartAndVerifyOutput["resultEnvelope"],
      } as unknown as ShellServiceStartAndVerifyOutput,
      audit: [auditEvent("agentCore.basicTool.shell.serviceStartAndVerify.provider", context, { providerName: selection.providerName, ...providerResult.metadata })],
      events: ["basicTool.shell.serviceStartAndVerify.providerCalled"],
    };
  } catch {
    return failure("PROVIDER_REJECTED", "shell.serviceStartAndVerify provider rejected the invocation", "provider", context);
  }
}

export const shellServiceStartAndVerifyBaseToolDefinition = createShellBaseToolDefinition<ShellServiceStartAndVerifyHandlerInput, ShellServiceStartAndVerifyOutput>({
  toolId: "shell.serviceStartAndVerify",
  title: "Service Start And Verify",
  description: "Start a long-lived service through the runtime and verify user-facing reachability before reporting it healthy.",
  summary: "Use shell.serviceStartAndVerify for dev servers, daemons, API services, and GUI-adjacent services that need launch plus verification evidence.",
  storageGroup: "processControl",
  riskLevel: "risky",
  permissionHints: ["shell:execute", "shell:service:verify"],
  dependencies: shellServiceStartAndVerifyDependencyDeclarations,
  inputSchema: jsonSchema("shell.serviceStartAndVerify.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["command", "verification"],
        properties: {
          command: { type: "string", minLength: 1 },
          workingDirectory: { type: "string" },
          shell: { type: "string", enum: ["sh", "bash", "zsh"] },
          serviceId: { type: "string" },
          launchMode: { type: "string", enum: ["background", "detached"] },
          restartPolicy: { type: "string", enum: ["none", "on-failure"] },
          outputBufferLimitBytes: { type: "integer", minimum: 0, maximum: 10 * 1024 * 1024 },
          captureOutput: { type: "boolean" },
          verification: {
            type: "object",
            additionalProperties: true,
            required: ["kind"],
            properties: {
              kind: { type: "string", enum: ["process", "tcp", "http", "log", "command"] },
              url: { type: "string" },
              port: { type: "integer", minimum: 1, maximum: 65_535 },
              command: { type: "string" },
              expectedStatus: { type: "integer" },
              expectedText: { type: "string" },
              timeoutMs: { type: "integer", minimum: 100, maximum: 120_000 },
              intervalMs: { type: "integer", minimum: 50, maximum: 120_000 },
              maxAttempts: { type: "integer", minimum: 1, maximum: 1_000 },
            },
          },
        },
      },
      context: { type: "object", additionalProperties: true },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("shell.serviceStartAndVerify.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "dryRun", "executionBlocked"],
    properties: {
      kind: { const: "agentCore.basicTool.shell.serviceStartAndVerify" },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
    },
  }),
});

export const shellServiceStartAndVerifyHandler: BaseToolHandler<ShellServiceStartAndVerifyHandlerInput, ShellServiceStartAndVerifyOutput> = createShellCoreHandler(
  shellServiceStartAndVerifyBaseToolDefinition,
  async (request) => executeShellServiceStartAndVerify({
    ...request.input,
    executor: request.executor,
    context: {
      ...(readRecord(request.input.context) ?? {}),
      runtimeId: trimmedString(readRecord(request.input.context)?.runtimeId) ?? request.runtimeId,
      sessionId: trimmedString(readRecord(request.input.context)?.sessionId) ?? request.sessionId,
      invocationId: trimmedString(readRecord(request.input.context)?.invocationId) ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(request.metadata, safeMetadata(readRecord(request.input.context)?.auditMetadata), request),
    },
  }),
);
