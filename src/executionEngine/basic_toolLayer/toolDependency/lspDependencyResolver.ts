import type { ToolDependencyDeclaration } from "./dependencyManager.js";

export type LspDependencyProfile = {
  languageId?: string;
  dependencyId: string;
};

export type LspDependencyResolution =
  | { ok: true; profile: LspDependencyProfile; events: readonly string[] }
  | { ok: false; events: readonly string[] };

export function resolveLspDependency(input: {
  toolId: string;
  target?: { filePath?: string; languageId?: string };
  workspaceRoot?: string;
}): LspDependencyResolution {
  const languageId = input.target?.languageId;
  if (languageId === undefined) return { ok: false, events: ["agentCore.basicTool.lspDependency.unresolved"] };
  return {
    ok: true,
    profile: {
      languageId,
      dependencyId: `lsp.server.${languageId}`,
    },
    events: ["agentCore.basicTool.lspDependency.resolved"],
  };
}

export function declarationsFromLspProfile(profile: LspDependencyProfile): readonly ToolDependencyDeclaration[] {
  return [{
    dependencyId: profile.dependencyId,
    kind: "runtime",
    required: true,
    displayName: profile.dependencyId,
  }];
}
