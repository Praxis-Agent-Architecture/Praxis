/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“追踪实现位置”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspDryRunLocation,
  createLspToolFailure,
  ensureLspToolScope,
  normalizeLspTextDocumentPosition,
  type LspLocation,
  type LspTextDocumentPosition,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "./code.lsp_locateDefinition.js";
import { traceImplementationsWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "./code.lsp_locateDefinition/runtime.js";

export type LspTraceImplementationsOutput = {
  kind: "agentCore.basicTool.lsp.traceImplementations";
  target: LspTextDocumentPosition;
  implementations: readonly LspLocation[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspTraceImplementationsProvider = (
  target: LspTextDocumentPosition,
  context: LspToolContext,
) => readonly LspLocation[] | Promise<readonly LspLocation[]>;

export type LspTraceImplementationsRequest = {
  target?: Partial<LspTextDocumentPosition>;
  context?: LspToolContext;
  provider?: LspTraceImplementationsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspTraceImplementationsDescriptor = {
  toolId: "code.lsp_traceImplementations",
  capability: "trace-implementations",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: LspToolContext | undefined): string {
  return context?.invocationId?.trim() || `${lspTraceImplementationsDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspTraceImplementationsDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export async function traceLspImplementations(
  request: LspTraceImplementationsRequest = {},
): Promise<LspToolResult<LspTraceImplementationsOutput>> {
  const toolId = lspTraceImplementationsDescriptor.toolId;
  const target = normalizeLspTextDocumentPosition(request.target);

  if ("code" in target) {
    return createLspToolFailure(toolId, target.code, target.message, target.boundary, request.context, request.target?.filePath);
  }

  const scopeFailure = ensureLspToolScope(toolId, target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.traceImplementations",
        target,
        implementations: [createLspDryRunLocation(target)],
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspTraceImplementationsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.lsp.traceImplementations.dryRun", request.context, target.filePath)],
      events: ["basicTool.lsp.traceImplementations.dryRun"],
    };
  }

  try {
    const implementations =
      request.provider !== undefined
        ? await request.provider(target, request.context ?? {})
        : await traceImplementationsWithLspRuntime(target, {
            ...request.runtime,
            workspaceRoot: request.runtime?.workspaceRoot ?? request.context?.workspaceRoot,
          });

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.traceImplementations",
        target,
        implementations: Object.freeze([...implementations]),
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspTraceImplementationsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.traceImplementations.provider", request.context, target.filePath, {
          implementationCount: implementations.length,
        }),
      ],
      events: ["basicTool.lsp.traceImplementations.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "trace implementations provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
