# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The **projects CLI** is a TypeScript/Node.js tool that scans directories for development projects and displays them in a beautiful table with status tracking. It uses oclif framework and scans `/dev` directories to discover projects, detect their types (Node.js, Python, Rust, etc.), and analyze completion status through tracking files like CLAUDE.md, epics.md, etc.

## Architecture

This is a modular CLI with clear separation of concerns:

- **Entry Point**: `src/index.ts` - Basic oclif runner
- **Commands**: `src/commands/` - CLI command implementations (list.ts, cache.ts)
- **Discovery**: `src/lib/discovery/` - File system scanning and project type detection
- **Tracking**: `src/lib/tracking/` - Status analysis from tracking files
- **Output**: `src/lib/output/` - Table generation and formatting
- **Config**: `src/lib/config/` - YAML configuration management
- **Cache**: `src/lib/cache/` - Performance caching system
- **Types**: `src/lib/types.ts` - Core TypeScript interfaces and enums

The main data flow: Scanner finds directories → Detector identifies project types → Analyzer reads tracking files → Table generator formats output.

## Development Commands

```bash
# Prerequisites
nvm use                   # Use Node LTS from .nvmrc (lts/jod)
pnpm install             # Install dependencies (requires pnpm v10+)

# Development
pnpm dev                 # Run CLI via tsx src/index.ts (no build)
pnpm link                # Make 'projects' command globally available
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

## CLI Usage

The default command is `list` (runs when you type `projects`):

```bash
projects                           # Scan default directory
projects --directory ~/code        # Scan specific directory  
projects --depth 3                 # Custom scan depth
projects --verbose                 # Show progress details
projects --no-cache               # Force fresh analysis
projects --clear-cache            # Clear cache first

projects cache:clear              # Clear all cached data
projects cache:status             # Show cache statistics
```

## Key Implementation Details

### Project Detection Strategy
- Scans file system with configurable depth (default: 2 levels)
- Detects project types by manifest files: `package.json` (Node.js), `Cargo.toml` (Rust), `go.mod` (Go), etc.
- Ignores common build/cache directories: `node_modules`, `.git`, `dist`, `target`, etc.
- Uses caching based on directory modification times for performance

### Status Analysis Process
1. **Tracking Files**: Looks for CLAUDE.md, epics.md, project_plan.md, *.todo files
2. **Phase Detection**: Parses phase information (e.g., "Phase 2/5") from tracking content
3. **Version Analysis**: Checks package.json, Cargo.toml for version numbers (1.0+ = stable)
4. **Activity Analysis**: Recent git commits and file modifications
5. **Status Types**: phase, stable, active, archived, unknown

### Configuration System
- Config location: `~/.config/projects/config.yaml` (XDG spec)
- Configurable: scan directory, depth, tracking patterns, ignore patterns, descriptions, colors
- Default scan directory: `/Users/cam/nona-mac/dev`

## Common Development Tasks

### Running Tests
```bash
# Run single test file
pnpm test -- scanner.test.ts

# Run tests matching pattern  
pnpm test -- --testNamePattern="should detect"

# Run with coverage report
pnpm test -- --coverage
```

### Debugging the CLI
```bash
# Add console.log statements and run directly
pnpm dev list --verbose

# Test specific directory
pnpm dev list --directory ~/test-projects

# Debug cache behavior
pnpm dev list --clear-cache --verbose
```

### Working with Types
All core types are in `src/lib/types.ts`. When adding new project types or tracking patterns, update the enums there first. The codebase uses strict TypeScript - all functions must have proper type annotations.

### Adding New Project Types
1. Add to `ProjectType` enum in `types.ts`
2. Update detection logic in `src/lib/discovery/detector.ts`  
3. Add test cases for the new type

### Performance Notes
- The tool caches analysis results based on directory modification times
- Large directories (>50 projects) show progress indicators
- Use `--verbose` flag to see cache hit rates and performance metrics
- Cache is stored in OS-appropriate cache directory
