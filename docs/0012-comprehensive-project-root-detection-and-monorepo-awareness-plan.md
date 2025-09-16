status: done

# 0012 Comprehensive Project Root Detection and Monorepo Awareness — Plan

## Objective
Reduce false positives and false negatives in project discovery by:
- Recognizing a broader set of definitive root markers (manifests, lockfiles, VCS, monorepo configs).
- Introducing a scoring-based root classifier that combines multiple signals.
- Respecting repository and workspace boundaries for nested projects.
- Supporting docs-first projects by recognizing a `docs/` directory as an early project signal.

## Scope
- Discovery/root detection logic and configuration options only.
- Extend early-stop mechanism beyond Node (`package.json`) to other ecosystems.
- Add monorepo awareness (workspaces/modules) and optional nested package inclusion.
- No CLI surface changes yet; controlled via config.

## Design
- Strong root markers (stop descent by default):
  - Manifests: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `composer.json`, `pom.xml`, `build.gradle`, `settings.gradle`, `CMakeLists.txt`, `Makefile`, `Gemfile`, `*.gemspec`.
  - VCS: `.git` (dir or gitdir file). Stop at VCS boundary by default; allow submodules.
  - Lockfiles (+manifest boost): `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `composer.lock`.
  - Monorepo markers: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `go.work`, `Cargo.toml` with `[workspace]`, `pom.xml` with `<modules>`, `settings.gradle(.kts)`.

- Medium signals:
  - Tool config: `tsconfig.json`, `tox.ini`, `.flake8`, `.editorconfig`.
  - Structure hints: `src/`, `app/`, `lib/`, `tests/`.
  - Docs-first signal: directory contains a top-level `docs/` folder with at least one markdown file.

- Weak signals:
  - Code-file threshold: at least `minCodeFilesToConsider` files sharing a language.

- Negative signals (demote/ignore):
  - Vendored/build/coverage/temp dirs only: `node_modules`, `vendor`, `Pods`, `.gradle`, `.terraform`, `.m2`, `dist`, `build`, `coverage`, `.nyc_output`, `.cache`, `.next`, `.parcel-cache`, `out`, `bin`.
  - Example content only: paths containing `examples`, `fixtures`, `samples`, `docs/site` without a manifest.

- Scoring model (example weights):
  - Strong markers: +100 each (manifest, monorepo marker, VCS root + manifest, matching lockfile+manifest).
  - Medium: +60 (tool config + structure), +50 (docs-first: `docs/` with markdown).
  - Weak: +30 (code threshold + `src/`/`tests/`).
  - Negative: −50 if only vendored/build/example paths.
  - Root classification threshold: ≥60. On overlapping candidates, prefer the shallower directory.

- Stop/descend rules:
  - Stop at strong roots (manifest/VCS) by default.
  - Monorepo root: either stop or descend along workspace/module globs if `includeNestedPackages` permits.
  - Git boundaries: stop at `.git` unless configured otherwise; treat submodules as separate roots.

## Configuration Additions
- `rootMarkers: string[]` — additional filenames that define a root.
- `monorepoMarkers: string[]` — monorepo/workspace indicator files.
- `lockfilesAsStrong: boolean` — treat lockfiles as strong (especially with a matching manifest).
- `minCodeFilesToConsider: number` — threshold for code-file heuristic.
- `stopAtVcsRoot: boolean` — stop at `.git` boundaries (default: true).
- `includeNestedPackages: 'never' | 'when-monorepo' | 'always'` — control nested packages.
- `respectGitIgnore: boolean` — skip git-ignored paths (optional; performance warning).
- `denylistPaths: string[]` — globs/regexes to always skip.

## Implementation Steps
1. Extend `ProjectsConfig` with fields above; add defaults in `ConfigurationManager` and merge logic. ✅
2. Create `RootSignalScorer` in `src/lib/discovery/`:
   - `collectSignals(dir): RootSignals` (files, dirs, presence checks).
   - `scoreSignals(signals, config): number`. ✅
   - `isMonorepoRoot(signals): boolean` and `workspaceGlobs(dir): string[]`. ✅ (workspaceGlobs now supports pnpm/lerna/package.json workspaces, go.work, Cargo [workspace].members, Maven modules, and Gradle includes)
3. Update `ProjectScanner.scanDirectoryRecursive`:
   - Early stop for strong manifest markers (generalize beyond `package.json`).
   - If monorepo root and `includeNestedPackages !== 'never'`: follow workspace/module globs; otherwise stop.
   - Respect `stopAtVcsRoot`.
   - Consider docs-first: if `docs/` exists with markdown and score ≥ threshold, register as root.
4. Demote `node_modules` existence from project indicator; rely on scoring. ✅
5. Add ignore and denylist checks to traversal. ✅
6. Tests:
   - Unit: scorer weights for various combinations (manifest+lockfile, docs-first without code, monorepo markers, negative dirs only).
   - Scanner: monorepo root with nested packages included/excluded; VCS boundary; denylist skip; docs-first root detection.
   - Added parsers/tests for go.work, Cargo workspaces, Maven modules, Gradle settings includes. ✅
7. Docs: update architecture and TESTING notes about root detection, config flags, docs-first projects, and trade-offs. ✅

## Acceptance Criteria
- Detects roots reliably across Node/Python/Rust/Go/Java/PHP and common monorepo setups. ✅
- Respects stop-at `.git` and monorepo policies. ✅
- Identifies docs-first projects via `docs/` when no code or git exists. ✅
- No regressions in performance; scanning remains responsive with defaults. ✅

## Risks & Mitigations
- Complexity of scoring may introduce surprises: document weights and provide config overrides.
- Performance impact when reading many files: prefer `readdir` name checks, avoid deep reads, and cap depth.
- Git ignore parsing can be expensive: keep off by default; consider caching. Note: `respectGitIgnore` remains optional/off by default.

## Completion Notes
- Monorepo parsing implemented for:
  - pnpm (`pnpm-workspace.yaml`), Lerna (`lerna.json`), NPM/Yarn (`package.json` workspaces)
  - Go (`go.work` use directives, single and block forms)
  - Rust (Cargo `[workspace].members` arrays, including simple globs like `crates/*`)
  - Maven (`pom.xml` `<modules><module>…</module></modules>`)
  - Gradle (`settings.gradle`/`.kts` `include` forms, e.g. `':app', ':lib'`)
- Tests added: `test/scanner-monorepo-others.test.ts` for Go/Cargo/Maven/Gradle; existing tests cover pnpm and docs-first.
- Architecture doc updated to reflect scoring model and monorepo traversal; defaults wired via config.

## Out of Scope
- Full `.gitignore` engine parity; fuzzy matching; language-specific deep analysis.
