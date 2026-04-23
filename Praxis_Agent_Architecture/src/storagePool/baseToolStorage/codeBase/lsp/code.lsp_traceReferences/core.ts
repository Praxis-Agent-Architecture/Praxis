/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“追踪引用位置”基础能力原语。
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
} from "../code.lsp_locateDefinition/core.js";
import { traceReferencesWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspTraceReferencesOutput = {
  kind: "agentCore.basicTool.lsp.traceReferences";
  target: LspTextDocumentPosition;
  references: readonly LspLocation[];
  includeDeclaration: boolean;
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspTraceReferencesProvider = (
  target: LspTextDocumentPosition,
  context: LspToolContext,
  includeDeclaration: boolean,
) => readonly LspLocation[] | Promise<readonly LspLocation[]>;

export type LspTraceReferencesRequest = {
  target?: Partial<LspTextDocumentPosition>;
  includeDeclaration?: boolean;
  context?: LspToolContext;
  provider?: LspTraceReferencesProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspTraceReferencesDescriptor = {
  toolId: "code.lsp_traceReferences",
  capability: "trace-references",
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
  return context?.invocationId?.trim() || `${lspTraceReferencesDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspTraceReferencesDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

export async function traceLspReferences(
  request: LspTraceReferencesRequest = {},
): Promise<LspToolResult<LspTraceReferencesOutput>> {
  const toolId = lspTraceReferencesDescriptor.toolId;
  const target = normalizeLspTextDocumentPosition(request.target);

  if ("code" in target) {
    return createLspToolFailure(toolId, target.code, target.message, target.boundary, request.context, request.target?.filePath);
  }

  const scopeFailure = ensureLspToolScope(toolId, target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const includeDeclaration = request.includeDeclaration ?? false;
  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.traceReferences",
        target,
        references: [createLspDryRunLocation(target)],
        includeDeclaration,
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspTraceReferencesDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.traceReferences.dryRun", request.context, target.filePath, {
          includeDeclaration,
        }),
      ],
      events: ["basicTool.lsp.traceReferences.dryRun"],
    };
  }

  try {
    const references =
      request.provider !== undefined
        ? await request.provider(target, request.context ?? {}, includeDeclaration)
        : await traceReferencesWithLspRuntime(target, includeDeclaration, {
            ...request.runtime,
            workspaceRoot: request.runtime?.workspaceRoot ?? request.context?.workspaceRoot,
          });

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.traceReferences",
        target,
        references: Object.freeze([...references]),
        includeDeclaration,
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspTraceReferencesDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.traceReferences.provider", request.context, target.filePath, {
          includeDeclaration,
          referenceCount: references.length,
        }),
      ],
      events: ["basicTool.lsp.traceReferences.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "trace references provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
