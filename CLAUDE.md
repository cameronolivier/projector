# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**projector** is a TypeScript/Node.js CLI that discovers, analyzes, and manages development projects. It uses the oclif framework to provide rich interactive features including project scanning with intelligent root detection, monorepo awareness, status tracking, git insights, template scaffolding, and shell integration for seamless directory navigation. The package provides the `projector` command.

## Architecture

This is a modular CLI with clear separation of concerns:

- **Entry Point**: `src/index.ts` - oclif runner, default command is `list`
- **Commands**: `src/commands/` - list.ts, cache.ts, init.ts, jump.ts, open.ts, shell.ts, template.ts, config.ts
- **Discovery**: `src/lib/discovery/` - Scanner with root scoring (`root-scorer.ts`), type detector, monorepo awareness
- **Tracking**: `src/lib/tracking/` - Status analysis from tracking files (CLAUDE.md, epics.md, etc.)
- **Git**: `src/lib/git/` - Git insights collection (commits, branches, activity)
- **Templates**: `src/lib/templates/` - Project scaffolding system
- **Shell**: `src/lib/shell/` - Shell wrapper generation for cd-in-place
- **Output**: `src/lib/output/` - Table generation and formatting
- **Config**: `src/lib/config/` - YAML configuration at `~/.config/projector/config.yaml`
- **Cache**: `src/lib/cache/` - Performance caching with mtime tracking
- **Types**: `src/lib/types.ts` - Core TypeScript interfaces and enums

Main flows:
- **Scan**: Scanner + RootScorer find project roots → Detector identifies types → Analyzer reads tracking → Table displays
- **Interactive**: After table display → prompt project selection → prompt action (open/cd/print)
- **Templates**: Load template definition → prompt variables → render files → execute post-commands

## Development Commands

```bash
# Prerequisites
nvm use                   # Use Node LTS from .nvmrc (currently lts/jod - Node 20+)
pnpm install             # Install dependencies (requires pnpm v10+)

# Development
pnpm dev                 # Run CLI via tsx src/index.ts (no build)
pnpm link                # Make 'projector' command globally available
pnpm unlink              # Remove global link

# Testing & Quality
pnpm test                # Jest test suite
pnpm test:watch          # Jest in watch mode
pnpm lint:check          # ESLint with --max-warnings=0
pnpm lint:fix            # Auto-fix linting issues
pnpm prettier:check      # Check formatting
pnpm prettier:write      # Apply formatting
pnpm typecheck           # TypeScript checking (tsc --noEmit)

# Build
pnpm build               # Production build (tsc → dist/)
pnpm clean               # Remove dist/ and oclif.manifest.json
```

## Core Types & Interfaces

Key types in `src/lib/types.ts`:

```typescript
enum ProjectType { NodeJS, Python, Rust, Go, PHP, Java, Unknown }
enum TrackingType { ProjectPlan, Epics, Claude, Todo, Custom }

interface ProjectDirectory {
  name: string; path: string; type: ProjectType;
  languages: string[]; hasGit: boolean; files: string[];
}

interface ProjectStatus {
  type: 'phase' | 'stable' | 'active' | 'archived' | 'unknown'
  details: string; confidence: number;
}

interface AnalyzedProject extends ProjectDirectory {
  status: ProjectStatus; description: string;
  trackingFiles: TrackingFile[]; confidence: number;
}
```

## CLI Commands

### Core Commands

```bash
# List projects (default command)
projector                          # Scan default directory, interactive flow in TTY
projector --directory ~/code       # Scan specific directory
projector --depth 3                # Custom scan depth
projector --verbose                # Show progress + git details
projector --no-cache               # Force fresh analysis
projector --clear-cache            # Clear cache first
projector --git-insights           # Force enable git insights
projector --no-git-insights        # Disable git insights
projector --no-interactive         # Disable interactive prompts

# Configuration
projector init                     # Interactive configuration wizard
projector config --print           # Print merged config as YAML
projector config --path            # Show config file path

# Cache management
projector cache                    # Show cache statistics
projector cache --clear            # Clear all cached data
projector cache --prune            # Remove old cache entries

# Jump to project (print path or cd command)
projector jump --select            # Interactive selection, print path
projector jump --name api          # Find project by name
projector jump --select --print-cd # Emit shell cd command

# Open in editor
projector open --select --editor code        # Open in VS Code
projector open --name web --editor webstorm  # Open specific project
projector open --select --dry-run            # Show command only

# Shell integration (install wrapper for cd-in-place)
projector shell --install          # Install wrapper to detected rc file
projector shell --install --dry-run # Preview changes
projector shell --remove           # Remove wrapper
projector shell --install --shell fish  # Override shell detection

# Templates (scaffolding)
projector template list                        # Show available templates
projector template apply node-service ./api    # Scaffold with defaults
projector template apply --init                # Interactive prompts
projector template add --from ./scaffold --id custom-api
```

## Key Implementation Details

### Root Detection & Monorepo Awareness

**RootSignalScorer** (`src/lib/discovery/root-scorer.ts`) scores directories based on multiple signals:

- **Strong signals** (+100): Manifests (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.), monorepo markers (`pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `go.work`)
- **Lockfiles** (+60 when `lockfilesAsStrong: true`): `pnpm-lock.yaml`, `Cargo.lock`, `poetry.lock`, etc.
- **VCS** (+30 baseline, +50 extra with manifest when `stopAtVcsRoot: true`): `.git` directory
- **Docs-first** (+60): Top-level `docs/` with markdown files
- **Structure** (+40): Presence of `src/`, `app/`, `lib/`, `tests/`
- **Code threshold** (+30): Meets `minCodeFilesToConsider` code files
- **Negative** (−50): Only vendored/build/example directories

Roots are accepted when score ≥ 60. Scanner stops descending at strong roots unless monorepo markers are present. When `includeNestedPackages: 'when-monorepo'` (default), scanner follows workspace globs like `packages/*` in monorepos.

### Project Type Detection

Detects by manifest files in `src/lib/discovery/detector.ts`:
- **Node.js**: `package.json`
- **Python**: `pyproject.toml`, `requirements.txt`, `setup.py`
- **Rust**: `Cargo.toml`
- **Go**: `go.mod`, `go.work`
- **PHP**: `composer.json`
- **Java**: `pom.xml`, `build.gradle`

### Status Analysis Process

In `src/lib/tracking/analyzer.ts`:
1. **Tracking Files**: Looks for CLAUDE.md, epics.md, project_plan.md, *.todo files
2. **Phase Detection**: Parses phase information (e.g., "Phase 2/5") from tracking content
3. **Version Analysis**: Checks package.json, Cargo.toml for version numbers (1.0+ = stable)
4. **Activity Analysis**: Recent git commits and file modifications
5. **Status Types**: phase, stable, active, archived, unknown

### Git Insights

When `gitInsights.enabled: true`, `src/lib/git/analyzer.ts` collects:
- Current branch and last commit details (SHA, author, subject, age)
- Commit counts in configurable windows (`activityWindowDays`, `shortWindowDays`)
- Upstream divergence (ahead/behind counts)
- Stale branch detection (`staleBranchThresholdDays`)
- Results cached per head SHA + branch fingerprint with TTL (`cacheTtlHours`)

Table gains a `Git` column; `--verbose` shows expanded git summary.

### Configuration System

Config location: `~/.config/projector/config.yaml` (XDG spec)

Key config blocks:
- **Scanning**: `scanDirectory`, `maxDepth`, `ignorePatterns`, `codeFileExtensions`
- **Root detection**: `rootMarkers`, `monorepoMarkers`, `lockfilesAsStrong`, `minCodeFilesToConsider`, `stopAtVcsRoot`, `includeNestedPackages`
- **Interactive**: `defaultInteractive`, `defaultEditor`, `cdSentinel`
- **Git insights**: `gitInsights.enabled`, `activityWindowDays`, `staleBranchThresholdDays`, etc.
- **Templates**: `templatesDir`, `templates[]`
- **Colors**: `colorScheme` for table formatting

## Common Development Tasks

### Running Tests

```bash
pnpm test                              # Run full test suite
pnpm test:watch                        # Watch mode
pnpm test -- test/scanner-package-root.test.ts  # Single file
pnpm test -- --testNamePattern="monorepo"       # Pattern match
pnpm test -- --coverage                # With coverage
```

Test files are in `test/` directory. Key test suites:
- `scanner-package-root.test.ts` - Early stop at package.json roots
- `root-scorer.test.ts` - Signal scoring and workspace globs
- `scanner-monorepo-docs.test.ts` - Monorepo traversal and docs-first projects
- `jump-utils.test.ts`, `open-utils.test.ts` - Command utilities
- `shell-wrapper.test.ts` - Shell integration
- `template-*.test.ts` - Template system

See `docs/TESTING.md` for detailed testing guide including mocking strategies.

### Build Process

```bash
pnpm build     # TypeScript compile + copy templates (scripts/copy-templates.js)
pnpm clean     # Remove dist/ and oclif.manifest.json
```

Build runs two steps:
1. TypeScript compilation: `tsc --project tsconfig.json --outDir dist`
2. Template copying: `node scripts/copy-templates.js` (copies `src/templates/` to `dist/templates/`)

### Debugging the CLI

```bash
pnpm dev list --verbose                  # Run without build via tsx
pnpm dev list --directory ~/test --depth 3
pnpm dev list --clear-cache --verbose    # Debug cache behavior
pnpm dev jump --select                   # Debug jump command
```

### Working with Types

All core types are in `src/lib/types.ts`. When adding features:
1. Update enums/interfaces in `types.ts` first
2. Implement logic in appropriate module
3. Update detector/analyzer if adding project types or tracking patterns
4. Add tests in `test/`
5. Strict TypeScript enforced - all functions must have type annotations

### Adding New Root Signals

To add new root detection signals:
1. Update `RootSignalScorer` in `src/lib/discovery/root-scorer.ts`
2. Add file patterns to `collectSignals()` method
3. Adjust scoring weights in `scoreSignals()`
4. Add tests in `test/root-scorer.test.ts`
5. Document in config if user-configurable

### Adding New Commands

1. Create `src/commands/<name>.ts` extending oclif `Command`
2. Add utility helpers to `src/lib/commands/<name>-utils.ts` for testability
3. Add tests in `test/<name>-utils.test.ts`
4. Update `package.json` oclif.commands if needed
5. Document in README.md and CLAUDE.md

### Performance Notes

- Caching based on directory modification times (`mtime`)
- Git insights cached per head SHA + branch fingerprint with TTL
- Large scans (>50 projects) show progress indicators
- Use `--verbose` to see cache hit rates and performance metrics
- Cache directory: OS-appropriate (macOS: `~/Library/Caches/projector`)

## Interactive Features & Shell Integration

### Interactive Action Flow

When running in a TTY, `projector` (or `projector list`) enters interactive mode:
1. Displays projects table
2. Prompts to select a project
3. Prompts to choose action: open in editor, change directory, or print path

Control via flags:
- `--interactive` - Force enable
- `--no-interactive` - Disable
- Default: enabled when both stdin/stdout are TTYs and `config.defaultInteractive: true`

### Shell Wrapper for cd-in-place

To change your shell's directory (not just a subshell), install the wrapper:

```bash
projector shell --install          # Detects shell and updates rc file
projector shell --install --dry-run # Preview changes
projector shell --remove           # Uninstall wrapper
```

The wrapper detects the sentinel pattern `__PROJECTOR_CD__ <path>` and changes directory. Supports bash, zsh, fish, and PowerShell.

Example for manual installation (zsh/bash):
```bash
# Add to ~/.zshrc or ~/.bashrc
function projector() {
  local out
  out="$(command projector "$@")" || return
  if [[ "$out" == __PROJECTOR_CD__* ]]; then
    cd "${out#__PROJECTOR_CD__ }"
  else
    printf '%s\n' "$out"
  fi
}
```

### Editor Support

Supported editors in `src/lib/commands/open-utils.ts`:
- **Terminal**: vim, nvim, emacs, nano, micro, helix
- **GUI**: code (VS Code), cursor, subl (Sublime), atom, webstorm, idea, pycharm, goland, phpstorm

Editor selection priority:
1. `--editor` flag
2. `config.defaultEditor`
3. `$VISUAL` or `$EDITOR` environment variables
4. Falls back to `vim`

### Template System

Templates are reusable project scaffolds with variable substitution:

**Built-in templates**: `src/templates/` (node-service, docs-site)
**User templates**: Defined in `config.templates[]`

Template structure:
```
template-name/
├── package.json        # Files with {{variable}} placeholders
├── README.md
├── src/
│   └── index.ts
└── .projector-template.json  # Optional metadata
```

Variables are prompted interactively or passed via CLI. Post-commands run after scaffolding (e.g., `npm install`).

## Additional Documentation

- `docs/architecture.md` - Detailed system architecture with data flows
- `docs/TESTING.md` - Testing guide with mocking strategies
- `docs/templates.md` - Template system documentation
- `docs/config.md` - Configuration reference
- `docs/PERFORMANCE.md` - Performance analysis
- `docs/*.md` - Implementation plans for features
