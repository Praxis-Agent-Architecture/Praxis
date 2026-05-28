import { praxis } from "@praxis-ai/praxis";
import type { ToolSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";

function knownTools(toolIds: readonly string[]): ToolSpec[] {
  return toolIds.map((toolId) => {
    const lookup = praxis.tryBaseToolById(toolId);
    if (!lookup.ok) {
      return praxis.tool(toolId, {
        description: `Unresolved test surface for ${toolId}`,
        metadata: {
          authoringSurface: "example.fullstack.allTestable",
          catalogError: lookup.error.code,
        },
      });
    }
    return lookup.tool;
  });
}

export function createRepoInspectorToolSet(options: NormalizedRepoInspectorOptions): ToolSpec[] {
  if (options.includeAllTestable) {
    return praxis.listBaseToolDeveloperCatalog()
      .map((entry) => praxis.tryBaseToolById(entry.toolId))
      .filter((lookup): lookup is Extract<typeof lookup, { ok: true }> => lookup.ok)
      .map((lookup) => lookup.tool);
  }

  return [
    ...praxis.toolSets.coding.readonly({
      includeSearch: options.mode === "deep",
    }),
    ...(options.includeShell ? praxis.toolSets.shell.safe() : []),
    ...(options.includeSkillAuthoring ? praxis.toolSets.skill.authoring() : []),
    praxis.basetool.extension.skillLoad({
      profileName: "codingCore",
      description: "只读检索本机可用的 skill/context 材料。",
    }),
  ];
}
