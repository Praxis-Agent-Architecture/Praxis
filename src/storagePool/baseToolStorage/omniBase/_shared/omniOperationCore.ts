/*
 * Shared omni operation core.
 *
 * omniBase owns the model-callable contract. Runtime/modelAdapter owns media bytes,
 * artifact references, provider lowering, uploads, native codecs, and capability routing.
 */

import type { OmniCoreResult } from './baseToolAdapter.js';

export type OmniOperationGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type OmniOperationContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: OmniOperationGate;
  allowedInputRoots?: readonly string[];
  allowedOutputRoots?: readonly string[];
  grantedPermissions?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniOperationGate;
  governance?: OmniOperationGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniOperationRequest = {
  target?: unknown;
  context?: unknown;
  provider?: OmniOperationProvider;
};

export type OmniOperationProviderRequest = {
  operation: string;
  inputArtifactId?: string;
  parameters: Readonly<Record<string, unknown>>;
};

export type OmniOperationProviderResult = {
  artifactId: string;
  mimeType?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type OmniOperationProvider = (
  request: OmniOperationProviderRequest,
) => Promise<OmniOperationProviderResult> | OmniOperationProviderResult;

export type OmniOperationDependencyProfile = {
  nativeBinaryRequired: false;
  runtimeOwnsPackageLoading: true;
  packageProfile: string;
  packages: Readonly<Record<string, string>>;
};

export type OmniOperationConfig = {
  toolId: string;
  capability: string;
  route: string;
  mediaKind: 'audio' | 'image' | 'video';
  action: string;
  outputResource: 'audio' | 'image' | 'video' | 'text';
  permissionsRequired: readonly string[];
  requiresInput: boolean;
  requiresOutput: boolean;
  requiresPrompt: boolean;
  unsafeSideEffects: boolean;
  runtimeOperation: string;
  dependencyProfile: OmniOperationDependencyProfile;
};

export type OmniOperationDescriptor = {
  toolId: string;
  capability: string;
  route: string;
  defaultDryRun: true;
  tapOwnsApproval: true;
  permissionsRequired: readonly string[];
  runtimeEntry: 'BaseToolExecutorPort.omni.transformMedia';
  runtimeOwnsMaterial: true;
  baseToolOwnsProviderBodyLowering: false;
  dependencyProfile: OmniOperationDependencyProfile;
};

export type OmniOperationAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniOperationOutput = {
  kind: string;
  target: Readonly<Record<string, unknown>>;
  dispatch: 'dry-run' | 'runtime-omni';
  dryRun: boolean;
  providerCalled: boolean;
  executionBlocked: boolean;
  unsafeSideEffects: boolean;
  permissionsRequired: readonly string[];
  requiresTapApproval: true;
  runtimeEntry: {
    port: 'BaseToolExecutorPort.omni.transformMedia';
    operation: string;
    runtimeOwnsMaterial: true;
    baseToolOwnsProviderBodyLowering: false;
  };
  operationEnvelope: {
    mediaKind: 'audio' | 'image' | 'video';
    action: string;
    outputResource: 'audio' | 'image' | 'video' | 'text';
    plannedOnly: boolean;
    materialized: boolean;
    artifactId?: string;
    mimeType?: string;
  };
  dependencyProfile: OmniOperationDependencyProfile;
  providerMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniOperationResult = OmniCoreResult<OmniOperationOutput>;

export function createOmniOperationDescriptor(config: OmniOperationConfig): OmniOperationDescriptor {
  return {
    toolId: config.toolId,
    capability: config.capability,
    route: config.route,
    defaultDryRun: true,
    tapOwnsApproval: true,
    permissionsRequired: config.permissionsRequired,
    runtimeEntry: 'BaseToolExecutorPort.omni.transformMedia',
    runtimeOwnsMaterial: true,
    baseToolOwnsProviderBodyLowering: false,
    dependencyProfile: config.dependencyProfile,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOperationResult(value: unknown): value is OmniOperationResult {
  return isRecord(value) && typeof value.ok === 'boolean' && typeof value.toolId === 'string' && Array.isArray(value.events);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function cleanList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const cleaned: string[] = [];
  for (const item of value) {
    const text = cleanString(item);
    if (text === undefined) return undefined;
    if (!cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

function cleanGate(value: unknown): OmniOperationGate | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const gate: OmniOperationGate = {};
  if (typeof value.accepted === 'boolean') gate.accepted = value.accepted;
  if (typeof value.allowed === 'boolean') gate.allowed = value.allowed;
  const reason = cleanString(value.reason);
  if (reason !== undefined) gate.reason = reason;
  return gate;
}

function normalizeContext(value: unknown, config: OmniOperationConfig): OmniOperationContext | OmniOperationResult {
  if (value === undefined) return {};
  if (!isRecord(value)) return failure(config, 'INVALID_CONTEXT', config.toolId + ' context must be an object', 'input');

  const allowedInputRoots = cleanList(value.allowedInputRoots);
  const allowedOutputRoots = cleanList(value.allowedOutputRoots);
  const grantedPermissions = cleanList(value.grantedPermissions);
  const requestedScopes = cleanList(value.requestedScopes);
  const allowedScopes = cleanList(value.allowedScopes);
  const guard = cleanGate(value.guard);
  const contract = cleanGate(value.contract);
  const governance = cleanGate(value.governance);

  if (
    (value.allowedInputRoots !== undefined && allowedInputRoots === undefined) ||
    (value.allowedOutputRoots !== undefined && allowedOutputRoots === undefined) ||
    (value.grantedPermissions !== undefined && grantedPermissions === undefined) ||
    (value.requestedScopes !== undefined && requestedScopes === undefined) ||
    (value.allowedScopes !== undefined && allowedScopes === undefined) ||
    (value.guard !== undefined && guard === undefined) ||
    (value.contract !== undefined && contract === undefined) ||
    (value.governance !== undefined && governance === undefined)
  ) {
    return failure(config, 'INVALID_CONTEXT', config.toolId + ' context contains invalid governance metadata', 'input');
  }

  return {
    runtimeId: cleanString(value.runtimeId),
    sessionId: cleanString(value.sessionId),
    invocationId: cleanString(value.invocationId),
    dryRun: typeof value.dryRun === 'boolean' ? value.dryRun : undefined,
    guard,
    allowedInputRoots,
    allowedOutputRoots,
    grantedPermissions,
    requestedScopes,
    allowedScopes,
    contract,
    governance,
    auditMetadata: isRecord(value.auditMetadata) ? value.auditMetadata : undefined,
  };
}

function normalizeTarget(value: unknown, config: OmniOperationConfig): Readonly<Record<string, unknown>> | OmniOperationResult {
  if (value === undefined) return failure(config, 'MISSING_TARGET', config.toolId + ' requires target', 'input');
  if (!isRecord(value)) return failure(config, 'INVALID_TARGET', config.toolId + ' target must be an object', 'input');

  const target: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) target[key] = item;
  }

  const prompt = cleanString(target.prompt);
  if (config.requiresPrompt && prompt === undefined) {
    return failure(config, 'MISSING_PROMPT', config.toolId + ' requires target.prompt', 'input');
  }
  if (prompt !== undefined) target.prompt = prompt;

  const inputPath = cleanString(target.inputPath) ?? cleanString(target.audioPath) ?? cleanString(target.imagePath) ?? cleanString(target.videoPath);
  const inputRef = cleanString(target.inputRef) ?? cleanString(target.inputArtifactId) ?? cleanString(target.audioRef) ?? cleanString(target.imageRef) ?? cleanString(target.videoRef);
  if (config.requiresInput && inputPath === undefined && inputRef === undefined) {
    return failure(config, 'MISSING_INPUT_TARGET', config.toolId + ' requires an input path or artifact ref', 'input');
  }
  if (inputPath !== undefined) target.inputPath = inputPath;
  if (inputRef !== undefined) target.inputRef = inputRef;

  const outputPath = cleanString(target.outputPath);
  const outputRef = cleanString(target.outputRef) ?? cleanString(target.outputArtifactId);
  if (config.requiresOutput && outputPath === undefined && outputRef === undefined) {
    return failure(config, 'MISSING_OUTPUT_TARGET', config.toolId + ' requires target.outputPath or target.outputRef', 'input');
  }
  if (outputPath !== undefined) target.outputPath = outputPath;
  if (outputRef !== undefined) target.outputRef = outputRef;

  const targetFormat = cleanString(target.targetFormat) ?? cleanString(target.format) ?? cleanString(target.mimeType);
  if (targetFormat !== undefined) target.targetFormat = targetFormat;

  const maxBytes = cleanNumber(target.maxBytes);
  if (target.maxBytes !== undefined && maxBytes === undefined) {
    return failure(config, 'INVALID_MAX_BYTES', config.toolId + ' target.maxBytes must be a finite number', 'input');
  }
  if (maxBytes !== undefined) target.maxBytes = maxBytes;

  const durationSeconds = cleanNumber(target.durationSeconds);
  if (target.durationSeconds !== undefined && (durationSeconds === undefined || durationSeconds <= 0)) {
    return failure(config, 'INVALID_DURATION', config.toolId + ' target.durationSeconds must be a positive finite number', 'input');
  }
  if (durationSeconds !== undefined) target.durationSeconds = durationSeconds;

  return target;
}

function invocationId(config: OmniOperationConfig, context: OmniOperationContext): string {
  return context.invocationId ?? config.toolId + ':dry-run';
}

function auditEvent(
  config: OmniOperationConfig,
  context: OmniOperationContext | undefined,
  type: string,
  metadata?: Readonly<Record<string, unknown>>,
): OmniOperationAuditEvent {
  return {
    type,
    toolId: config.toolId,
    invocationId: invocationId(config, context ?? {}),
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(config: OmniOperationConfig, code: string, message: string, boundary: string): OmniOperationResult {
  return {
    ok: false,
    toolId: config.toolId,
    error: { code, message },
    events: [config.toolId + ':' + boundary + ':rejected:' + code],
  };
}

function gateRejected(gate: OmniOperationGate | undefined): boolean {
  return gate?.accepted === false || gate?.allowed === false;
}

function gateAccepted(gate: OmniOperationGate | undefined): boolean {
  return gate?.accepted === true || gate?.allowed === true;
}

function withinRoots(value: string, roots: readonly string[] | undefined): boolean {
  if (roots === undefined || roots.length === 0) return true;
  return roots.some((root) => value === root || value.startsWith(root.endsWith('/') ? root : root + '/'));
}

function governanceCheck(
  config: OmniOperationConfig,
  target: Readonly<Record<string, unknown>>,
  context: OmniOperationContext,
  dryRun: boolean,
): OmniOperationResult | undefined {
  const inputPath = cleanString(target.inputPath);
  const outputPath = cleanString(target.outputPath);

  if (inputPath !== undefined && !withinRoots(inputPath, context.allowedInputRoots)) {
    return failure(config, 'INPUT_PATH_OUT_OF_SCOPE', config.toolId + ' input path is outside allowed roots', 'scope');
  }
  if (outputPath !== undefined && !withinRoots(outputPath, context.allowedOutputRoots)) {
    return failure(config, 'OUTPUT_PATH_OUT_OF_SCOPE', config.toolId + ' output path is outside allowed roots', 'scope');
  }
  if (context.grantedPermissions !== undefined) {
    const missing = config.permissionsRequired.filter((permission) => !context.grantedPermissions?.includes(permission));
    if (missing.length > 0) {
      return failure(config, 'PERMISSION_DENIED', config.toolId + ' missing required permission: ' + missing.join(', '), 'permission');
    }
  }
  if (context.requestedScopes !== undefined && context.allowedScopes !== undefined) {
    const denied = context.requestedScopes.filter((scope) => !context.allowedScopes?.includes(scope));
    if (denied.length > 0) {
      return failure(config, 'SCOPE_DENIED', config.toolId + ' requested scope is not allowed: ' + denied.join(', '), 'scope');
    }
  }
  if (gateRejected(context.contract)) {
    return failure(config, 'CONTRACT_REJECTED', context.contract?.reason ?? config.toolId + ' contract rejected the request', 'contract');
  }
  if (gateRejected(context.governance)) {
    return failure(config, 'GOVERNANCE_REJECTED', context.governance?.reason ?? config.toolId + ' governance rejected the request', 'governance');
  }
  if (!dryRun && !gateAccepted(context.guard)) {
    return failure(config, 'GOVERNANCE_REJECTED', config.toolId + ' live omni execution requires an accepted runtime guard', 'governance');
  }
  return undefined;
}

function buildOutput(
  config: OmniOperationConfig,
  target: Readonly<Record<string, unknown>>,
  dryRun: boolean,
  artifact?: OmniOperationProviderResult,
): OmniOperationOutput {
  return {
    kind: 'agentCore.basicTool.' + config.toolId,
    target,
    dispatch: dryRun ? 'dry-run' : 'runtime-omni',
    dryRun,
    providerCalled: !dryRun,
    executionBlocked: dryRun,
    unsafeSideEffects: config.unsafeSideEffects,
    permissionsRequired: config.permissionsRequired,
    requiresTapApproval: true,
    runtimeEntry: {
      port: 'BaseToolExecutorPort.omni.transformMedia',
      operation: config.runtimeOperation,
      runtimeOwnsMaterial: true,
      baseToolOwnsProviderBodyLowering: false,
    },
    operationEnvelope: {
      mediaKind: config.mediaKind,
      action: config.action,
      outputResource: config.outputResource,
      plannedOnly: dryRun,
      materialized: artifact !== undefined,
      artifactId: artifact?.artifactId,
      mimeType: artifact?.mimeType,
    },
    dependencyProfile: config.dependencyProfile,
    providerMetadata: artifact?.metadata,
  };
}

export async function executeOmniOperationCore(config: OmniOperationConfig, request: OmniOperationRequest = {}): Promise<OmniOperationResult> {
  const context = normalizeContext(request.context, config);
  if (isOperationResult(context)) return context;

  const target = normalizeTarget(request.target, config);
  if (isOperationResult(target)) return target;

  const dryRun = context.dryRun !== false;
  const governanceFailure = governanceCheck(config, target, context, dryRun);
  if (governanceFailure !== undefined) return governanceFailure;

  if (dryRun) {
    return {
      ok: true,
      toolId: config.toolId,
      output: buildOutput(config, target, true),
      audit: [auditEvent(config, context, 'omni.operation.planned', { action: config.action })],
      events: [config.toolId + ':planned'],
    };
  }

  if (request.provider === undefined) {
    return failure(config, 'PROVIDER_UNAVAILABLE', config.toolId + ' requires runtime executor.omni.transformMedia for live execution', 'provider');
  }

  try {
    const inputArtifactId = cleanString(target.inputRef);
    const artifact = await request.provider({
      operation: config.runtimeOperation,
      inputArtifactId,
      parameters: {
        ...target,
        runtimeId: context.runtimeId,
        sessionId: context.sessionId,
        invocationId: invocationId(config, context),
        auditMetadata: context.auditMetadata ?? {},
      },
    });
    if (!isRecord(artifact) || cleanString(artifact.artifactId) === undefined) {
      return failure(config, 'PROVIDER_REJECTED', config.toolId + ' provider returned an invalid artifact envelope', 'provider');
    }
    return {
      ok: true,
      toolId: config.toolId,
      output: buildOutput(config, target, false, artifact),
      audit: [auditEvent(config, context, 'omni.operation.executed', { action: config.action })],
      events: [config.toolId + ':runtime-omni:executed'],
    };
  } catch {
    return failure(config, 'PROVIDER_REJECTED', config.toolId + ' runtime provider rejected the request', 'provider');
  }
}

export function createOmniOperationPlanner(config: OmniOperationConfig) {
  return (request: OmniOperationRequest = {}) =>
    executeOmniOperationCore(config, {
      ...request,
      context:
        request.context === undefined
          ? { dryRun: true }
          : isRecord(request.context)
            ? { ...request.context, dryRun: true }
            : request.context,
    });
}
