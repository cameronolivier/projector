# Open Tasks

Summary
- Some nested folders are being reported as standalone projects. We need to stop descending once a `package.json` is found and treat that directory as the project root. In other words, for discovery purposes, any directory containing a `package.json` is a project root, and scanning should not continue deeper within it.

## Feature Enhancements
- Source: docs/project_plan.md#planned-features
- [x] 0001: Interactive project selection with inquirer ([plan](./0001-interactive-project-selection-with-inquirer-plan.md))
- [x] 0002: Jump to directory functionality ([plan](./0002-jump-to-directory-functionality-plan.md))
- [x] 0003: IDE integration (code ., webstorm ., etc.) ([plan](./0003-ide-integration-code-webstorm-etc-plan.md))
- [x] 0013: Interactive actions from table (open, cd) with shell wrapper ([plan](./0013-interactive-actions-from-table-and-shell-wrapper-plan.md))
- [x] 0004: Project template system ([plan](./0004-project-template-system-plan.md))
- [ ] 0005: Advanced git integration (commit activity, branch analysis)

## Discovery & Scanning
- [x] 0011: Stop descending into nested folders once a `package.json` is found; treat that directory as a project root and do not scan deeper (fix nested subfolder false positives) ([plan](./0011-stop-descending-into-nested-folders-package-json-as-root-plan.md))
- [x] 0012: Comprehensive project root detection and monorepo awareness — manifests, lockfiles, VCS boundaries, scoring, and docs-first projects ([plan](./0012-comprehensive-project-root-detection-and-monorepo-awareness-plan.md))

## Quality Gates
- Source: docs/project_plan.md#quality-gates
- [ ] 0006: All tests passing
- [ ] 0007: ESLint/Prettier compliance
- [ ] 0008: TypeScript strict mode compliance
- [ ] 0009: Documentation updates
- [ ] 0010: Manual testing on sample projects
