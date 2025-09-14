status: done

# 0011 Stop Descending Into Nested Folders When `package.json` Is Found — Plan

## Objective
Prevent deeply nested subfolders from being listed as standalone projects by treating any directory containing a `package.json` as a definitive project root and halting further descent from that node.

## Scope
- Discovery logic only; no output/table changes.
- Applies to Node.js roots (directories with `package.json`).
- Do not recurse into subdirectories of a directory that contains `package.json`.
- Keep existing detection for other ecosystems unchanged for now.

## Design Changes
- Update `ProjectScanner.scanDirectoryRecursive` (src/lib/discovery/scanner.ts):
  - Early-check current directory for `package.json` (cheap `readdir` name check).
  - If present: create `ProjectDirectory`, record root in `projectRoots`, and `return` (do not recurse).
  - Keep current “skip if inside an already identified root” guard.
- Narrow the Node root signal:
  - Treat `package.json` as the only definitive stop condition for Node.
  - Leave other strong indicators as “project roots” but do not change their stop behavior in this task.

## Implementation Steps
1. Add helper `hasFile(currentPath, 'package.json')` (fast `readdir` name match).
2. In `scanDirectoryRecursive` run this check before general `isProjectDirectory` logic.
3. If true, push project and stop descending.
4. Keep existing `isProjectDirectory` for non-Node roots as-is (temporary coexistence).
5. Add config switch (optional, default true): `stopAtNodePackageRoot: boolean` in `ProjectsConfig` to allow opt-out.
6. Tests:
   - Fixture-less unit test using mocked fs/promises: given tree with `apps/app/package.json` and `apps/app/packages/lib/package.json`, ensure only `apps/app` is returned.
   - Ensure normal directories without `package.json` continue scanning.

## Edge Cases
- Monorepos with multiple `package.json` files: with this rule, inner packages won’t be listed; treat as acceptable for this task.
- Symlinks and visited paths: keep existing logic; early return still respects visited/root guards.

## Acceptance Criteria
- When scanning a tree where a directory contains `package.json`, scanner emits that directory as a single project and does not list deeper nested folders.
- No regressions in performance or errors on unreadable directories.
- Optional config flag allows restoring previous behavior if needed.

## Risks & Mitigations
- Potentially hides nested packages users may want to see: document behavior and (optionally) add a follow-up task to support a flag like `--include-nested-node-packages`.
