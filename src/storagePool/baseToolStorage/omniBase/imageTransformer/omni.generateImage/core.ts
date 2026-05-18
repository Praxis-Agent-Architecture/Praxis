import { createOmniDependencyProfile } from '../../_shared/omniOperationDependencies.js';
import {
  createOmniOperationDescriptor,
  createOmniOperationPlanner,
  executeOmniOperationCore,
  type OmniOperationConfig,
  type OmniOperationContext,
  type OmniOperationOutput,
  type OmniOperationProvider,
  type OmniOperationProviderRequest,
  type OmniOperationProviderResult,
  type OmniOperationRequest,
  type OmniOperationResult,
} from '../../_shared/omniOperationCore.js';

export type OmniGenerateImageContext = OmniOperationContext;
export type OmniGenerateImageProvider = OmniOperationProvider;
export type OmniGenerateImageProviderRequest = OmniOperationProviderRequest;
export type OmniGenerateImageProviderResult = OmniOperationProviderResult;
export type OmniGenerateImageRequest = OmniOperationRequest;
export type OmniGenerateImageOutput = OmniOperationOutput;
export type OmniGenerateImageResult = OmniOperationResult;

export const omniGenerateImageConfig: OmniOperationConfig = {
  toolId: "omni.generateImage",
  capability: "generate-image",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.imageTransformer",
  mediaKind: "image",
  action: "generate-image",
  outputResource: "image",
  permissionsRequired: ["provider:invoke", "omni:image:generate", "omni:image:write"],
  requiresInput: false,
  requiresOutput: true,
  requiresPrompt: true,
  unsafeSideEffects: true,
  runtimeOperation: "omni.generateImage.generateimage",
  dependencyProfile: createOmniDependencyProfile("image-generation"),
};

export const omniGenerateImageDescriptor = createOmniOperationDescriptor(omniGenerateImageConfig);

export function executeOmniGenerateImageCore(request: OmniGenerateImageRequest = {}): Promise<OmniGenerateImageResult> {
  return executeOmniOperationCore(omniGenerateImageConfig, request);
}

export const planGenerateImage = createOmniOperationPlanner(omniGenerateImageConfig);
