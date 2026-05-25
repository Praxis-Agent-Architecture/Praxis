/*
 * Runtime component plane / official component registry.
 * Purpose: map reusable Praxis components to dependency declarations.
 */

import type { DependencyDeclaration } from "../runtime.dependencyPlane/dependencyTypes.js";
import type { RuntimeComponentSpec } from "./componentTypes.js";

function dependency(dependencyId: string, input: Omit<DependencyDeclaration, "dependencyId">): DependencyDeclaration {
  return { dependencyId, ...input };
}

export const officialRuntimeComponents = [
  {
    componentId: "component.sandbox.bubblewrap",
    kind: "sandbox",
    title: "Linux bubblewrap sandbox",
    dependencies: [dependency("dependency.binary.bwrap", { kind: "binary", required: true })],
    fallbackComponentIds: ["component.sandbox.workspaceRollback"],
    supportedPlatforms: ["linux"],
  },
  {
    componentId: "component.sandbox.appleSandbox",
    kind: "sandbox",
    title: "macOS native sandbox",
    dependencies: [dependency("dependency.macos.containerization", { kind: "runtime", required: true })],
    fallbackComponentIds: ["component.sandbox.workspaceRollback"],
    supportedPlatforms: ["darwin"],
  },
  {
    componentId: "component.sandbox.windowsSandbox",
    kind: "sandbox",
    title: "Windows sandbox",
    dependencies: [dependency("dependency.windows.sandbox", { kind: "runtime", required: true })],
    fallbackComponentIds: ["component.sandbox.workspaceRollback"],
    supportedPlatforms: ["win32"],
  },
  {
    componentId: "component.sandbox.workspaceRollback",
    kind: "sandbox",
    title: "Workspace rollback sandbox fallback",
    dependencies: [],
  },
  {
    componentId: "component.lsp.typescript",
    kind: "lsp",
    title: "TypeScript LSP",
    dependencies: [dependency("dependency.lsp.typescriptLanguageServer", { kind: "npm", required: true })],
  },
  {
    componentId: "component.lsp.python",
    kind: "lsp",
    title: "Python LSP",
    dependencies: [dependency("dependency.lsp.pyrightLangserver", { kind: "npm", required: true })],
  },
  {
    componentId: "component.lsp.csharp",
    kind: "lsp",
    title: "C# LSP",
    dependencies: [dependency("dependency.lsp.csharpLs", { kind: "dotnet-tool", required: true })],
  },
  {
    componentId: "component.mcp.echoTestServer",
    kind: "mcp",
    title: "MCP echo test server",
    dependencies: [dependency("dependency.mcp.testServer.echo", { kind: "mcp-server", required: false })],
  },
  {
    componentId: "component.browser.playwright",
    kind: "browser",
    title: "Playwright browser runtime",
    dependencies: [dependency("dependency.npm.playwright", { kind: "npm", required: true })],
  },
  {
    componentId: "component.office.pdf",
    kind: "office",
    title: "PDF office runtime",
    dependencies: [
      dependency("dependency.binary.ffmpeg", { kind: "binary", required: false }),
      dependency("dependency.binary.imagemagick", { kind: "binary", required: false }),
    ],
  },
] as const satisfies readonly RuntimeComponentSpec[];

export type RuntimeComponentRegistry = {
  components: readonly RuntimeComponentSpec[];
};

export function createRuntimeComponentRegistry(input: {
  custom?: readonly RuntimeComponentSpec[];
  official?: readonly RuntimeComponentSpec[];
} = {}): RuntimeComponentRegistry {
  const byId = new Map<string, RuntimeComponentSpec>();
  for (const component of [...(input.official ?? officialRuntimeComponents), ...(input.custom ?? [])]) {
    byId.set(component.componentId, component);
  }
  return { components: [...byId.values()] };
}

export function lookupRuntimeComponent(
  componentId: string,
  registry: RuntimeComponentRegistry = createRuntimeComponentRegistry(),
): RuntimeComponentSpec | undefined {
  return registry.components.find((component) => component.componentId === componentId);
}

export const component = {
  sandbox: {
    bubblewrap(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.sandbox.bubblewrap") ?? officialRuntimeComponents[0];
    },
    workspaceRollback(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.sandbox.workspaceRollback") ?? officialRuntimeComponents[3];
    },
    appleSandbox(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.sandbox.appleSandbox") ?? officialRuntimeComponents[1];
    },
    windowsSandbox(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.sandbox.windowsSandbox") ?? officialRuntimeComponents[2];
    },
  },
  lsp: {
    typescript(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.lsp.typescript") ?? officialRuntimeComponents[4];
    },
    python(): RuntimeComponentSpec {
      return lookupRuntimeComponent("component.lsp.python") ?? officialRuntimeComponents[5];
    },
  },
} as const;
