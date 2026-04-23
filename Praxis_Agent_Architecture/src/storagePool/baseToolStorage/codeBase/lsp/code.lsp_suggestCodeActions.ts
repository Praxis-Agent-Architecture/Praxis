/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“建议可用代码动作”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspToolFailure,
  ensureLspToolScope,
  type LspRange,
  type LspTextDocumentPosition,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "./code.lsp_locateDefinition.js";
import { requestTextDocumentWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "./code.lsp_locateDefinition/runtime.js";

export type LspCodeActionDiagnostic = {
  message: string;
  range?: LspRange;
  severity?: "error" | "warning" | "information" | "hint";
  code?: string;
  source?: string;
};

export type LspCodeActionSuggestion = {
  title: string;
  kind?: string;
  diagnostics?: readonly LspCodeActionDiagnostic[];
  isPreferred?: boolean;
  editAvailable: boolean;
  commandAvailable: boolean;
  source: "provider" | "dry-run";
};

export type LspCodeActionSuggestionProviderResult = Omit<LspCodeActionSuggestion, "source"> & {
  source?: LspCodeActionSuggestion["source"];
};

export type LspSuggestCodeActionsTarget = {
  filePath: string;
  range: LspRange;
  languageId?: string;
};

export type LspSuggestCodeActionsOutput = {
  kind: "agentCore.basicTool.lsp.suggestCodeActions";
  target: LspSuggestCodeActionsTarget;
  only: readonly string[];
  diagnostics: readonly LspCodeActionDiagnostic[];
  actions: readonly LspCodeActionSuggestion[];
  dryRun: boolean;
  providerCalled: boolean;
  appliesChanges: false;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspSuggestCodeActionsProvider = (
  target: LspSuggestCodeActionsTarget,
  context: LspToolContext,
  diagnostics: readonly LspCodeActionDiagnostic[],
  only: readonly string[],
) => readonly LspCodeActionSuggestionProviderResult[] | Promise<readonly LspCodeActionSuggestionProviderResult[]>;

export type LspSuggestCodeActionsRequest = {
  target?: Partial<LspSuggestCodeActionsTarget>;
  diagnostics?: readonly LspCodeActionDiagnostic[];
  only?: readonly string[];
  context?: LspToolContext;
  provider?: LspSuggestCodeActionsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspSuggestCodeActionsDescriptor = {
  toolId: "code.lsp_suggestCodeActions",
  capability: "suggest-code-actions",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  appliesChanges: false,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): value is undefined {
  return typeof value !== "string" || value.trim().length === 0;
}

function isValidPosition(position: { line?: number; character?: number } | undefined): position is {
  line: number;
  character: number;
} {
  return (
    position !== undefined &&
    Number.isInteger(position.line) &&
    Number.isInteger(position.character) &&
    Number(position.line) >= 0 &&
    Number(position.character) >= 0
  );
}

function comparePosition(left: { line: number; character: number }, right: { line: number; character: number }): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function isValidRange(range: Partial<LspRange> | undefined): range is LspRange {
  return (
    range !== undefined &&
    isValidPosition(range.start) &&
    isValidPosition(range.end) &&
    comparePosition(range.start, range.end) <= 0
  );
}

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: LspToolContext | undefined): string {
  return context?.invocationId?.trim() || `${lspSuggestCodeActionsDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspSuggestCodeActionsDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function normalizeTarget(
  target: Partial<LspSuggestCodeActionsTarget> | undefined,
): LspSuggestCodeActionsTarget | undefined {
  if (target === undefined || isBlank(target.filePath) || !isValidRange(target.range)) {
    return undefined;
  }

  return {
    filePath: target.filePath.trim(),
    range: {
      start: { line: target.range.start.line, character: target.range.start.character },
      end: { line: target.range.end.line, character: target.range.end.character },
    },
    languageId: target.languageId?.trim() || undefined,
  };
}

function scopeProbe(target: LspSuggestCodeActionsTarget): LspTextDocumentPosition {
  return {
    filePath: target.filePath,
    line: target.range.start.line,
    character: target.range.start.character,
    languageId: target.languageId,
  };
}

function normalizeOnly(only: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...new Set((only ?? []).map((kind) => kind.trim()).filter(Boolean))]);
}

function normalizeDiagnostics(diagnostics: readonly LspCodeActionDiagnostic[] | undefined): readonly LspCodeActionDiagnostic[] {
  return Object.freeze(
    (diagnostics ?? [])
      .filter((diagnostic) => !isBlank(diagnostic.message))
      .map((diagnostic) => ({ ...diagnostic, message: diagnostic.message.trim() })),
  );
}

function normalizeProviderActions(value: unknown): readonly LspCodeActionSuggestionProviderResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((action): action is Record<string, unknown> => typeof action === "object" && action !== null)
    .filter((action) => typeof action.title === "string" && action.title.trim().length > 0)
    .map((action) => ({
      title: String(action.title),
      kind: typeof action.kind === "string" ? action.kind : undefined,
      diagnostics: Array.isArray(action.diagnostics) ? [] : undefined,
      isPreferred: typeof action.isPreferred === "boolean" ? action.isPreferred : undefined,
      editAvailable: action.edit !== undefined,
      commandAvailable: action.command !== undefined,
    }));
}

export async function suggestLspCodeActions(
  request: LspSuggestCodeActionsRequest = {},
): Promise<LspToolResult<LspSuggestCodeActionsOutput>> {
  const toolId = lspSuggestCodeActionsDescriptor.toolId;
  const target = normalizeTarget(request.target);

  if (target === undefined) {
    return createLspToolFailure(
      toolId,
      isBlank(request.target?.filePath) ? "MISSING_FILE_PATH" : "INVALID_POSITION",
      isBlank(request.target?.filePath)
        ? "suggest code actions requires target.filePath"
        : "suggest code actions requires a valid non-negative target.range",
      "input",
      request.context,
      request.target?.filePath,
    );
  }

  const scopeFailure = ensureLspToolScope(toolId, scopeProbe(target), request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const only = normalizeOnly(request.only);
  const diagnostics = normalizeDiagnostics(request.diagnostics);
  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.suggestCodeActions",
        target,
        only,
        diagnostics,
        actions: Object.freeze([]),
        dryRun: true,
        providerCalled: false,
        appliesChanges: false,
        permissionsRequired: lspSuggestCodeActionsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.suggestCodeActions.dryRun", request.context, target.filePath, {
          diagnosticCount: diagnostics.length,
          only,
        }),
      ],
      events: ["basicTool.lsp.suggestCodeActions.dryRun"],
    };
  }

  try {
    const actions =
      request.provider !== undefined
        ? await request.provider(target, request.context ?? {}, diagnostics, only)
        : normalizeProviderActions(
            await requestTextDocumentWithLspRuntime(
              {
                filePath: target.filePath,
                line: target.range.start.line,
                character: target.range.start.character,
                languageId: target.languageId,
              },
              {
                ...request.runtime,
                workspaceRoot: request.runtime?.workspaceRoot ?? request.context?.workspaceRoot,
                method: "textDocument/codeAction",
                params: {
                  range: target.range,
                  context: {
                    diagnostics: [],
                    only,
                  },
                },
              },
            ),
          );

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.suggestCodeActions",
        target,
        only,
        diagnostics,
        actions: Object.freeze([...actions].map((action) => ({ ...action, source: "provider" as const }))),
        dryRun: false,
        providerCalled: true,
        appliesChanges: false,
        permissionsRequired: lspSuggestCodeActionsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.suggestCodeActions.provider", request.context, target.filePath, {
          diagnosticCount: diagnostics.length,
          actionCount: actions.length,
          only,
        }),
      ],
      events: ["basicTool.lsp.suggestCodeActions.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "suggest code actions provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
