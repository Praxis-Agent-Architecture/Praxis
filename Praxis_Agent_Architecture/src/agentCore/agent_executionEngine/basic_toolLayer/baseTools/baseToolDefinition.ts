/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具统一契约。
 * 核心目的：定义 203 个内置 baseTools 与 customTool 共用的外壳契约。
 * 边界：这里只定义工具如何被发现、描述、校验和调用，不承载具体工具实现。
 */

import type { BaseToolExecutorPort } from "./baseToolExecutorPort.js";

export type BaseToolRiskLevel = "normal" | "risky" | "dangerous";

export type BaseToolSource = "builtin" | "custom";

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

export type BaseToolDependencyKind =
  | "binary"
  | "runtime"
  | "service"
  | "device"
  | "network"
  | "package"
  | "permission"
  | "filesystem"
  | "custom";

export type BaseToolSchemaLike = {
  kind: "pending-schema" | "json-schema" | "zod-schema" | "custom";
  name?: string;
  schema?: unknown;
};

export type BaseToolSkillReference = {
  docPath: string;
  summary: string;
  riskLevel: BaseToolRiskLevel;
};

export type BaseToolDependencyDeclaration = {
  dependencyId: string;
  kind: BaseToolDependencyKind;
  required: boolean;
  description: string;
};

export type BaseToolStoragePolicy = {
  storesMaterial: boolean;
  storesResult: boolean;
  storesAudit: boolean;
  reusable: boolean;
};

export type BaseToolDefinition<Input = unknown, Output = unknown> = {
  toolId: string;
  source: BaseToolSource;
  family: BaseToolFamily;
  title: string;
  description: string;
  toolSkill: BaseToolSkillReference;
  inputSchema: BaseToolSchemaLike;
  outputSchema: BaseToolSchemaLike;
  riskLevel: BaseToolRiskLevel;
  permissionHints: readonly string[];
  dependencies: readonly BaseToolDependencyDeclaration[];
  storagePolicy: BaseToolStoragePolicy;
  sourcePath?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolInvokeRequest<Input = unknown> = {
  toolCallId: string;
  runtimeId: string;
  sessionId: string;
  input: Input;
  executor: BaseToolExecutorPort;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolInvokeResult<Output = unknown> =
  | {
      ok: true;
      toolId: string;
      output: Output;
      events: readonly string[];
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      toolId: string;
      error: {
        code: string;
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

export type BaseToolHandler<Input = unknown, Output = unknown> = {
  definition: BaseToolDefinition<Input, Output>;
  invoke(request: BaseToolInvokeRequest<Input>): Promise<BaseToolInvokeResult<Output>>;
};

export type BaseToolRegistrationResult =
  | {
      ok: true;
      definition: BaseToolDefinition;
    }
  | {
      ok: false;
      error: {
        code: "MISSING_TOOL_ID" | "DUPLICATE_TOOL_ID" | "INVALID_CUSTOM_TOOL" | "RESERVED_BUILTIN_SOURCE";
        message: string;
        publicSafe: true;
      };
    };

export const baseToolDefinitionDescriptor = {
  contract: "agentCore.basicTool.definition",
  supportsBuiltinTools: true,
  supportsCustomTools: true,
  riskLevels: ["normal", "risky", "dangerous"],
  permissionsAreHints: true,
} as const;
