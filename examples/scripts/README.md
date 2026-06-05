# Examples Scripts

Current packaged smoke scripts in this folder:

- `agentcore_smoke.ts`: core runtime construction smoke.
- `modelAdapter_smoke.ts`: model adapter lowering smoke.
- `mcp-plus-native-smoke.ts`: live MCP vs MCP+ native comparison across a
  representative multi-server MCP set, with devdoctor cache diagnostics.

The other scripts in this directory are archived migration references from the
old fine-grained tool layer. They still mention historical ids such as
`code.read`, `shell.commandExecution`, and `git.getRepositoryStatus`; do not use
them as evidence for the current semantic basetool contract.

Current examples should enter through `examples/minimal`, `examples/fullstack`,
`npm run smoke:agentCore`, `npm run smoke:modelAdapter`, or
`npm run smoke:mcp-plus-native`.
