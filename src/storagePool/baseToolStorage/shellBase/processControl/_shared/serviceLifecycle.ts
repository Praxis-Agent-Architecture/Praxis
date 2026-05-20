import {
  booleanValue,
  integerValue,
  readRecord,
  trimmedString,
  type JsonRecord,
} from "./processControlJson.js";

type ServiceLifecycleDefaults = {
  command?: string;
  handle?: string;
  cwd?: string;
  lifecycleKind?: string;
  launchMode?: string;
  statusSource: string;
};

function cleanRecord(input: Record<string, unknown>): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function verificationState(value: string): string {
  if (value === "verified" || value === "healthy") return "verified";
  if (value === "failed") return "failed";
  if (value === "pending") return "pending";
  if (value === "not-started") return "not-started";
  return "not-requested";
}

function processState(value: string): string {
  if (value === "failed") return "failed";
  if (value === "exited") return "exited";
  if (value === "starting") return "starting";
  if (value === "planned") return "planned";
  return value === "unknown" ? "unknown" : "running";
}

function publicVerificationStatus(value: string): string {
  return value === "not-run" || value === "not-requested" ? "unverified" : value;
}

function lifecycleVerificationStatus(value: string): string {
  return value === "not-run" ? "not-requested" : value;
}

export function plannedLifecycleStatusSnapshot(input: {
  handle: string;
  lifecycleKind: "background" | "detached" | "service";
  command: string;
  cwd?: string;
  verificationState: "not-requested" | "not-started";
  verificationKind?: string;
  url?: string;
  expectedStatus?: number;
  summary: string;
}): JsonRecord {
  return cleanRecord({
    handle: input.handle,
    lifecycleKind: input.lifecycleKind,
    processState: "planned",
    verificationState: input.verificationState,
    verified: false,
    command: input.command,
    cwd: input.cwd,
    verificationKind: input.verificationKind,
    url: input.url,
    expectedStatus: input.expectedStatus,
    summary: input.summary,
  });
}

export function withUnverifiedServiceLifecycle(
  resultEnvelope: JsonRecord,
  defaults: ServiceLifecycleDefaults,
): JsonRecord {
  const existing = readRecord(resultEnvelope.serviceLifecycle);
  const existingStatusSnapshot = readRecord(resultEnvelope.statusSnapshot);
  const existingHealth = readRecord(existingStatusSnapshot?.health);
  const envelopeVerified = booleanValue(resultEnvelope.verified)
    ?? booleanValue(existingStatusSnapshot?.verified)
    ?? booleanValue(existingHealth?.healthy);
  const rawVerificationStatus = trimmedString(existing?.verificationStatus)
    ?? trimmedString(resultEnvelope.verificationStatus)
    ?? (envelopeVerified === true ? "verified" : "unverified");
  const verificationStatus = publicVerificationStatus(rawVerificationStatus);
  const serviceLifecycleVerificationStatus = lifecycleVerificationStatus(rawVerificationStatus);
  const serviceStatus = trimmedString(existing?.status)
    ?? trimmedString(resultEnvelope.serviceStatus)
    ?? trimmedString(resultEnvelope.status)
    ?? "started";
  const handle = trimmedString(existing?.handle)
    ?? trimmedString(resultEnvelope.serviceHandle)
    ?? trimmedString(resultEnvelope.backgroundHandle)
    ?? trimmedString(resultEnvelope.detachedHandle)
    ?? trimmedString(resultEnvelope.spawnHandle)
    ?? trimmedString(resultEnvelope.processHandle)
    ?? trimmedString(resultEnvelope.jobId)
    ?? trimmedString(resultEnvelope.launchId)
    ?? defaults.handle;
  const processId = integerValue(existing?.processId)
    ?? integerValue(existing?.pid)
    ?? integerValue(resultEnvelope.processId)
    ?? integerValue(resultEnvelope.pid);
  const nextRequiredAction = verificationStatus === "verified"
    ? trimmedString(existing?.nextRequiredAction)
    : "verify";
  const snapshotVerified = booleanValue(existingStatusSnapshot?.verified)
    ?? booleanValue(existingHealth?.healthy)
    ?? (verificationStatus === "verified" || verificationStatus === "healthy");

  const serviceLifecycle = cleanRecord({
    ...(existing ?? {}),
    status: serviceStatus,
    verificationStatus: serviceLifecycleVerificationStatus,
    handle,
    processId,
    command: trimmedString(existing?.command) ?? defaults.command,
    launchMode: trimmedString(existing?.launchMode) ?? defaults.launchMode,
    nextRequiredAction,
    statusSource: trimmedString(existing?.statusSource) ?? defaults.statusSource,
  });
  const statusSnapshot = cleanRecord({
    ...(existingStatusSnapshot ?? {}),
    handle: trimmedString(existingStatusSnapshot?.handle) ?? handle,
    lifecycleKind: trimmedString(existingStatusSnapshot?.lifecycleKind) ?? defaults.lifecycleKind ?? defaults.launchMode ?? "process",
    processState: trimmedString(existingStatusSnapshot?.processState) ?? processState(serviceStatus),
    verificationState: trimmedString(existingStatusSnapshot?.verificationState) ?? verificationState(verificationStatus),
    verified: snapshotVerified,
    command: trimmedString(existingStatusSnapshot?.command) ?? trimmedString(existing?.command) ?? defaults.command,
    cwd: trimmedString(existingStatusSnapshot?.cwd) ?? defaults.cwd,
    pid: integerValue(existingStatusSnapshot?.pid) ?? processId,
    summary: trimmedString(existingStatusSnapshot?.summary) ?? (
      snapshotVerified
        ? "service reachability has been verified by the runtime"
        : "process started, but service reachability is not verified yet"
    ),
  });

  return cleanRecord({
    ...resultEnvelope,
    serviceStatus,
    verificationStatus,
    serviceHandle: handle,
    processId,
    nextRequiredAction,
    serviceLifecycle,
    statusSnapshot,
  });
}
