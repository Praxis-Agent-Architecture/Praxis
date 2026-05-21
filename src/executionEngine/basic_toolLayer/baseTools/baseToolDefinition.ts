/*
 * Compatibility definition contract for runtime.execEngine while BaseTool
 * semantics are being rewritten under src/toolBase.
 */

import type { BaseToolExecutorPort } from "./baseToolExecutorPort.js";

export type BaseToolFamily =
  | "code"
  | "shell"
  | "git"
  | "mcp"
  | "computeruse"
  | "office"
  | "omni"
  | "search"
  | "skill"
  | "custom";

export type BaseToolRiskLevel = "safe" | "read" | "write" | "network" | "execute" | "dangerous";

export type BaseToolDependencyDeclaration = {
  dependencyId: string;
  kind: "binary" | "package" | "service" | "permission" | "filesystem" | "device" | "network" | "runtime" | "custom";
  required: boolean;
  description: string;
};

export type BaseToolJsonSchema = {
  kind: "json-schema";
  schema: Readonly<Record<string, unknown>>;
};

export type BaseToolInvokeRequest = {
  toolCallId: string;
  runtimeId: string;
  sessionId: string;
  input: Readonly<Record<string, unknown>>;
  executor: BaseToolExecutorPort;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolInvokeResult =
  | {
      ok: true;
      output: unknown;
      events: readonly string[];
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        publicSafe: true;
        metadata?: Readonly<Record<string, unknown>>;
      };
      events: readonly string[];
    };

export type BaseToolDefinition = {
  toolId: string;
  family: BaseToolFamily;
  group: string;
  title: string;
  description?: string;
  riskLevel: BaseToolRiskLevel;
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  inputSchema: BaseToolJsonSchema;
  sourcePath?: string;
  toolSkill: {
    docPath: string;
  };
};

export type BaseToolHandler = {
  definition: BaseToolDefinition;
  invoke(request: BaseToolInvokeRequest): Promise<BaseToolInvokeResult> | BaseToolInvokeResult;
};
