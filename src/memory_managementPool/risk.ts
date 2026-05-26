import type { MemoryPermissionProfile, MemoryRiskMetadata } from "./types.js";

const passThrough: readonly MemoryPermissionProfile[] = ["bapr", "yolo", "permissive"];

export function describeMemoryRisk(operation: string): MemoryRiskMetadata {
  const normalized = operation.trim();
  if (normalized === "read" || normalized === "search" || normalized === "reindex" || normalized === "indexStatus" || normalized === "promptGuide") {
    return {
      operation: normalized,
      risk: "safe",
      allowedByDefault: ["bapr", "yolo", "permissive", "standard", "restricted"],
      approvalRecommendedFor: [],
      reason: "Read-only memory-plane metadata and search guidance do not mutate durable memory.",
    };
  }
  if (normalized === "appendDaily" || normalized === "editMemory" || normalized === "artifactRef" || normalized === "externalImport") {
    return {
      operation: normalized,
      risk: "risky",
      allowedByDefault: passThrough,
      approvalRecommendedFor: ["standard", "restricted"],
      reason: "Memory writes can affect future agent behavior and should be governed in conservative modes.",
    };
  }
  if (normalized === "delete" || normalized === "rewriteRoot") {
    return {
      operation: normalized,
      risk: "dangerous",
      allowedByDefault: ["bapr"],
      approvalRecommendedFor: ["yolo", "permissive", "standard", "restricted"],
      reason: "Deleting or rewriting memory roots can remove durable project or global facts.",
    };
  }
  return {
    operation: normalized.length === 0 ? "unknown" : normalized,
    risk: "risky",
    allowedByDefault: passThrough,
    approvalRecommendedFor: ["standard", "restricted"],
    reason: "Unknown memory-plane mutations default to risky.",
  };
}
