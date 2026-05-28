import type { ToolBaseInvocation, ToolBaseResult } from "./types.js";

export type ToolBaseRuntimeContext = {
  runtimeId: string;
  sessionId?: string;
  workspaceRoot?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolBaseRuntimePortName =
  | "shell"
  | "filesystem"
  | "search"
  | "patch"
  | "web"
  | "plan"
  | "userInteraction"
  | "skill"
  | "mcp"
  | "agent"
  | "context"
  | "approval"
  | "sandbox"
  | "pathPolicy"
  | "networkPolicy"
  | "output"
  | (string & {});

export type ToolBaseRuntimeHandler = (
  invocation: ToolBaseInvocation,
  context: ToolBaseRuntimeContext,
) => Promise<ToolBaseResult> | ToolBaseResult;

export type ToolBaseRuntimePort = {
  name: ToolBaseRuntimePortName;
  ready: boolean;
  handler?: ToolBaseRuntimeHandler;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolBaseRuntimePortRegistry = {
  listPorts(): readonly ToolBaseRuntimePort[];
  getPort(name: ToolBaseRuntimePortName): ToolBaseRuntimePort | undefined;
  hasReadyPorts(names: readonly ToolBaseRuntimePortName[]): boolean;
};

export function createToolBaseRuntimePortRegistry(
  ports: readonly ToolBaseRuntimePort[],
): ToolBaseRuntimePortRegistry {
  const portByName = new Map<ToolBaseRuntimePortName, ToolBaseRuntimePort>(
    ports.map((port) => [port.name, port]),
  );

  return {
    listPorts: () => ports,
    getPort: (name) => portByName.get(name),
    hasReadyPorts: (names) => names.every((name) => portByName.get(name)?.ready === true),
  };
}
