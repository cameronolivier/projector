# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

The **projector** is a TypeScript/Node.js CLI tool that scans development directories to discover projects and display them in a beautiful table format with intelligent status tracking. Built with the oclif framework, it analyzes project types (Node.js, Python, Rust, Go, PHP, Java) and completion status through tracking files like CLAUDE.md, epics.md, and project_plan.md. The package is named `projector` and provides the globally available `projector` command.

## Development Commands

**Prerequisites:**
```bash
nvm use                   # Use Node LTS from .nvmrc (lts/jod)
pnpm install             # Install dependencies (requires pnpm v10+)
```

**Development workflow:**
```bash
pnpm dev                 # Run CLI via tsx src/index.ts (no build required)
pnpm link                # Make 'projector' command globally available
pnpm unlink              # Remove global link

# Testing & Quality
pnpm test                # Jest test suite
pnpm test:watch          # Jest in watch mode
pnpm lint:check          # ESLint with --max-warnings=0
pnpm lint:fix            # Auto-fix linting issues
pnpm prettier:check      # Check code formatting
pnpm prettier:write      # Apply formatting
pnpm typecheck           # TypeScript type checking (tsc --noEmit)

# Production build
pnpm build               # Compile TypeScript to dist/ directory
pnpm clean               # Remove dist/ and oclif.manifest.json
```

**Single test execution:**
```bash
pnpm test -- scanner.test.ts                          # Run specific test file
pnpm test -- --testNamePattern="should detect"        # Run tests matching pattern
pnpm test -- --coverage                              # Run with coverage report
```

## Architecture & Code Organization

### Modular CLI Architecture
```
src/
├── index.ts              # oclif entry point
├── commands/             # CLI command implementations
│   ├── list.ts          # Main project listing command (default)
│   └── cache.ts         # Cache management commands
└── lib/
    ├── types.ts         # Core TypeScript interfaces and enums
    ├── discovery/       # File system scanning and project detection
    │   ├── scanner.ts   # Recursive directory traversal
    │   └── detector.ts  # Project type identification
    ├── tracking/        # Status analysis from tracking files
    │   └── analyzer.ts  # Phase detection and completion analysis
    ├── output/          # Table generation and formatting
    │   └── table.ts     # Colored table output with cli-table3
    ├── config/          # YAML configuration management
    │   └── config.ts    # XDG-compliant configuration system
    └── cache/           # Performance caching system
        └── manager.ts   # Directory modification-based caching
```

### Key Data Flow
Scanner finds directories → Detector identifies project types → Analyzer reads tracking files → Table generator formats output with caching for performance optimization.

### Core Type System
Located in `src/lib/types.ts`:

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

## CLI Usage & Commands

The default command is `list` (runs when you type `projector`):

```bash
# Setup and Configuration
projector init                     # Interactive configuration wizard
projector init --force             # Force overwrite existing config

# Default usage (runs 'list' by default)
projector                          # Scan default directory
projector --directory ~/code       # Scan specific directory
projector --depth 3                # Custom scan depth (default: 10)
projector --verbose                # Show progress details and cache statistics
projector --no-cache              # Force fresh analysis, skip cache
projector --clear-cache           # Clear cache before scanning

# Cache management
projector cache                   # Show cache statistics
projector cache --clear           # Clear all cached data
projector cache --prune           # Remove old cache entries
```

## Project Detection Strategy

### Strong Project Indicators (Definitive)
- **Node.js:** `package.json`
- **Rust:** `Cargo.toml`  
- **Go:** `go.mod`
- **Python:** `requirements.txt`, `setup.py`, `pyproject.toml`
- **PHP:** `composer.json`
- **Java:** `pom.xml`, `build.gradle`
- **Build Systems:** `Makefile`, `CMakeLists.txt`
- **Git Repository:** `.git` directory

### Scanning Behavior
- Recursive traversal with configurable depth limits (default: 2 levels)
- Intelligent ignore patterns: `node_modules`, `.git`, `dist`, `target`, etc.
- Parallel processing with concurrency limits for performance
- Symlink handling with cycle detection
- Cache invalidation based on directory modification times

## Status Analysis System

### Tracking File Detection
1. **CLAUDE.md** - Phase information (e.g., "Phase 2/5")
2. **project_plan.md** - Task completion tracking with checkboxes
3. **epics.md** - Epic-level project tracking
4. ***.todo files** - TODO counting and analysis

### Status Types
- **phase**: Actively tracked project with explicit phase information
- **stable**: Version 1.0+ indicating completed/stable project
- **active**: Recent git activity or file modifications
- **archived**: No recent activity, older projects
- **unknown**: No tracking files or status indicators found

### Version-Based Analysis
Extracts version information from:
- `package.json` for Node.js projects
- `Cargo.toml` for Rust projects
- Git tags and commit activity for recency analysis

## Configuration System

### Location & Format
- **Config Path:** `~/.config/projector/config.yaml` (XDG Base Directory spec)
- **Format:** YAML with full type safety and validation
- **Auto-creation:** Creates default configuration on first run

### Configurable Options
- `scanDirectory`: Base directory for project scanning
- `maxDepth`: Maximum recursion depth for directory traversal
- `trackingPatterns`: Custom patterns for tracking file detection
- `descriptions`: Manual project descriptions override
- `ignorePatterns`: Additional directories to skip during scanning
- `colorScheme`: Customizable colors for table output

## Performance & Caching

### Caching Strategy
- **Cache Location:** OS-appropriate cache directory
- **Invalidation:** Based on directory modification times (24-hour TTL)
- **Performance:** Sub-second execution for typical directories with cache hits
- **Statistics:** Cache hit rates and performance metrics available with `--verbose`

### Performance Targets
- **Discovery:** <500ms for 50 projects
- **Analysis:** <300ms for tracked projects  
- **Total Execution:** <1s for typical `/dev` directory structure

### Memory Management
- Concurrent operation limits to prevent resource exhaustion
- Batch processing for large directory structures
- Progress indicators for operations >5 projects

## Common Development Patterns

### Adding New Project Types
1. Update `ProjectType` enum in `src/lib/types.ts`
2. Add detection logic in `src/lib/discovery/detector.ts`
3. Update strong indicators in `scanner.ts` 
4. Add test cases for new project type

### Custom Tracking Patterns
1. Define new `TrackingType` in `types.ts`
2. Add parser function in `config.ts`
3. Update default patterns in configuration
4. Implement analysis logic in `analyzer.ts`

### Debugging & Development
```bash
# Debug with verbose output
pnpm dev list --verbose

# Test specific directories  
pnpm dev list --directory ~/test-projects

# Debug cache behavior
pnpm dev list --clear-cache --verbose

# Add console.log statements and run directly with tsx
```

## Error Handling & Edge Cases

### Graceful Degradation
- **Permission Issues:** Skip inaccessible directories with warnings
- **Corrupted Files:** Continue analysis, mark as unknown status
- **Missing Dependencies:** Fallback to partial analysis
- **Large Directories:** Progress indicators and batch processing

### File System Safety
- Respects directory permissions and symlink handling
- Validates file paths to prevent traversal attacks
- Limits file size for analysis to prevent memory issues
- Handles cross-platform path differences correctly

## TypeScript Configuration

The project uses strict TypeScript settings:
- **Target:** ES2022 with CommonJS modules
- **Strict Mode:** Enabled with full type checking
- **Decorators:** Experimental decorators enabled for oclif
- **Source Maps:** Generated for debugging support
- **Declaration Files:** Generated for library consumption
