/*
 * Transitional built-in handler list.
 *
 * The old generated 176-tool handlers were intentionally removed before the
 * new model-facing tool layer is finalized. Runtime inspection code can still
 * compile against an empty registry instead of pulling the old implementation
 * back into Praxis.
 */

import type { BaseToolDefinition, BaseToolFamily, BaseToolHandler, BaseToolRiskLevel } from "./baseToolDefinition.js";

type SemanticBaseToolInput = {
  toolId: string;
  family: BaseToolFamily;
  group: string;
  title: string;
  riskLevel?: BaseToolRiskLevel;
};

function semanticTool(input: SemanticBaseToolInput): BaseToolHandler {
  const definition: BaseToolDefinition = {
    toolId: input.toolId,
    family: input.family,
    group: input.group,
    title: input.title,
    riskLevel: input.riskLevel ?? "safe",
    permissionHints: [],
    dependencies: [],
    inputSchema: {
      kind: "json-schema",
      schema: {
        type: "object",
        additionalProperties: true,
      },
    },
    sourcePath: `src/toolBase/semantic/${input.toolId}.ts`,
    toolSkill: {
      docPath: `src/toolBase/semantic/${input.toolId}.md`,
    },
  };

  return {
    definition,
    invoke() {
      return {
        ok: false,
        error: {
          code: "SEMANTIC_TOOL_NOT_BOUND",
          message: `BaseTool ${input.toolId} is declared for manifest compatibility but has no rewritten runtime binding yet`,
          publicSafe: true,
        },
        events: ["agentCore.basicTool.semanticTool.notBound"],
      };
    },
  };
}

export const builtinBaseToolHandlers: readonly BaseToolHandler[] = [
  semanticTool({ toolId: "code.read", family: "code", group: "explore", title: "Read code and text files", riskLevel: "read" }),
  semanticTool({ toolId: "code.search_Ripgrep", family: "code", group: "explore", title: "Search workspace with ripgrep", riskLevel: "read" }),
  semanticTool({ toolId: "code.lsp_locateDefinition", family: "code", group: "lsp", title: "Locate symbol definition with LSP", riskLevel: "read" }),
  semanticTool({ toolId: "git.getRepositoryStatus", family: "git", group: "inspection", title: "Inspect git repository status", riskLevel: "read" }),
  semanticTool({ toolId: "git.getWorkingTreeDiff", family: "git", group: "inspection", title: "Inspect git working tree diff", riskLevel: "read" }),
  semanticTool({ toolId: "git.getCommitHistory", family: "git", group: "inspection", title: "Inspect git commit history", riskLevel: "read" }),
  semanticTool({ toolId: "git.showGitObjectDetails", family: "git", group: "inspection", title: "Show git object details", riskLevel: "read" }),
  semanticTool({ toolId: "git.traceLineOwnership", family: "git", group: "inspection", title: "Trace git line ownership", riskLevel: "read" }),
  semanticTool({ toolId: "shell.commandExecution", family: "shell", group: "shellExecution", title: "Run a shell command", riskLevel: "execute" }),
  semanticTool({ toolId: "skill.ripgrep", family: "skill", group: "search", title: "Search installed skills with ripgrep", riskLevel: "read" }),
];
