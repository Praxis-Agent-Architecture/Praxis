export const cmpBridgeContract = {
  bridgeId: "context.example.fullstack.cmpBridge",
  status: "contract-only",
  purpose: "未来接入 context_managementPool；当前只声明 application 如何请求上下文材料。",
  inputs: ["task", "session", "state", "toolObservations"],
  outputs: ["promptMaterialRefs", "contextSummaryRefs"],
} as const;
