# Open Tasks

Summary
- Some nested folders are being reported as standalone projects. We need to stop descending once a `package.json` is found and treat that directory as the project root. In other words, for discovery purposes, any directory containing a `package.json` is a project root, and scanning should not continue deeper within it.

## Feature Enhancements
- Source: docs/project_plan.md#planned-features
- [x] 0001: Interactive project selection with inquirer ([plan](./0001-interactive-project-selection-with-inquirer-plan.md))
- [x] 0002: Jump to directory functionality ([plan](./0002-jump-to-directory-functionality-plan.md))
- [ ] 0003: IDE integration (code ., webstorm ., etc.)
- [ ] 0004: Project template system
- [ ] 0005: Advanced git integration (commit activity, branch analysis)

## Discovery & Scanning
- [ ] 0011: Stop descending into nested folders once a `package.json` is found; treat that directory as a project root and do not scan deeper (fix nested subfolder false positives)

## Quality Gates
- Source: docs/project_plan.md#quality-gates
- [ ] 0006: All tests passing
- [ ] 0007: ESLint/Prettier compliance
- [ ] 0008: TypeScript strict mode compliance
- [ ] 0009: Documentation updates
- [ ] 0010: Manual testing on sample projects
