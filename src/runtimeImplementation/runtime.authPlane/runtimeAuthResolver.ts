/*
 * 文件定位：Runtime / authPlane / auth resolver。
 * 核心目的：按 providerProfileRef/modelEntryRef/credentialRef 从 vault 解密并生成 AuthEnvelope。
 * 边界：不自动寻找密钥；没有 vault 或 keyProvider 时直接 AUTH_REQUIRED。
 */

import {
  createCredentialRef,
  type CredentialRef,
} from "../../modelAdapter/authProfileLayer/credentialRef.js";
import {
  resolveAuthEnvelope,
  type AuthResolverResult,
} from "../../modelAdapter/authProfileLayer/authResolver.js";
import type { AuthEnvelope, ResolvedAuthEnvelope } from "../../modelAdapter/authProfileLayer/authEnvelope.js";
import type {
  RuntimeAuthRegistryErrorCode,
  RuntimeAuthModelEntry,
  RuntimeAuthProviderProfile,
  RuntimeAuthRegistry,
  RuntimeAuthRole,
} from "./providerAuthRegistry.js";
import {
  decryptRuntimeAuthSecretRecord,
  type RuntimeAuthSecretRecord,
  type RuntimeAuthSecretPlaintext,
  type RuntimeAuthSecretVault,
  type RuntimeAuthVaultKeyProvider,
  type RuntimeAuthAuditEvent,
} from "./secretVault.js";

export type RuntimeAuthResolverErrorCode =
  | "AUTH_REQUIRED"
  | "PROFILE_NOT_FOUND"
  | "MODEL_ENTRY_NOT_FOUND"
  | "MODEL_ENTRY_PROFILE_MISMATCH"
  | "CREDENTIAL_REF_NOT_FOUND"
  | "AMBIGUOUS_CREDENTIAL_REF"
  | "SECRET_NOT_FOUND"
  | "SECRET_UNAVAILABLE"
  | "SECRET_DECRYPT_FAILED"
  | "ROLE_BINDING_NOT_FOUND"
  | "INVALID_CREDENTIAL_REF"
  | "UNSUPPORTED_CREDENTIAL";

export type RuntimeAuthResolverError = {
  code: RuntimeAuthResolverErrorCode;
  message: string;
  boundary: "auth" | "registry" | "vault" | "credential";
  publicSafe: true;
};

export type RuntimeAuthResolverSelection =
  | { role: RuntimeAuthRole }
  | { providerProfileRef: string; modelEntryRef?: string }
  | { credentialRefId: string; modelEntryRef?: string };

export type RuntimeAuthResolverRequest = RuntimeAuthResolverSelection & {
  extraHeaders?: Readonly<Record<string, string>>;
};

export type RuntimeAuthResolverResolved = {
  providerProfile: RuntimeAuthProviderProfile;
  modelEntry?: RuntimeAuthModelEntry;
  credentialRef: CredentialRef;
  auth: AuthEnvelope;
  resolved: ResolvedAuthEnvelope;
  publicSafe: true;
};

export type RuntimeAuthResolverResult =
  | { ok: true; value: RuntimeAuthResolverResolved; events: readonly (string | RuntimeAuthAuditEvent)[] }
  | { ok: false; error: RuntimeAuthResolverError; events: readonly (string | RuntimeAuthAuditEvent)[] };

export type RuntimeAuthResolver = {
  resolve(request: RuntimeAuthResolverRequest): Promise<RuntimeAuthResolverResult>;
};

export type RuntimeAuthResolverOptions = {
  registry: RuntimeAuthRegistry;
  vault: RuntimeAuthSecretVault;
  keyProvider: RuntimeAuthVaultKeyProvider;
  now?: () => string | Date;
};

function failure(
  code: RuntimeAuthResolverErrorCode,
  message: string,
  boundary: RuntimeAuthResolverError["boundary"],
  events: readonly (string | RuntimeAuthAuditEvent)[] = ["runtime.auth.resolver.rejected"],
): RuntimeAuthResolverResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events,
  };
}

function materialForSecret(secret: RuntimeAuthSecretPlaintext): {
  injectedSecret?: string;
  injectedMaterial?: {
    headers?: Readonly<Record<string, string>>;
    expiresAt?: string;
  };
} {
  if (secret.accessToken !== undefined) {
    return {
      injectedMaterial: {
        headers: {
          authorization: `Bearer ${secret.accessToken}`,
          ...(secret.accountId !== undefined ? { "ChatGPT-Account-ID": secret.accountId } : {}),
        },
      },
    };
  }
  if (secret.custom !== undefined && Object.keys(secret.custom).length > 0) {
    return { injectedMaterial: { headers: secret.custom } };
  }
  return { injectedSecret: secret.apiKey ?? Object.values(secret.custom ?? {})[0] };
}

function resolverFailureFromAuth(result: AuthResolverResult): RuntimeAuthResolverResult {
  if (result.ok) {
    throw new Error("expected failed auth resolver result");
  }
  return failure(
    result.error.code === "UNSUPPORTED_CREDENTIAL_TYPE" ? "UNSUPPORTED_CREDENTIAL" : "AUTH_REQUIRED",
    result.error.message,
    "credential",
    result.events,
  );
}

function resolverErrorCodeFromRegistry(code: RuntimeAuthRegistryErrorCode): RuntimeAuthResolverErrorCode {
  if (
    code === "PROFILE_NOT_FOUND" ||
    code === "MODEL_ENTRY_NOT_FOUND" ||
    code === "MODEL_ENTRY_PROFILE_MISMATCH" ||
    code === "ROLE_BINDING_NOT_FOUND"
  ) {
    return code;
  }
  return "PROFILE_NOT_FOUND";
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timeMs(value: string | Date | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function secretUnavailableReason(
  secret: RuntimeAuthSecretRecord,
  now: string | Date,
): string | undefined {
  if (secret.meta.status === "revoked") return "runtime auth secret has been revoked";
  if (secret.meta.status === "expired") return "runtime auth secret has expired";
  const expiresAt = timeMs(secret.meta.expiresAt);
  const current = timeMs(now);
  if (expiresAt !== undefined && current !== undefined && expiresAt <= current) {
    return "runtime auth secret expiresAt is in the past";
  }
  return undefined;
}

async function selectProfile(
  registry: RuntimeAuthRegistry,
  request: RuntimeAuthResolverRequest,
): Promise<
  | { ok: true; profile: RuntimeAuthProviderProfile; modelEntry?: RuntimeAuthModelEntry; events: readonly string[] }
  | { ok: false; result: RuntimeAuthResolverResult }
> {
  if ("role" in request) {
    const selected = registry.selectRole(request.role);
    if (!selected.ok) {
      return {
        ok: false,
        result: failure(resolverErrorCodeFromRegistry(selected.error.code), selected.error.message, "registry", selected.events),
      };
    }
    return {
      ok: true,
      profile: selected.value.profile,
      modelEntry: selected.value.modelEntry,
      events: selected.events,
    };
  }

  if ("credentialRefId" in request) {
    const credentialRefId = request.credentialRefId.trim();
    if (!hasText(credentialRefId)) {
      return {
        ok: false,
        result: failure("CREDENTIAL_REF_NOT_FOUND", "runtime auth credential ref id was not found", "registry"),
      };
    }
    const modelEntry = request.modelEntryRef === undefined ? undefined : registry.getModelEntry(request.modelEntryRef);
    if (request.modelEntryRef !== undefined && modelEntry === undefined) {
      return {
        ok: false,
        result: failure("MODEL_ENTRY_NOT_FOUND", "runtime auth model entry was not found", "registry"),
      };
    }
    const candidates = registry.snapshot().profiles.filter((profile) =>
      profile.credentialRef.credentialRefId === credentialRefId,
    );
    if (candidates.length === 0) {
      return {
        ok: false,
        result: failure("CREDENTIAL_REF_NOT_FOUND", "runtime auth credential ref was not found", "registry"),
      };
    }
    const profile = modelEntry === undefined
      ? candidates.length === 1 ? candidates[0] : undefined
      : candidates.find((candidate) => candidate.profileId === modelEntry.providerProfileRef);
    if (profile === undefined) {
      return {
        ok: false,
        result: failure(
          modelEntry === undefined ? "AMBIGUOUS_CREDENTIAL_REF" : "MODEL_ENTRY_PROFILE_MISMATCH",
          modelEntry === undefined
            ? "runtime auth credential ref maps to multiple provider profiles"
            : "runtime auth model entry belongs to a different provider profile",
          "registry",
        ),
      };
    }
    return { ok: true, profile, modelEntry, events: ["runtime.auth.profile.selected"] };
  }

  const profile = registry.getProviderProfile(request.providerProfileRef);
  if (profile === undefined) {
    return {
      ok: false,
      result: failure("PROFILE_NOT_FOUND", "runtime auth provider profile was not found", "registry"),
    };
  }
  const modelEntry = request.modelEntryRef === undefined ? undefined : registry.getModelEntry(request.modelEntryRef);
  if (request.modelEntryRef !== undefined && modelEntry === undefined) {
    return {
      ok: false,
      result: failure("MODEL_ENTRY_NOT_FOUND", "runtime auth model entry was not found", "registry"),
    };
  }
  if (modelEntry !== undefined && modelEntry.providerProfileRef !== profile.profileId) {
    return {
      ok: false,
      result: failure("MODEL_ENTRY_PROFILE_MISMATCH", "runtime auth model entry belongs to a different provider profile", "registry"),
    };
  }
  return { ok: true, profile, modelEntry, events: ["runtime.auth.profile.selected"] };
}

function credentialRefFor(profile: RuntimeAuthProviderProfile): RuntimeAuthResolverResult | CredentialRef {
  const ref = createCredentialRef({
    id: profile.credentialRef.credentialRefId,
    provider: profile.credentialRef.provider,
    credentialType: profile.credentialRef.credentialType,
    source: {
      kind: "profile-store",
      label: profile.credentialRef.secretId,
    },
  });
  if (!ref.ok) {
    return failure("INVALID_CREDENTIAL_REF", ref.error.message, "credential", ref.events);
  }
  return ref.credentialRef;
}

export function createRuntimeAuthResolver(options: RuntimeAuthResolverOptions): RuntimeAuthResolver {
  return {
    async resolve(request) {
      const selected = await selectProfile(options.registry, request);
      if (!selected.ok) return selected.result;

      const credentialRef = credentialRefFor(selected.profile);
      if ("ok" in credentialRef) return credentialRef;

      const secret = options.vault.get(selected.profile.credentialRef.secretId);
      if (secret === undefined) {
        return failure("SECRET_NOT_FOUND", "runtime auth secret was not found in the injected vault", "vault", [
          ...selected.events,
          "runtime.auth.resolver.secretNotFound",
        ]);
      }

      const unavailableReason = secretUnavailableReason(secret, options.now?.() ?? new Date());
      if (unavailableReason !== undefined) {
        return failure("SECRET_UNAVAILABLE", unavailableReason, "vault", [
          ...selected.events,
          "runtime.auth.resolver.secretUnavailable",
        ]);
      }

      const decrypted = await decryptRuntimeAuthSecretRecord({
        record: secret,
        keyProvider: options.keyProvider,
      });
      if (!decrypted.ok) {
        return failure("SECRET_DECRYPT_FAILED", decrypted.error.message, "vault", [
          ...selected.events,
          ...decrypted.events,
        ]);
      }

      const material = materialForSecret(decrypted.value);
      const auth = resolveAuthEnvelope({
        credentialRef,
        injectedSecret: material.injectedSecret,
        injectedMaterial: material.injectedMaterial,
        extraHeaders: request.extraHeaders,
      });
      if (!auth.ok) {
        return resolverFailureFromAuth(auth);
      }

      return {
        ok: true,
        value: {
          providerProfile: selected.profile,
          modelEntry: selected.modelEntry,
          credentialRef,
          auth: auth.resolved.envelope,
          resolved: auth.resolved,
          publicSafe: true,
        },
        events: [
          ...selected.events,
          ...decrypted.events,
          ...auth.events,
          "runtime.auth.resolver.resolved",
        ],
      };
    },
  };
}
