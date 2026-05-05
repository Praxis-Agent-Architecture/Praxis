import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { ComputerUseProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  MouseEmulationProvider,
  MouseEmulationProviderRequest,
  MouseEmulationProviderResult,
  MouseEmulationProviderStepResult,
  MouseEmulationStep,
} from "./core.js";

export type MouseEmulationPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type MouseEmulationDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: MouseEmulationProvider;
};

export type MouseEmulationProviderPractice = ComputerUseProviderPracticeMetadata<
  MouseEmulationPracticeProviderName,
  MouseEmulationProvider,
  MouseEmulationDependencies
>;

export const mouseEmulationDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.computeruse.locateCursor",
    kind: "runtime",
    required: true,
    description: "Runtime-owned cursor observation support exposed through BaseToolExecutorPort.computeruse.locateCursor.",
  },
  {
    dependencyId: "runtime.execEngine.computeruse.pointerAction",
    kind: "runtime",
    required: true,
    description: "Runtime-owned pointer action support exposed through BaseToolExecutorPort.computeruse.pointerAction.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before pointer sequence dispatch.",
  },
  {
    dependencyId: "runtime.inputController.pointer",
    kind: "runtime",
    required: true,
    description: "Runtime owns OS pointer events, cursor reads, coordinate translation, focus, cleanup, and input policy.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeMouseEmulationProvider(executor: BaseToolExecutorPort | undefined): MouseEmulationProvider | undefined {
  const locateCursor = executor?.computeruse?.locateCursor;
  const pointerAction = executor?.computeruse?.pointerAction;
  if (locateCursor === undefined || pointerAction === undefined) return undefined;

  return async (request: MouseEmulationProviderRequest): Promise<MouseEmulationProviderResult> => {
    const stepResults: MouseEmulationProviderStepResult[] = [];

    for (const [index, step] of request.steps.entries()) {
      if (step.kind === "locate") {
        const result = await locateCursor({
          coordinateSpace: step.coordinateSpace,
          metadata: {
            runtimeId: request.context.runtimeId,
            sessionId: request.context.sessionId,
            invocationId: request.context.invocationId,
            purpose: request.purpose,
            stepIndex: index,
            displayId: step.displayId,
            auditMetadata: request.context.auditMetadata,
          },
        });

        if (!result.ok) {
          throw new Error(result.error.message);
        }

        stepResults.push({
          index,
          kind: "locate",
          position: {
            x: result.output.x,
            y: result.output.y,
            coordinateSpace: result.output.coordinateSpace,
            displayId: step.displayId,
          },
          metadata: result.metadata,
        });
        continue;
      }

      const result = await pointerAction({
        action: step.kind,
        target: pointerTargetForStep(step),
        metadata: {
          runtimeId: request.context.runtimeId,
          sessionId: request.context.sessionId,
          invocationId: request.context.invocationId,
          purpose: request.purpose,
          stepIndex: index,
          auditMetadata: request.context.auditMetadata,
        },
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      stepResults.push({
        index,
        kind: step.kind,
        actionId: result.output.actionId,
        metadata: {
          ...(result.output.metadata ?? {}),
          ...(result.metadata ?? {}),
        },
      });
    }

    return {
      stepResults,
      metadata: {
        stepCount: request.steps.length,
      },
    };
  };
}

function pointerTargetForStep(step: Exclude<MouseEmulationStep, { kind: "locate" }>): Readonly<Record<string, unknown>> {
  if (step.kind === "move") {
    return {
      x: step.target.x,
      y: step.target.y,
      coordinateSpace: step.coordinateSpace,
      displayId: step.displayId,
      windowId: step.windowId,
      durationMs: step.durationMs,
    };
  }

  return {
    button: step.button,
    clickCount: step.clickCount,
    at: step.at,
    coordinateSpace: step.coordinateSpace,
    displayId: step.displayId,
    windowId: step.windowId,
    usesCurrentCursor: step.usesCurrentCursor,
  };
}
