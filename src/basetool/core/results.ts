import type {
  BaseToolDefinition,
  BaseToolExecutorResult,
  BaseToolInvokeResult,
  BaseToolPublicSafeError,
} from "../types.js";

export function okResult(
  definition: BaseToolDefinition,
  output: unknown,
  input: {
    events?: readonly string[];
    metadata?: Readonly<Record<string, unknown>>;
  } = {},
): BaseToolInvokeResult {
  return {
    ok: true,
    toolId: definition.toolId,
    output,
    value: output,
    events: input.events ?? [`basetool.core.${definition.toolId}.completed`],
    metadata: input.metadata,
  };
}

export function errorResult(
  definition: BaseToolDefinition,
  code: string,
  message: string,
  input: {
    retryable?: boolean;
    events?: readonly string[];
    metadata?: Readonly<Record<string, unknown>>;
  } = {},
): BaseToolInvokeResult {
  return {
    ok: false,
    toolId: definition.toolId,
    error: {
      code,
      message,
      publicSafe: true,
      retryable: input.retryable,
    },
    events: input.events ?? [`basetool.core.${definition.toolId}.failed`],
    metadata: input.metadata,
  };
}

export function providerUnavailable(
  definition: BaseToolDefinition,
  portPath: string,
): BaseToolInvokeResult {
  return errorResult(
    definition,
    "PROVIDER_UNAVAILABLE",
    `basetool ${definition.toolId} requires runtime support BaseToolExecutorPort.${portPath}.`,
    {
      retryable: false,
      events: [`basetool.core.${definition.toolId}.providerUnavailable`],
      metadata: { runtimePort: portPath },
    },
  );
}

export async function callRuntimePort(
  definition: BaseToolDefinition,
  executorResult: BaseToolExecutorResult | Promise<BaseToolExecutorResult>,
  input: {
    portPath: string;
    events?: readonly string[];
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<BaseToolInvokeResult> {
  try {
    const result = await executorResult;
    if (result.ok) {
      return okResult(definition, result.output ?? result.value, {
        events: input.events ?? [`basetool.core.${definition.toolId}.runtimePort`],
        metadata: {
          runtimePort: input.portPath,
          ...(result.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
      });
    }
    const error: BaseToolPublicSafeError = result.error ?? {
      code: "RUNTIME_PORT_FAILED",
      message: `Runtime port ${input.portPath} failed without a public-safe error.`,
      publicSafe: true,
    };
    return {
      ok: false,
      toolId: definition.toolId,
      error,
      events: result.events ?? input.events ?? [`basetool.core.${definition.toolId}.runtimePortFailed`],
      metadata: {
        runtimePort: input.portPath,
        ...(result.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    };
  } catch {
    return errorResult(
      definition,
      "RUNTIME_PORT_THROWN",
      `Runtime port ${input.portPath} threw before returning a public-safe result.`,
      {
        retryable: true,
        events: [`basetool.core.${definition.toolId}.runtimePortThrown`],
        metadata: {
          runtimePort: input.portPath,
          ...(input.metadata ?? {}),
        },
      },
    );
  }
}
