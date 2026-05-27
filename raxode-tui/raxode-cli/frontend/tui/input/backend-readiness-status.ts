import {
  isRaxodeBackendReadiness,
  summarizeRaxodeReadiness,
  type RaxodeReadinessDigest,
} from "../../bridge/readiness.js";

const BACKEND_READINESS_PREFIX = "backend readiness: ";

export function parseBackendReadinessDigestLine(line: string): RaxodeReadinessDigest | null {
  if (!line.startsWith(BACKEND_READINESS_PREFIX)) {
    return null;
  }
  try {
    const parsed = JSON.parse(line.slice(BACKEND_READINESS_PREFIX.length)) as unknown;
    return isRaxodeBackendReadiness(parsed) ? summarizeRaxodeReadiness(parsed) : null;
  } catch {
    return null;
  }
}

export function formatBackendModuleStatusLine(digest: RaxodeReadinessDigest | null): string {
  const moduleInventory = digest?.moduleInventory;
  if (!digest) {
    return "not reported";
  }
  if (!moduleInventory) {
    return `readiness=${digest.status}`;
  }
  return [
    `modules=${moduleInventory.status}`,
    `ready=${moduleInventory.readyModules.length}`,
    `passive=${moduleInventory.passiveModules.length}`,
    `contract=${moduleInventory.contractModules.length}`,
  ].join(" · ");
}

export function formatBackendModuleGapsLine(digest: RaxodeReadinessDigest | null): string {
  const moduleInventory = digest?.moduleInventory;
  if (!moduleInventory) {
    return "none reported";
  }
  const gaps = [
    ...moduleInventory.missingModules.map((moduleId) => `${moduleId}=missing`),
    ...moduleInventory.warningModules.map((moduleId) => `${moduleId}=degraded`),
  ];
  return gaps.length > 0 ? gaps.join(", ") : "none";
}
