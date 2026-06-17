# Runtime Application Management Plane

2026-06-09: `application.inspectManagementPlane` is the application-facing read command for the runtime management/control bundle. It returns `praxis.application.managementPlane`, wrapping `praxis.runtime.createRuntimeManagementPlane` and dry-run sub-results from `createRuntimeAccessSession`, `openRuntimeOperatorConsole`, `routeManagementCommand`, `evaluateManagementPolicyGate`, `governRuntimeResources`, `planRuntimeMutation`, `planRuntimeRollback`, and `createRuntimeGovernanceBridgeEnvelope`.

Boundary: this surface is public-safe and inspection-only. It must not submit a model turn, execute a management command, mutate the application session, or create a second product-local control engine. It exists so framework/application callers can see the runtime-mounted management bundle before the later executable external-control/timeline-retention work.

Verification anchors:

- `test/applicationLayer/applicationManagementPlane.test.ts`
- `test/applicationLayer/applicationManagementPlaneSmokeScript.test.ts`
- `examples/scripts/runtime_application_management_plane_smoke.ts`
- `npm run smoke:application-management-plane`
- `npm run acceptance:runtime-surfaces`
