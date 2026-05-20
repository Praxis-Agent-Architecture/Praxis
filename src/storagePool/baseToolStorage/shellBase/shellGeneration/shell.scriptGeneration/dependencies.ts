import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import {
  optionalRecordField,
  optionalStringArrayField,
  optionalStringField,
  requireBooleanField,
  requireLiteralField,
  requireNumberField,
  requireRecordField,
  requireShellGenerationExecutorOutput,
  requireStringArrayField,
  requireStringField,
  shellGenerationInputEnvelope,
  withShellGenerationProviderFlags,
} from "../_shared/hostExecutorProvider.js";
import type { ShellScriptGenerationOutput, ShellScriptGenerationRequest, ShellScriptGenerationResult, ShellScriptGenerationTarget } from "./core.js";

export type ShellScriptGenerationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type ShellScriptGenerationProvider = (
  request: ShellScriptGenerationRequest,
) => ShellScriptGenerationResult | Promise<ShellScriptGenerationResult>;

export type ShellScriptGenerationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: ShellScriptGenerationProvider;
};

export type ShellScriptGenerationProviderPractice = ShellProviderPracticeMetadata<
  ShellScriptGenerationPracticeProviderName,
  ShellScriptGenerationProvider,
  ShellScriptGenerationDependencies
>;

export const shellScriptGenerationDependencyDeclarations = [
  {
    dependencyId: "runtime.generationPlane.shellScriptPolicy",
    kind: "permission",
    required: true,
    description: "Runtime permission hint allowing guarded shell script generation without executing a process",
  },
  {
    dependencyId: "runtime.generationPlane.shellScriptProvider",
    kind: "runtime",
    required: false,
    description: "Optional runtime provider exposed through BaseToolExecutorPort.shell.generateScript",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

function normalizeShellScriptTarget(output: Readonly<Record<string, unknown>>): ShellScriptGenerationTarget {
  const environment = optionalRecordField(output, "environment");
  const normalizedEnvironment: Record<string, string> = {};
  if (environment !== undefined) {
    for (const [key, value] of Object.entries(environment)) {
      if (typeof value !== "string") {
        throw new Error("Shell generation executor returned invalid script environment");
      }
      normalizedEnvironment[key] = value;
    }
  }

  return {
    scriptName: optionalStringField(output, "scriptName"),
    shell: requireLiteralField(output, "shell", ["sh", "bash", "zsh"]),
    workingDirectory: optionalStringField(output, "workingDirectory"),
    commands: requireStringArrayField(output, "commands"),
    environment: environment === undefined ? undefined : normalizedEnvironment,
    notes: optionalStringArrayField(output, "notes"),
  };
}

export function normalizeShellScriptGenerationOutput(output: Readonly<Record<string, unknown>>): ShellScriptGenerationOutput {
  const flagged = withShellGenerationProviderFlags(output);
  if (!requireBooleanField(flagged, "executionBlocked") || requireBooleanField(flagged, "unsafeSideEffects")) {
    throw new Error("Shell generation executor returned unsafe script generation flags");
  }
  return {
    kind: requireLiteralField(flagged, "kind", ["agentCore.basicTool.shell.scriptGeneration"]),
    target: normalizeShellScriptTarget(requireRecordField(flagged, "target")),
    script: requireStringField(flagged, "script", { nonEmpty: true }),
    commandPreview: requireStringArrayField(flagged, "commandPreview"),
    lineCount: requireNumberField(flagged, "lineCount"),
    requiredPermission: requireLiteralField(flagged, "requiredPermission", ["shell:script:generate"]),
    requiresTapApproval: requireBooleanField(flagged, "requiresTapApproval"),
    dryRun: requireBooleanField(flagged, "dryRun"),
    providerCalled: requireBooleanField(flagged, "providerCalled"),
    executionBlocked: true,
    unsafeSideEffects: false,
  };
}

export function createHostExecutorShellScriptGenerationProvider(
  executor: BaseToolExecutorPort | undefined,
): ShellScriptGenerationProvider | undefined {
  const generateScript = executor?.shell?.generateScript;
  if (generateScript === undefined) {
    return undefined;
  }

  return async (request) => {
    const result = await generateScript(shellGenerationInputEnvelope(request));
    const output = requireShellGenerationExecutorOutput(result);
    return {
      ok: true,
      toolId: "shell.scriptGeneration",
      output: normalizeShellScriptGenerationOutput(output),
      audit: [],
      events: ["basicTool.shell.scriptGeneration.providerCalled"],
    };
  };
}
