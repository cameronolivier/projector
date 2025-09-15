# Testing Guide

## Prerequisites
- Node `>=20`
- `pnpm` (project uses `pnpm@10`)
- TypeScript + Jest configured via `ts-jest` in `package.json`

## Commands
- Run all tests: `pnpm test`
- Watch mode: `pnpm test:watch`
- Single file: `pnpm test -- test/jump-utils.test.ts`
- Coverage report: `pnpm test -- --coverage`

Jest is configured to:
- Use `ts-jest` (`preset: ts-jest`)
- Run in Node environment (`testEnvironment: node`)
- Match tests in `test/**/*.test.ts`
- Disable Watchman (`watchman: false`) to avoid macOS sandbox issues

## Project Test Layout
- `test/` — place unit and integration tests here
- Example utils tests: `test/jump-utils.test.ts`
- Discovery tests:
  - `test/scanner-package-root.test.ts` — early stop at `package.json` roots
  - `test/root-scorer.test.ts` — signal collection and scoring, workspace globs
  - `test/scanner-monorepo-docs.test.ts` — monorepo traversal and docs-first projects
- Recommended patterns:
  - Unit test pure helpers in `src/lib/**`
  - Keep command tests focused on small units (serialization, filtering)
  - Prefer mocking I/O over spawning full CLI processes

## Writing Tests
- Utilities (preferred):
  - Export pure functions from `src/lib/**` (e.g., `filterByName`, `formatOutputPath`).
  - Write straightforward input/output tests with edge cases.
- Commands (lightweight):
  - Extract logic from commands into small helpers to test in isolation.
  - Avoid prompting in tests; mock Inquirer or test helper outputs directly.

### Mocking TTY/Non‑Interactive Behavior
Simulate non‑interactive environments by overriding TTY flags:
```ts
const original = process.stdout.isTTY
Object.defineProperty(process.stdout, 'isTTY', { value: false })
// … run code that checks isTTY …
Object.defineProperty(process.stdout, 'isTTY', { value: original })
```

## Troubleshooting
- Watchman errors on macOS: Already disabled via `watchman: false`.
- TypeScript type issues: run `pnpm typecheck` to see errors without emitting.
- ESLint/Prettier: `pnpm lint:check`, `pnpm prettier:check` for quick validation.

## Scope & Coverage
- Prioritize core logic: discovery filters, analyzers, table formatting, and new command helpers.
- Aim for coverage on new helpers; full E2E CLI spawning is optional.
- Use `--coverage` locally to track progress; no thresholds enforced yet.
### Discovery/Scanner Tests
- Mock `fs/promises` to provide a synthetic directory tree. Expose a `__setMockTree` helper in the mock to control `readdir`/`readFile` outputs.
- Keep tests shallow: prefer name checks (`readdir` with `withFileTypes`) and avoid deep content parsing.
- Validate both classification and traversal behavior: early stops at strong roots, optional descent into monorepo workspaces, and detection of docs-first projects (top-level `docs/` with markdown).
