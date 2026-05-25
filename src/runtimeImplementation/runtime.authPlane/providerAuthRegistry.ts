/*
 * 文件定位：Runtime / authPlane / provider auth registry。
 * 核心目的：把 providerProfile、modelEntry、roleBinding 和 credentialRef 串成单一事实源。
 * 边界：只做声明与解析，不读取 secret、不执行 provider 调用。
 */

import type { CredentialType } from "../../modelAdapter/authProfileLayer/credentialRef.js";
import type { ProviderReasoningConfig } from "../../modelAdapter/providerAccessLayer/providerCarrier.js";
import type { RuntimeAuthProviderKind, RuntimeAuthSecretKind } from "./secretVault.js";

export type RuntimeAuthEndpointShape =
  | "responses"
  | "chat_completions"
  | "messages"
  | "gemini_generate_content"
  | "custom"
  | (string & {});

export type RuntimeAuthRole =
  | "primary"
  | "fallback"
  | "omni"
  | "embedding"
  | "realtime"
  | "batch"
  | (string & {});

export type RuntimeAuthCredentialRef = {
  credentialRefId: string;
  secretId: string;
  provider: RuntimeAuthProviderKind;
  credentialType: CredentialType;
  secretKind: RuntimeAuthSecretKind;
  publicSafe: true;
};

export type RuntimeAuthProviderProfile = {
  profileId: string;
  name: string;
  provider: RuntimeAuthProviderKind;
  providerLabel: string;
  endpointShape: RuntimeAuthEndpointShape;
  baseURL?: string;
  credentialRef: RuntimeAuthCredentialRef;
  authMode: "api_key" | "oauth" | "subscription_contract" | "custom";
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  publicSafe: true;
};

export type RuntimeAuthModelEntry = {
  modelEntryId: string;
  providerProfileRef: string;
  model: string;
  reasoning?: ProviderReasoningConfig;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  capabilityTags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
  testStatus: {
    state: "unknown" | "passed" | "failed";
    checkedAt?: string;
    statusCode?: number;
    publicSafeMessage?: string;
  };
  publicSafe: true;
};

export type RuntimeAuthRoleBinding = {
  role: RuntimeAuthRole;
  providerProfileRef: string;
  modelEntryRef?: string;
  enabled: boolean;
  priority: number;
  metadata?: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeAuthRegistrySnapshot = {
  profiles: readonly RuntimeAuthProviderProfile[];
  modelEntries: readonly RuntimeAuthModelEntry[];
  roleBindings: readonly RuntimeAuthRoleBinding[];
  publicSafe: true;
};

export type RuntimeAuthRegistryErrorCode =
  | "MISSING_PROFILE_ID"
  | "MISSING_PROVIDER"
  | "MISSING_CREDENTIAL_REF"
  | "CREDENTIAL_PROVIDER_MISMATCH"
  | "MISSING_MODEL_ENTRY_ID"
  | "MISSING_MODEL"
  | "MISSING_ROLE"
  | "MISSING_PROFILE_REF"
  | "PROFILE_NOT_FOUND"
  | "MODEL_ENTRY_NOT_FOUND"
  | "MODEL_ENTRY_PROFILE_MISMATCH"
  | "ROLE_BINDING_NOT_FOUND";

export type RuntimeAuthRegistryError = {
  code: RuntimeAuthRegistryErrorCode;
  message: string;
  boundary: "input" | "registry";
  publicSafe: true;
};

export type RuntimeAuthRegistryResult<T> =
  | { ok: true; value: T; events: readonly string[] }
  | { ok: false; error: RuntimeAuthRegistryError; events: readonly string[] };

export type RuntimeAuthRegistry = {
  putProviderProfile(profile: RuntimeAuthProviderProfile): RuntimeAuthProviderProfile;
  putModelEntry(entry: RuntimeAuthModelEntry): RuntimeAuthModelEntry;
  putRoleBinding(binding: RuntimeAuthRoleBinding): RuntimeAuthRoleBinding;
  getProviderProfile(profileRef: string): RuntimeAuthProviderProfile | undefined;
  getModelEntry(modelEntryRef: string): RuntimeAuthModelEntry | undefined;
  selectRole(role: RuntimeAuthRole): RuntimeAuthRegistryResult<{
    profile: RuntimeAuthProviderProfile;
    modelEntry?: RuntimeAuthModelEntry;
    binding: RuntimeAuthRoleBinding;
  }>;
  snapshot(): RuntimeAuthRegistrySnapshot;
};

function nowIso(input?: string): string {
  return input?.trim() || new Date().toISOString();
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type RuntimeAuthProviderProtocol = "openai" | "anthropic" | "gemini" | "custom";

function providerProtocol(provider: RuntimeAuthProviderKind | string | undefined): RuntimeAuthProviderProtocol | undefined {
  const value = provider?.trim().toLowerCase();
  if (value === "openai" || value === "openai-compatible") return "openai";
  if (value === "anthropic" || value === "anthropic-compatible") return "anthropic";
  if (value === "gemini" || value === "deepmind" || value === "google") return "gemini";
  if (value === "custom") return "custom";
  return undefined;
}

function endpointProtocol(endpointShape: RuntimeAuthEndpointShape | undefined): RuntimeAuthProviderProtocol | undefined {
  const value = endpointShape?.trim().toLowerCase();
  if (value === "responses" || value === "chat_completions") return "openai";
  if (value === "messages") return "anthropic";
  if (value === "gemini_generate_content") return "gemini";
  if (value === "custom") return "custom";
  return undefined;
}

function credentialProtocol(credentialType: CredentialType): RuntimeAuthProviderProtocol {
  if (credentialType === "openai_api_key" || credentialType === "chatgpt_codex_oauth") return "openai";
  if (credentialType === "anthropic_api_key") return "anthropic";
  if (credentialType === "gemini_api_key") return "gemini";
  return "custom";
}

function credentialRefMatchesProvider(
  provider: RuntimeAuthProviderKind,
  endpointShape: RuntimeAuthEndpointShape | undefined,
  credentialRef: RuntimeAuthCredentialRef,
): boolean {
  const profileProviderName = provider.trim().toLowerCase();
  const refProviderName = credentialRef.provider.trim().toLowerCase();
  const profileProtocol = providerProtocol(provider) ?? endpointProtocol(endpointShape);
  const refProviderProtocol = providerProtocol(credentialRef.provider);
  const refCredentialProtocol = credentialProtocol(credentialRef.credentialType);
  return profileProtocol !== undefined &&
    profileProtocol === refCredentialProtocol &&
    (refProviderProtocol === undefined ? refProviderName === profileProviderName : refProviderProtocol === profileProtocol);
}

function failure<T>(
  code: RuntimeAuthRegistryErrorCode,
  message: string,
  boundary: RuntimeAuthRegistryError["boundary"],
): RuntimeAuthRegistryResult<T> {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.auth.registry.rejected"],
  };
}

export function createRuntimeAuthProviderProfile(input: {
  profileId?: string;
  name?: string;
  provider?: RuntimeAuthProviderKind;
  providerLabel?: string;
  endpointShape?: RuntimeAuthEndpointShape;
  baseURL?: string;
  credentialRef?: RuntimeAuthCredentialRef;
  authMode?: RuntimeAuthProviderProfile["authMode"];
  metadata?: Readonly<Record<string, unknown>>;
  now?: string;
}): RuntimeAuthRegistryResult<RuntimeAuthProviderProfile> {
  if (!hasText(input.profileId)) {
    return failure("MISSING_PROFILE_ID", "runtime auth provider profile requires a stable profileId", "input");
  }
  if (!hasText(input.provider)) {
    return failure("MISSING_PROVIDER", "runtime auth provider profile requires a provider", "input");
  }
  if (input.credentialRef === undefined) {
    return failure("MISSING_CREDENTIAL_REF", "runtime auth provider profile requires a credentialRef", "input");
  }
  const endpointShape = input.endpointShape ?? "responses";
  if (!credentialRefMatchesProvider(input.provider, endpointShape, input.credentialRef)) {
    return failure(
      "CREDENTIAL_PROVIDER_MISMATCH",
      "runtime auth provider profile credentialRef must match the profile provider protocol",
      "input",
    );
  }
  const stamp = nowIso(input.now);
  const profileId = input.profileId.trim();
  return {
    ok: true,
    value: {
      profileId,
      name: input.name?.trim() || profileId,
      provider: input.provider.trim(),
      providerLabel: input.providerLabel?.trim() || input.provider.trim(),
      endpointShape,
      baseURL: input.baseURL?.trim() || undefined,
      credentialRef: input.credentialRef,
      authMode: input.authMode ?? "api_key",
      metadata: input.metadata,
      createdAt: stamp,
      updatedAt: stamp,
      publicSafe: true,
    },
    events: ["runtime.auth.profile.created"],
  };
}

export function createRuntimeAuthModelEntry(input: {
  modelEntryId?: string;
  providerProfileRef?: string;
  model?: string;
  reasoning?: ProviderReasoningConfig;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  capabilityTags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
  testStatus?: RuntimeAuthModelEntry["testStatus"];
}): RuntimeAuthRegistryResult<RuntimeAuthModelEntry> {
  if (!hasText(input.modelEntryId)) {
    return failure("MISSING_MODEL_ENTRY_ID", "runtime auth model entry requires a stable modelEntryId", "input");
  }
  if (!hasText(input.providerProfileRef)) {
    return failure("MISSING_PROFILE_REF", "runtime auth model entry requires a providerProfileRef", "input");
  }
  if (!hasText(input.model)) {
    return failure("MISSING_MODEL", "runtime auth model entry requires a model name", "input");
  }
  return {
    ok: true,
    value: {
      modelEntryId: input.modelEntryId.trim(),
      providerProfileRef: input.providerProfileRef.trim(),
      model: input.model.trim(),
      reasoning: input.reasoning,
      contextWindowTokens: input.contextWindowTokens,
      maxOutputTokens: input.maxOutputTokens,
      capabilityTags: input.capabilityTags ?? [],
      metadata: input.metadata,
      testStatus: input.testStatus ?? { state: "unknown" },
      publicSafe: true,
    },
    events: ["runtime.auth.modelEntry.created"],
  };
}

export function bindRuntimeAuthRole(input: {
  role?: RuntimeAuthRole;
  providerProfileRef?: string;
  modelEntryRef?: string;
  enabled?: boolean;
  priority?: number;
  metadata?: Readonly<Record<string, unknown>>;
}): RuntimeAuthRegistryResult<RuntimeAuthRoleBinding> {
  if (!hasText(input.role)) {
    return failure("MISSING_ROLE", "runtime auth role binding requires a role", "input");
  }
  if (!hasText(input.providerProfileRef)) {
    return failure("MISSING_PROFILE_REF", "runtime auth role binding requires a providerProfileRef", "input");
  }
  return {
    ok: true,
    value: {
      role: input.role.trim(),
      providerProfileRef: input.providerProfileRef.trim(),
      modelEntryRef: input.modelEntryRef?.trim() || undefined,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      metadata: input.metadata,
      publicSafe: true,
    },
    events: ["runtime.auth.roleBinding.created"],
  };
}

export function createRuntimeAuthRegistry(input: {
  profiles?: readonly RuntimeAuthProviderProfile[];
  modelEntries?: readonly RuntimeAuthModelEntry[];
  roleBindings?: readonly RuntimeAuthRoleBinding[];
} = {}): RuntimeAuthRegistry {
  const profiles = new Map<string, RuntimeAuthProviderProfile>();
  const modelEntries = new Map<string, RuntimeAuthModelEntry>();
  const roleBindings: RuntimeAuthRoleBinding[] = [];

  const registry: RuntimeAuthRegistry = {
    putProviderProfile(profile) {
      profiles.set(profile.profileId, profile);
      return profile;
    },
    putModelEntry(entry) {
      modelEntries.set(entry.modelEntryId, entry);
      return entry;
    },
    putRoleBinding(binding) {
      const existing = roleBindings.findIndex((item) => item.role === binding.role && item.priority === binding.priority);
      if (existing >= 0) {
        roleBindings.splice(existing, 1, binding);
      } else {
        roleBindings.push(binding);
      }
      roleBindings.sort((left, right) => right.priority - left.priority);
      return binding;
    },
    getProviderProfile(profileRef) {
      return profiles.get(profileRef.trim());
    },
    getModelEntry(modelEntryRef) {
      return modelEntries.get(modelEntryRef.trim());
    },
    selectRole(role) {
      const binding = roleBindings.find((item) => item.enabled && item.role === role);
      if (binding === undefined) {
        return failure("ROLE_BINDING_NOT_FOUND", "runtime auth registry did not find an enabled role binding", "registry");
      }
      const profile = profiles.get(binding.providerProfileRef);
      if (profile === undefined) {
        return failure("PROFILE_NOT_FOUND", "runtime auth role binding points to a missing provider profile", "registry");
      }
      const modelEntry = binding.modelEntryRef === undefined ? undefined : modelEntries.get(binding.modelEntryRef);
      if (binding.modelEntryRef !== undefined && modelEntry === undefined) {
        return failure("MODEL_ENTRY_NOT_FOUND", "runtime auth role binding points to a missing model entry", "registry");
      }
      if (modelEntry !== undefined && modelEntry.providerProfileRef !== profile.profileId) {
        return failure("MODEL_ENTRY_PROFILE_MISMATCH", "runtime auth role binding points to a model entry owned by another provider profile", "registry");
      }
      return {
        ok: true,
        value: { profile, modelEntry, binding },
        events: ["runtime.auth.profile.selected"],
      };
    },
    snapshot() {
      return {
        profiles: [...profiles.values()],
        modelEntries: [...modelEntries.values()],
        roleBindings: [...roleBindings],
        publicSafe: true,
      };
    },
  };

  for (const profile of input.profiles ?? []) registry.putProviderProfile(profile);
  for (const entry of input.modelEntries ?? []) registry.putModelEntry(entry);
  for (const binding of input.roleBindings ?? []) registry.putRoleBinding(binding);
  return registry;
}
