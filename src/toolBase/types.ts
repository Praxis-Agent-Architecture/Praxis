/*
 * 文件定位：Praxis 新工具层的语义合同。
 * 核心目的：定义模型可见工具、运行时隐藏能力、调用结果和工具 profile 的稳定内部格式。
 * 边界：这里不写 provider wire schema，也不执行真实 shell / 文件 / 网络副作用。
 */

export type ToolBaseLayer = "core" | "agent" | "optional" | "runtime";

export type ToolBaseVisibility = "model" | "deferred" | "runtime" | "disabled";

export type ToolBaseRisk =
  | "safe"
  | "read"
  | "write"
  | "network"
  | "execute"
  | "dangerous";

export type ToolBaseInteraction =
  | "inspect"
  | "mutate"
  | "execute"
  | "delegate"
  | "ask"
  | "govern"
  | "generate";

export type ToolBaseSchema = Readonly<Record<string, unknown>>;

export type ToolBaseId =
  | "shell.run"
  | "file.read"
  | "file.write"
  | "file.edit"
  | "file.search"
  | "patch.apply"
  | "web.search"
  | "web.fetch"
  | "plan.update"
  | "user.ask"
  | "agent.spawn"
  | "agent.message"
  | "agent.wait"
  | "skill.load"
  | "context.load"
  | "mcp.use"
  | "mcp.resources"
  | "lsp.query"
  | "browser.use"
  | "computer.use"
  | "image.view"
  | "image.generate"
  | "audio.transcribe"
  | "media.generate"
  | "memory.use"
  | "repo.inspect"
  | "approval.request"
  | "permission.check"
  | "sandbox.run"
  | "artifact.store"
  | "output.truncate"
  | "process.wait"
  | "process.kill"
  | "secret.resolve"
  | "tool.discover"
  | "tool.describe"
  | (string & {});

export type ToolBaseDefinition = {
  id: ToolBaseId;
  title: string;
  layer: ToolBaseLayer;
  visibility: ToolBaseVisibility;
  risk: ToolBaseRisk;
  interaction: ToolBaseInteraction;
  description: string;
  inputSchema: ToolBaseSchema;
  outputSchema?: ToolBaseSchema;
  aliases?: readonly string[];
  capabilityTags?: readonly string[];
  requiresRuntimePorts?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolBaseProfileName =
  | "minimalCoding"
  | "standardAgent"
  | "extendedAgent"
  | "runtimeOnly"
  | (string & {});

export type ToolBaseProfile = {
  name: ToolBaseProfileName;
  description: string;
  defaultVisibility: ToolBaseVisibility;
  toolIds: readonly ToolBaseId[];
  hiddenToolIds?: readonly ToolBaseId[];
  deferredToolIds?: readonly ToolBaseId[];
};

export type ToolBaseProviderShape =
  | "openai.responses"
  | "openai.chat_completions"
  | "anthropic.messages"
  | "google.generate_content"
  | "bedrock.converse"
  | "openai.compatible_chat"
  | "custom";

export type ToolBaseProviderCapability = {
  shape: ToolBaseProviderShape;
  supportsParallelToolCalls?: boolean;
  supportsStrictJsonSchema?: boolean;
  supportsFreeformToolInput?: boolean;
  maxVisibleTools?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolBaseToolSet = {
  profile: ToolBaseProfileName;
  modelVisible: readonly ToolBaseDefinition[];
  deferred: readonly ToolBaseDefinition[];
  runtimeOnly: readonly ToolBaseDefinition[];
  disabled: readonly ToolBaseDefinition[];
};

export type ToolBaseInvocation = {
  invocationId: string;
  toolId: ToolBaseId;
  input: unknown;
  modelTurnId?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolBaseResult =
  | {
      ok: true;
      invocationId: string;
      toolId: ToolBaseId;
      output: unknown;
      publicSummary?: string;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      ok: false;
      invocationId: string;
      toolId: ToolBaseId;
      error: ToolBasePublicError;
      metadata?: Readonly<Record<string, unknown>>;
    };

export type ToolBasePublicError = {
  code: string;
  message: string;
  retryable: boolean;
  safeForModel: true;
  internalDetailExposed: false;
};
