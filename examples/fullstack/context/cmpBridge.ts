export const cmpBridgeContract = {
  bridgeId: "context.example.fullstack.cmpBridge",
  status: "contract-only",
  purpose: "声明 application 如何按需请求上下文材料；不引入独立后台 context pool。",
  inputs: ["task", "session", "state", "toolObservations"],
  outputs: ["promptMaterialRefs", "contextSummaryRefs"],
} as const;
