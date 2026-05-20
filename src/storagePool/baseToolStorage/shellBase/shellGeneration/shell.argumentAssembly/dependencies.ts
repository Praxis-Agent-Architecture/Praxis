import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import {
  requireBooleanField,
  requireLiteralField,
  requireRecordArrayField,
  requireShellGenerationExecutorOutput,
  requireStringArrayField,
  requireStringField,
  shellGenerationInputEnvelope,
  withShellGenerationProviderFlags,
} from "../_shared/hostExecutorProvider.js";
import type { ShellArgumentAssemblyOutput, ShellArgumentAssemblyRequest, ShellArgumentAssemblyResult, ShellArgumentToken } from "./core.js";

export type ShellArgumentAssemblyPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellArgumentAssemblyProvider = (
  request: ShellArgumentAssemblyRequest,
) => ShellArgumentAssemblyResult | Promise<ShellArgumentAssemblyResult>;

export type ShellArgumentAssemblyDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellArgumentAssemblyProvider;
};

export type ShellArgumentAssemblyProviderPractice = ShellProviderPracticeMetadata<
  ShellArgumentAssemblyPracticeProviderName,
  ShellArgumentAssemblyProvider,
  ShellArgumentAssemblyDependencies
>;

export const shellArgumentAssemblyDependencyDeclarations = [
  {
    dependencyId: "runtime.generationPlane.shellArgumentPolicy",
    kind: "permission",
    required: true,
    description: "Runtime permission hint allowing shell argv generation without executing a process",
  },
  {
    dependencyId: "runtime.generationPlane.shellArgumentProvider",
    kind: "runtime",
    required: false,
    description: "Optional runtime provider exposed through BaseToolExecutorPort.shell.assembleArguments",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function normalizeShellArgumentAssemblyOutput(output: Readonly<Record<string, unknown>>): ShellArgumentAssemblyOutput {
  const flagged = withShellGenerationProviderFlags(output);
  if (!requireBooleanField(flagged, "executionBlocked") || requireBooleanField(flagged, "unsafeSideEffects")) {
    throw new Error("Shell generation executor returned unsafe argument assembly flags");
  }
  return {
    kind: requireLiteralField(flagged, "kind", ["agentCore.basicTool.shell.argumentAssembly"]),
    executable: requireStringField(flagged, "executable", { nonEmpty: true }),
    argv: requireStringArrayField(flagged, "argv"),
    renderedTokens: requireRecordArrayField(flagged, "renderedTokens").map((token): ShellArgumentToken => ({
      raw: requireStringField(token, "raw"),
      rendered: requireStringField(token, "rendered"),
      sensitive: requireBooleanField(token, "sensitive"),
    })),
    redactedPreview: requireStringArrayField(flagged, "redactedPreview"),
    requiredPermission: requireLiteralField(flagged, "requiredPermission", ["shell:generate"]),
    dryRun: requireBooleanField(flagged, "dryRun"),
    providerCalled: requireBooleanField(flagged, "providerCalled"),
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

export function createHostExecutorShellArgumentAssemblyProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellArgumentAssemblyProvider | undefined {
  const assembleArguments = executor?.shell?.assembleArguments;
  if (assembleArguments === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await assembleArguments(shellGenerationInputEnvelope(request));
    const output = requireShellGenerationExecutorOutput(result);
    return {
      ok: true,
      toolId: "shell.argumentAssembly",
      output: normalizeShellArgumentAssemblyOutput(output),
      audit: [],
      events: ["basicTool.shell.argumentAssembly.providerCalled"],
    };
  };
}
