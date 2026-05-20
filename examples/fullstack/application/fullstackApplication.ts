export const fullstackApplication = {
  applicationId: "application.example.fullstack",
  displayName: "Praxis Fullstack Example",
  primaryAgentRef: "agents/repoInspector",
  entrypoints: {
    raxProject: "rax.project.json",
    raxAgentEntry: "agents/repoInspector/praxis.agent.ts",
    localDebugRunner: "application/runRepoInspector.ts",
  },
  surfaces: {
    cli: "rax inspect/test/run",
    approval: "agents/repoInspector/interfaces/approvalSurface.ts",
    futureTui: "application/interfaceSurface",
  },
} as const;
