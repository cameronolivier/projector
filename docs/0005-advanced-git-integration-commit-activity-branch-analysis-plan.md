status: done

# 0005 Advanced Git Integration (Commit Activity, Branch Analysis) — Plan

## Objective
Deliver richer git-aware insights for each discovered project so the list command can surface recent commit activity, active branch context, and stale branches without leaving the CLI. Insights must be fast, cached, and degrade gracefully when git data is unavailable.

## Background
Project analysis currently exposes only a boolean `hasGit` flag. Power users want to understand repo health quickly (recent commits, active branch freshness, stale branches) and prioritize work without opening each project. We already gather filesystem metadata and tracking files; extending analysis to git keeps the CLI a single source of truth.

## Success Criteria
- Git-enabled projects show a summarized "Git" column in the table (`branch • relative last commit • commits/window • stale branches`).
- Cache invalidates git insights when HEAD moves, local branches change, or the configured age window elapses.
- Users can toggle git insight collection (config flag + CLI override) to avoid extra cost when not needed.
- Tests cover git insight parsing, caching, and table formatting across representative repos.

## Scope
- Collect git metadata (active branch, upstream divergence, recent commit counts, last commit metadata, stale branch counts).
- Extend project types and cache to persist git insights.
- Update output formatting and summaries to include git insights.
- Add configuration surface and CLI flag to control git analysis and tune windows.
- Provide documentation for the new capabilities and configuration knobs.

## Out of Scope
- Remote interactions (fetch, API calls to GitHub/GitLab).
- Rendering full commit history or diff content.
- Managing branches (create/delete/checkout) or auto-fixing stale branches.
- Handling non-git VCS providers (hg, svn).

## User Experience
- Table column `Git` summarizes insights, e.g. `main • 2d ago • 8 commits/30d • 1 stale` (grayed out when unavailable).
- `--verbose` output prints an expanded git summary after the table (top branches with last commit info).
- CLI adds `--no-git-insights` (and `--git-insights` to force enable) when users differ from config defaults.
- JSON output path (future `--format json`) includes `git` object mirroring `GitInsights` type.

## Git Insights Architecture
- **Metrics**
  - `currentBranch`: from `git rev-parse --abbrev-ref HEAD` (fallback to detached commit hash).
  - `headCommit`: sha + committedAt + author + subject via `git log -1 --pretty`.
  - `commitsLast7Days` and configurable window (default 30 days) using `git rev-list --count HEAD --since=<N.days>`.
  - `ahead`/`behind` counts relative to upstream with `git rev-list --left-right --count HEAD...@{upstream}` (skip gracefully if no upstream).
  - `branchSummaries`: top N local branches (default 5) sorted by last commit date via `git for-each-ref --format='%(refname:short)|%(committerdate:iso8601)'`.
  - `staleBranches`: count branches whose last commit exceeds `staleThresholdDays` (default 90 days) and sample the stalest names for messaging.
- **Command Execution**
  - Introduce `GitCommandRunner` thin wrapper around `child_process.execFile` that enforces timeouts, trims output, and normalizes errors (missing git, repo not initialized, etc.).
  - Run commands with `cwd` set to the project root and environment inheriting PATH; detect git availability once per run (`git --version`).
  - Guard commands behind config/flag to skip entirely when disabled.
- **Data Model**
  - Add `GitInsights` interface to `src/lib/types.ts` holding the metrics above plus `collectedAt` timestamp.
  - Extend `AnalyzedProject` with optional `git` property; propagate through cache and output layers.
  - Update `CachedProjectData` with `git?: CachedGitInsights` (including `headCommitSha`, `branchHashes`, `expiresAt`) for invalidation decisions.
- **Caching Strategy**
  - Cache stores git insights alongside status; when reading, compare cached `headCommitSha` to fresh `git rev-parse HEAD` (cheap) and skip full refresh if unchanged and cache still within TTL.
  - Invalidate when: HEAD changes, number of branches changes, stale branch list differs, or TTL (default 6 hours) expires. TTL separate from existing 24h project cache to keep git data fresh.
  - Persist minimal branch fingerprint (e.g., sorted list of `<branchName>:<lastCommitSha>` hashed) to detect branch movement cheaply.

## Configuration Surface
- Extend `ProjectsConfig` with `gitInsights` object:
  - `enabled: boolean` (default `true`).
  - `activityWindowDays: number` (default `30`).
  - `shortWindowDays: number` (for 7-day metric, default `7`).
  - `staleBranchThresholdDays: number` (default `90`).
  - `maxBranches: number` (default `5`).
  - `cacheTtlHours: number` (default `6`).
- `ConfigurationManager` merges defaults; allow overrides in `~/.config/projector/config.yaml`.
- CLI flags on `list` command to enable/disable per run; CLI flag wins over config.

## Output Integration
- Modify `TableGenerator` to add `Git` column and associated formatting helper.
  - Format string using chalk colors: active branch in cyan, recent activity in green, stale indicator in dim/orange.
  - When insights missing or disabled, display `—` in gray.
- Update summary footer to mention counts of stale projects (`N repos with stale branches`, `M repos no commits last 30d`).
- Ensure column widths adapt (increase table width or adjust existing width distribution) to avoid overflow.

## Implementation Steps
1. **Config + Types**: Extend `ProjectsConfig`, `ConfigurationManager`, and `types.ts` with git insight structures and defaults.
2. **Git Utilities**: Create `src/lib/git/command-runner.ts` and `src/lib/git/analyzer.ts`; implement command execution, parsing helpers, and orchestrator method `collectInsights(projectPath, options)`.
3. **Caching**: Update `CacheManager` to persist/retrieve git insight payloads, TTLs, and invalidation heuristics (cheap HEAD check before reading full cache record).
4. **List Command Integration**: Wire `GitAnalyzer` into `list.ts` analysis loop (respecting flags/config, skipping when repo lacks `.git`). Ensure cached path stores/loads insights.
5. **Output Layer**: Modify `TableGenerator` and summary routines to render git insights and degrade gracefully.
6. **CLI Flags**: Add `--git-insights/--no-git-insights` to `list` command, and pass decisions to analyzer.
7. **Telemetry/Verbose Output**: When `--verbose`, log how git data derived (e.g., `Git: main, 8 commits last 30d, ahead 1`).
8. **Documentation**: Update README, docs/config.md, and add a git insights section explaining metrics, config, and performance considerations.
9. **Manual QA**: Validate on sample repos (active, stale, detached HEAD) and ensure runtime handles missing git binary.

## Testing Strategy
- Unit tests for `GitCommandRunner` mocking `execFile` error/success scenarios.
- Integration-style tests using temporary git repos created via `tmp` + actual `git` commands to validate metrics (skip when git unavailable in CI).
- Cache tests to confirm invalidation when HEAD moves or TTL expires.
- Table formatting tests verifying string output for various git states (active, disabled, stale only).
- CLI flag tests (oclif) ensuring `--no-git-insights` bypasses git analyzer.

## Documentation & Rollout
- README: add "Git Insights" section with sample screenshot/table snippet.
- docs/config.md: document new `gitInsights` block and CLI overrides.
- docs/TASKS.md: update task status once implemented.
- Consider changelog or release notes entry summarizing git feature.

## Risks & Mitigations
- **Performance regressions**: Mitigate by limiting command usage (single HEAD check first, bail if unchanged) and caching aggressively.
- **Environment variance**: Detect and warn when `git` binary missing; ensure tests skip gracefully.
- **Large repos**: Use count-based commands with `--since` instead of enumerating commits; avoid `git branch --verbose --all` to keep output small.
- **Detached HEADs / no upstream**: Provide sensible fallbacks in formatting (show short SHA, omit ahead/behind).
- **Windows path quirks**: Rely on execFile with sanitized args and avoid shell-specific syntax.
