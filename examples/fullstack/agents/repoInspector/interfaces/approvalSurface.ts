import type { RuntimeApprovalResolver } from "@praxis-ai/praxis";

export const repoInspectorApprovalResolver: RuntimeApprovalResolver = async (approval) => {
  console.log("\n=== Approval Request Routed To Application Surface ===");
  console.log(approval);
  return {
    status: approval.publicSafe ? "approved" : "denied",
    resolvedBy: "example-fullstack-interface",
    reason: "example 自动批准 public-safe dry-run approval",
  };
};
