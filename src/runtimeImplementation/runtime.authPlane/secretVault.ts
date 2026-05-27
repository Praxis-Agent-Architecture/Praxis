/*
 * 文件定位：Runtime / authPlane / 用户级 secret vault。
 * 核心目的：为上层应用提供加密保存 provider auth/API 凭证的安全构件。
 * 边界：不读取环境变量、不扫描 CLI auth 文件、不决定用户登录 UX；master key 由上层注入。
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { redactSecret } from "../../modelAdapter/authProfileLayer/secretRedaction.js";

export type RuntimeAuthProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai-compatible"
  | "anthropic-compatible"
  | "custom"
  | (string & {});

export type RuntimeAuthSecretKind =
  | "api_key"
  | "chatgpt_codex_oauth"
  | "claude_subscription_contract"
  | "custom";

export type RuntimeAuthSecretPlaintext = {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  custom?: Readonly<Record<string, string>>;
};

export type RuntimeAuthVaultKeyProvider = () => string | Uint8Array | Promise<string | Uint8Array>;

export type RuntimeAuthEncryptedPayload = {
  algorithm: "AES-256-GCM";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type RuntimeAuthSecretRecord = {
  kind: "praxis.runtimeAuth.secretRecord";
  schemaVersion: "praxis.runtimeAuth.secretRecord.v1";
  secretId: string;
  provider: RuntimeAuthProviderKind;
  providerLabel: string;
  secretKind: RuntimeAuthSecretKind;
  encryptedPayload: RuntimeAuthEncryptedPayload;
  display: {
    masked: string;
    redactedIdentity?: string;
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
    status?: "active" | "expired" | "revoked" | "unknown";
  };
  publicSafe: true;
};

export type RuntimeAuthSecretPublicView = Omit<RuntimeAuthSecretRecord, "encryptedPayload"> & {
  encryptedPayload: {
    algorithm: RuntimeAuthEncryptedPayload["algorithm"];
    kdf: RuntimeAuthEncryptedPayload["kdf"];
    present: true;
  };
};

export type RuntimeAuthVaultErrorCode =
  | "MISSING_SECRET_ID"
  | "MISSING_PROVIDER"
  | "MISSING_SECRET_MATERIAL"
  | "MISSING_MASTER_KEY"
  | "DECRYPT_FAILED"
  | "SECRET_NOT_FOUND";

export type RuntimeAuthVaultError = {
  code: RuntimeAuthVaultErrorCode;
  message: string;
  boundary: "input" | "key" | "crypto" | "store";
  publicSafe: true;
};

export type RuntimeAuthVaultResult<T> =
  | { ok: true; value: T; events: readonly RuntimeAuthAuditEvent[] }
  | { ok: false; error: RuntimeAuthVaultError; events: readonly RuntimeAuthAuditEvent[] };

export type RuntimeAuthAuditEventKind =
  | "runtime.auth.secret.created"
  | "runtime.auth.secret.used"
  | "runtime.auth.secret.decrypt.failed";

export type RuntimeAuthAuditEvent = {
  eventId: string;
  kind: RuntimeAuthAuditEventKind;
  createdAt: string;
  secretId?: string;
  provider?: RuntimeAuthProviderKind;
  publicSafe: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeAuthSecretVault = {
  put(record: RuntimeAuthSecretRecord): RuntimeAuthSecretRecord;
  get(secretId: string): RuntimeAuthSecretRecord | undefined;
  listPublic(): readonly RuntimeAuthSecretPublicView[];
};

function nowIso(input?: string | Date): string {
  if (input instanceof Date) return input.toISOString();
  return input?.trim() || new Date().toISOString();
}

function failure<T>(
  code: RuntimeAuthVaultErrorCode,
  message: string,
  boundary: RuntimeAuthVaultError["boundary"],
  eventKind?: RuntimeAuthAuditEventKind,
  input?: { secretId?: string; provider?: RuntimeAuthProviderKind; now?: string | Date },
): RuntimeAuthVaultResult<T> {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: eventKind === undefined
      ? []
      : [authAuditEvent({ kind: eventKind, secretId: input?.secretId, provider: input?.provider, now: input?.now })],
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

async function masterKeyBytes(provider: RuntimeAuthVaultKeyProvider): Promise<Buffer | undefined> {
  const provided = await provider();
  if (typeof provided === "string") {
    const trimmed = provided.trim();
    return trimmed.length > 0 ? Buffer.from(trimmed, "utf8") : undefined;
  }
  return provided.byteLength > 0 ? Buffer.from(provided) : undefined;
}

function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, 32, { N: 16384, r: 8, p: 1 });
}

function primarySecret(input: RuntimeAuthSecretPlaintext, secretKind: RuntimeAuthSecretKind): string | undefined {
  if (secretKind === "api_key") return input.apiKey;
  if (secretKind === "chatgpt_codex_oauth") return input.accessToken;
  if (secretKind === "custom") return input.apiKey ?? Object.values(input.custom ?? {})[0];
  return input.accessToken ?? input.apiKey;
}

export function authAuditEvent(input: {
  kind: RuntimeAuthAuditEventKind;
  secretId?: string;
  provider?: RuntimeAuthProviderKind;
  now?: string | Date;
  metadata?: Readonly<Record<string, unknown>>;
}): RuntimeAuthAuditEvent {
  const createdAt = nowIso(input.now);
  return {
    eventId: `${input.kind}:${input.secretId ?? "unknown"}:${createdAt}`,
    kind: input.kind,
    createdAt,
    secretId: input.secretId,
    provider: input.provider,
    publicSafe: true,
    metadata: input.metadata,
  };
}

export async function createRuntimeAuthSecretRecord(input: {
  secretId?: string;
  provider?: RuntimeAuthProviderKind;
  providerLabel?: string;
  secretKind?: RuntimeAuthSecretKind;
  plaintext?: RuntimeAuthSecretPlaintext;
  keyProvider: RuntimeAuthVaultKeyProvider;
  now?: string | Date;
  expiresAt?: string;
  status?: RuntimeAuthSecretRecord["meta"]["status"];
  redactedIdentity?: string;
}): Promise<RuntimeAuthVaultResult<RuntimeAuthSecretRecord>> {
  if (!hasText(input.secretId)) {
    return failure("MISSING_SECRET_ID", "runtime auth secret requires a stable secretId", "input");
  }
  if (!hasText(input.provider)) {
    return failure("MISSING_PROVIDER", "runtime auth secret requires a provider", "input", undefined, {
      secretId: input.secretId,
      now: input.now,
    });
  }
  const secretKind = input.secretKind ?? "api_key";
  const material = input.plaintext;
  const primary = material === undefined ? undefined : primarySecret(material, secretKind);
  if (!hasText(primary)) {
    return failure("MISSING_SECRET_MATERIAL", "runtime auth secret requires credential material", "input", undefined, {
      secretId: input.secretId,
      provider: input.provider,
      now: input.now,
    });
  }
  const master = await masterKeyBytes(input.keyProvider);
  if (master === undefined) {
    return failure("MISSING_MASTER_KEY", "runtime auth vault requires an application-injected master key", "key", undefined, {
      secretId: input.secretId,
      provider: input.provider,
      now: input.now,
    });
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(master, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(material), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const stamp = nowIso(input.now);
  const secretId = input.secretId.trim();
  const provider = input.provider.trim();

  return {
    ok: true,
    value: {
      kind: "praxis.runtimeAuth.secretRecord",
      schemaVersion: "praxis.runtimeAuth.secretRecord.v1",
      secretId,
      provider,
      providerLabel: input.providerLabel?.trim() || provider,
      secretKind,
      encryptedPayload: {
        algorithm: "AES-256-GCM",
        kdf: "scrypt",
        salt: base64url(salt),
        iv: base64url(iv),
        tag: base64url(tag),
        ciphertext: base64url(ciphertext),
      },
      display: {
        masked: redactSecret(primary) ?? "[redacted]",
        redactedIdentity: input.redactedIdentity,
      },
      meta: {
        createdAt: stamp,
        updatedAt: stamp,
        expiresAt: input.expiresAt,
        status: input.status ?? "active",
      },
      publicSafe: true,
    },
    events: [authAuditEvent({ kind: "runtime.auth.secret.created", secretId, provider, now: stamp })],
  };
}

export async function decryptRuntimeAuthSecretRecord(input: {
  record?: RuntimeAuthSecretRecord;
  keyProvider: RuntimeAuthVaultKeyProvider;
  now?: string | Date;
}): Promise<RuntimeAuthVaultResult<RuntimeAuthSecretPlaintext>> {
  if (input.record === undefined) {
    return failure("SECRET_NOT_FOUND", "runtime auth secret was not found", "store");
  }
  const master = await masterKeyBytes(input.keyProvider);
  if (master === undefined) {
    return failure("MISSING_MASTER_KEY", "runtime auth vault requires an application-injected master key", "key");
  }
  try {
    const salt = fromBase64url(input.record.encryptedPayload.salt);
    const iv = fromBase64url(input.record.encryptedPayload.iv);
    const tag = fromBase64url(input.record.encryptedPayload.tag);
    const ciphertext = fromBase64url(input.record.encryptedPayload.ciphertext);
    const key = deriveKey(master, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return {
      ok: true,
      value: JSON.parse(plaintext) as RuntimeAuthSecretPlaintext,
      events: [
        authAuditEvent({
          kind: "runtime.auth.secret.used",
          secretId: input.record.secretId,
          provider: input.record.provider,
          now: input.now,
        }),
      ],
    };
  } catch {
    return failure(
      "DECRYPT_FAILED",
      "runtime auth secret could not be decrypted with the provided key",
      "crypto",
      "runtime.auth.secret.decrypt.failed",
      { secretId: input.record.secretId, provider: input.record.provider, now: input.now },
    );
  }
}

export function toRuntimeAuthSecretPublicView(record: RuntimeAuthSecretRecord): RuntimeAuthSecretPublicView {
  const { encryptedPayload: _encryptedPayload, ...rest } = record;
  return {
    ...rest,
    encryptedPayload: {
      algorithm: record.encryptedPayload.algorithm,
      kdf: record.encryptedPayload.kdf,
      present: true,
    },
  };
}

export function createInMemoryRuntimeAuthSecretVault(
  initialRecords: readonly RuntimeAuthSecretRecord[] = [],
): RuntimeAuthSecretVault {
  const records = new Map<string, RuntimeAuthSecretRecord>();
  const vault: RuntimeAuthSecretVault = {
    put(record) {
      records.set(record.secretId, record);
      return record;
    },
    get(secretId) {
      return records.get(secretId.trim());
    },
    listPublic() {
      return [...records.values()].map(toRuntimeAuthSecretPublicView);
    },
  };
  for (const record of initialRecords) {
    vault.put(record);
  }
  return vault;
}
