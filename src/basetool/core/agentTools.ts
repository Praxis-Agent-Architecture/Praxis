import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort, errorResult } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, recordField, requiredStringField, stringField } from "./validation.js";

function runtimeSessionId(request: BaseToolInvokeRequest): string | undefined {
  return request.runtime?.sessionId;
}

function sessionIdOrRuntime(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
  explicitSessionId: string | undefined,
  fieldName: string,
): BaseToolInvokeResult | string {
  const sessionId = explicitSessionId ?? runtimeSessionId(request);
  if (sessionId !== undefined && sessionId.trim().length > 0) return sessionId;
  return errorResult(
    definition,
    "MISSING_RUNTIME_SESSION",
    `Field '${fieldName}' is required when the runtime request has no sessionId.`,
  );
}

function booleanField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
  key: string,
): BaseToolInvokeResult | boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return errorResult(definition, "INVALID_FIELD_TYPE", `Field '${key}' must be a boolean.`);
}

function limitField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
): BaseToolInvokeResult | number | undefined {
  const limit = numberField(definition, input, "limit");
  if (!limit.ok) return limit.result;
  if (limit.value === undefined) return undefined;
  if (!Number.isInteger(limit.value) || limit.value < 0) {
    return errorResult(definition, "INVALID_FIELD_VALUE", "Field 'limit' must be a non-negative integer.");
  }
  return limit.value;
}

function partsField(
  definition: BaseToolDefinition,
  input: Record<string, unknown>,
): BaseToolInvokeResult | readonly Record<string, unknown>[] | undefined {
  const value = input.parts;
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value)
    || !value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item) && typeof (item as { type?: unknown }).type === "string")
  ) {
    return {
      ok: false,
      toolId: definition.toolId,
      error: {
        code: "INVALID_FIELD_TYPE",
        message: "Field 'parts' must be an array of typed message part objects.",
        publicSafe: true,
      },
      events: [`basetool.core.${definition.toolId}.failed`],
    };
  }
  return value as readonly Record<string, unknown>[];
}

export async function invokeAgentSpawnCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const task = requiredStringField(definition, input.value, "task", { minLength: 1 });
  if (!task.ok) return task.result;
  const requesterSessionId = stringField(definition, input.value, "requesterSessionId", { minLength: 1 });
  if (!requesterSessionId.ok) return requesterSessionId.result;
  const agentDefinitionId = stringField(definition, input.value, "agentDefinitionId", { minLength: 1 });
  if (!agentDefinitionId.ok) return agentDefinitionId.result;
  const name = stringField(definition, input.value, "name");
  if (!name.ok) return name.result;
  const description = stringField(definition, input.value, "description");
  if (!description.ok) return description.result;
  const model = stringField(definition, input.value, "model");
  if (!model.ok) return model.result;
  const appendPrompt = stringField(definition, input.value, "appendPrompt");
  if (!appendPrompt.ok) return appendPrompt.result;
  const workingDirectory = stringField(definition, input.value, "workingDirectory");
  if (!workingDirectory.ok) return workingDirectory.result;
  const lifecycle = stringField(definition, input.value, "lifecycle", { allowed: ["oneshot", "persistent"] });
  if (!lifecycle.ok) return lifecycle.result;
  const metadata = recordField(definition, input.value, "metadata");
  if (!metadata.ok) return metadata.result;
  const resolvedRequesterSessionId = sessionIdOrRuntime(definition, request, requesterSessionId.value, "requesterSessionId");
  if (typeof resolvedRequesterSessionId !== "string") return resolvedRequesterSessionId;
  const spawn = namespaceMethod(definition, request, "agent", "spawn");
  if (!spawn.ok) return spawn.result;

  return callRuntimePort(definition, spawn.value(compactRecord({
    requesterSessionId: resolvedRequesterSessionId,
    agentDefinitionId: agentDefinitionId.value,
    name: name.value,
    description: description.value,
    model: model.value,
    appendPrompt: appendPrompt.value,
    workingDirectory: workingDirectory.value,
    lifecycle: lifecycle.value,
    task: task.value,
    metadata: metadata.value,
  })), {
    portPath: "agent.spawn",
    metadata: { requesterSessionId: resolvedRequesterSessionId },
  });
}

export async function invokeAgentMessageCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const toSessionId = requiredStringField(definition, input.value, "toSessionId", { minLength: 1 });
  if (!toSessionId.ok) return toSessionId.result;
  const fromSessionId = stringField(definition, input.value, "fromSessionId", { minLength: 1 });
  if (!fromSessionId.ok) return fromSessionId.result;
  const text = stringField(definition, input.value, "text");
  if (!text.ok) return text.result;
  const intent = stringField(definition, input.value, "intent", { allowed: ["queue", "steer"] });
  if (!intent.ok) return intent.result;
  const replyToMessageId = stringField(definition, input.value, "replyToMessageId", { minLength: 1 });
  if (!replyToMessageId.ok) return replyToMessageId.result;
  const metadata = recordField(definition, input.value, "metadata");
  if (!metadata.ok) return metadata.result;
  const parts = partsField(definition, input.value);
  if (parts !== undefined && !Array.isArray(parts)) return parts as BaseToolInvokeResult;
  const resolvedFromSessionId = sessionIdOrRuntime(definition, request, fromSessionId.value, "fromSessionId");
  if (typeof resolvedFromSessionId !== "string") return resolvedFromSessionId;
  const message = namespaceMethod(definition, request, "agent", "message");
  if (!message.ok) return message.result;

  return callRuntimePort(definition, message.value(compactRecord({
    fromSessionId: resolvedFromSessionId,
    toSessionId: toSessionId.value,
    text: text.value,
    parts,
    intent: intent.value ?? "queue",
    replyToMessageId: replyToMessageId.value,
    metadata: metadata.value,
  })), {
    portPath: "agent.message",
    metadata: compactRecord({ toSessionId: toSessionId.value, intent: intent.value ?? "queue" }),
  });
}

export async function invokeAgentInboxCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const sessionId = stringField(definition, input.value, "sessionId", { minLength: 1 });
  if (!sessionId.ok) return sessionId.result;
  const limit = limitField(definition, input.value);
  if (typeof limit === "object") return limit;
  const unreadOnly = booleanField(definition, input.value, "unreadOnly");
  if (typeof unreadOnly === "object") return unreadOnly;
  const resolvedSessionId = sessionIdOrRuntime(definition, request, sessionId.value, "sessionId");
  if (typeof resolvedSessionId !== "string") return resolvedSessionId;
  const inbox = namespaceMethod(definition, request, "agent", "inbox");
  if (!inbox.ok) return inbox.result;
  return callRuntimePort(definition, inbox.value(compactRecord({
    sessionId: resolvedSessionId,
    limit,
    unreadOnly: unreadOnly === false ? false : true,
  })), {
    portPath: "agent.inbox",
  });
}

export async function invokeAgentListCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const projectId = stringField(definition, input.value, "projectId");
  if (!projectId.ok) return projectId.result;
  const includeInactive = booleanField(definition, input.value, "includeInactive");
  if (typeof includeInactive === "object") return includeInactive;
  const list = namespaceMethod(definition, request, "agent", "list");
  if (!list.ok) return list.result;
  return callRuntimePort(definition, list.value(compactRecord({
    projectId: projectId.value,
    includeInactive: includeInactive === true,
  })), {
    portPath: "agent.list",
  });
}

export async function invokeAgentInspectCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const sessionId = requiredStringField(definition, input.value, "sessionId", { minLength: 1 });
  if (!sessionId.ok) return sessionId.result;
  const inspect = namespaceMethod(definition, request, "agent", "inspect");
  if (!inspect.ok) return inspect.result;
  return callRuntimePort(definition, inspect.value({ sessionId: sessionId.value }), {
    portPath: "agent.inspect",
    metadata: { sessionId: sessionId.value },
  });
}

export async function invokeAgentWaitCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const messageId = requiredStringField(definition, input.value, "messageId", { minLength: 1 });
  if (!messageId.ok) return messageId.result;
  const requesterSessionId = stringField(definition, input.value, "requesterSessionId", { minLength: 1 });
  if (!requesterSessionId.ok) return requesterSessionId.result;
  const resolvedRequesterSessionId = sessionIdOrRuntime(definition, request, requesterSessionId.value, "requesterSessionId");
  if (typeof resolvedRequesterSessionId !== "string") return resolvedRequesterSessionId;
  const wait = namespaceMethod(definition, request, "agent", "wait");
  if (!wait.ok) return wait.result;
  return callRuntimePort(definition, wait.value(compactRecord({
    requesterSessionId: resolvedRequesterSessionId,
    messageId: messageId.value,
  })), {
    portPath: "agent.wait",
    metadata: { messageId: messageId.value },
  });
}

export async function invokeAgentStopCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const sessionId = requiredStringField(definition, input.value, "sessionId", { minLength: 1 });
  if (!sessionId.ok) return sessionId.result;
  const reason = stringField(definition, input.value, "reason");
  if (!reason.ok) return reason.result;
  const stop = namespaceMethod(definition, request, "agent", "stop");
  if (!stop.ok) return stop.result;
  return callRuntimePort(definition, stop.value(compactRecord({ sessionId: sessionId.value, reason: reason.value })), {
    portPath: "agent.stop",
    metadata: { sessionId: sessionId.value },
  });
}

export async function invokeAgentKillCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const sessionId = requiredStringField(definition, input.value, "sessionId", { minLength: 1 });
  if (!sessionId.ok) return sessionId.result;
  const reason = stringField(definition, input.value, "reason");
  if (!reason.ok) return reason.result;
  const kill = namespaceMethod(definition, request, "agent", "kill");
  if (!kill.ok) return kill.result;
  return callRuntimePort(definition, kill.value(compactRecord({ sessionId: sessionId.value, reason: reason.value })), {
    portPath: "agent.kill",
    metadata: { sessionId: sessionId.value },
  });
}
