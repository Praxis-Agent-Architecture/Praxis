import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { OmniProviderPracticeMetadata } from "../../_shared/baseToolAdapter.js";
import type {
  OmniViewImageProvider,
  OmniViewImageProviderRequest,
  OmniViewImageProviderResult,
} from "./core.js";

export type OmniViewImagePracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type OmniViewImageDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: OmniViewImageProvider;
};

export type OmniViewImageProviderPractice = OmniProviderPracticeMetadata<
  OmniViewImagePracticeProviderName,
  OmniViewImageProvider,
  OmniViewImageDependencies
>;

export const omniViewImageDependencyDeclarations = [
  {
    dependencyId: "runtime.execEngine.omni.transformMedia",
    kind: "runtime",
    required: true,
    description: "Runtime-owned omni media support exposed through BaseToolExecutorPort.omni.transformMedia.",
  },
  {
    dependencyId: "runtime.governancePlane.toolInvocationGrant",
    kind: "permission",
    required: true,
    description: "dryRun:false requires an affirmative runtime guard before provider dispatch.",
  },
  {
    dependencyId: "runtime.modelAdapter.mediaLowering",
    kind: "runtime",
    required: false,
    description: "Runtime/modelAdapter owns provider-specific image bytes, artifact refs, and model input lowering.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createRuntimeOmniViewImageProvider(
  executor: BaseToolExecutorPort | undefined,
): OmniViewImageProvider | undefined {
  const transformMedia = executor?.omni?.transformMedia;
  if (transformMedia === undefined) return undefined;

  return async (request: OmniViewImageProviderRequest): Promise<OmniViewImageProviderResult> => {
    const result = await transformMedia({
      operation: request.operation,
      inputArtifactId: request.target.imageRef,
      parameters: {
        imagePath: request.target.imagePath,
        mediaType: request.target.mediaType,
        detail: request.target.detail,
        maxBytes: request.target.maxBytes,
        runtimeId: request.context.runtimeId,
        sessionId: request.context.sessionId,
        invocationId: request.context.invocationId,
        auditMetadata: request.context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return {
      artifactId: result.output.artifactId,
      mimeType: result.output.mimeType,
      metadata: result.metadata,
    };
  };
}
