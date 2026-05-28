# Legacy Basic Tool Layer

This directory is a compatibility shim for old internal imports.

Current Praxis basetool truth lives in `src/basetool/`:

- `catalog.ts`
- `profiles.ts`
- `factMatrix.ts`
- `registry.ts`
- `core/`

Do not add new tool semantics here. New code should import from `src/basetool`
or through the public package subpath `@praxis-ai/praxis/basetool`.
