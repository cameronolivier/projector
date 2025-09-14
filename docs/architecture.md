# Technical Architecture

## System Overview

The **projects CLI** tool follows a modular, layered architecture designed for maintainability, testability, and extensibility. The system processes file system data through a clear pipeline: Discovery → Analysis → Formatting → Display.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Entry Point                         │
│                     (src/index.ts)                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                    Command Layer                               │
│                (src/commands/list.ts)                        │  
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┴──────────────┐
         │                           │
┌────────▼──────────┐      ┌─────────▼──────────┐
│   Discovery Layer │      │   Output Layer     │
│                   │      │                    │
│ • ProjectScanner  │      │ • TableGenerator   │
│ • TypeDetector    │      │ • ColorFormatter   │
│ • FileSystemUtils │      │ • StatusRenderer   │
└────────┬──────────┘      └─────────▲──────────┘
         │                           │
┌────────▼───────────────────────────┴─────────┐
│              Analysis Layer                  │
│                                              │
│ • TrackingAnalyzer  • DescriptionExtractor  │
│ • StatusCalculator  • ConfigurationManager  │
└──────────────────────────────────────────────┘
```

## Core Modules

### 1. Discovery Layer (`src/lib/discovery/`)

#### ProjectScanner (`scanner.ts`)
**Purpose**: File system traversal and project identification
```typescript
interface ProjectScanner {
  scanDirectory(path: string, options: ScanOptions): Promise<ProjectDirectory[]>
  isProjectDirectory(path: string): boolean
  shouldIgnoreDirectory(path: string): boolean
}

interface ScanOptions {
  maxDepth: number
  ignorePatterns: string[]
  followSymlinks: boolean
}
```

**Responsibilities**:
- Recursive directory traversal with depth limits
- Application of ignore patterns (node_modules, .git, etc.)
- Symlink handling with cycle detection
- Parallel directory processing for performance

#### TypeDetector (`detector.ts`)
**Purpose**: Project type and language identification
```typescript
interface TypeDetector {
  detectProjectType(directory: ProjectDirectory): ProjectType
  detectLanguages(directory: ProjectDirectory): string[]
  hasGitRepository(directory: ProjectDirectory): boolean
}

enum ProjectType {
  NodeJS = 'nodejs',
  Python = 'python', 
  Rust = 'rust',
  Go = 'go',
  PHP = 'php',
  Unknown = 'unknown'
}
```

**Detection Strategy**:
- Manifest files: `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`
- Build files: `Makefile`, `CMakeLists.txt`, `build.gradle`
- Configuration files: `.eslintrc`, `tsconfig.json`, `setup.py`
- Directory patterns: `src/`, `lib/`, `cmd/`

### 2. Analysis Layer (`src/lib/tracking/`)

#### TrackingAnalyzer (`analyzer.ts`)
**Purpose**: Project completion status determination
```typescript
interface TrackingAnalyzer {
  analyzeProject(directory: ProjectDirectory): Promise<ProjectStatus>
  detectTrackingFiles(directory: ProjectDirectory): TrackingFile[]
  parsePhaseInformation(content: string): PhaseInfo | null
}

interface ProjectStatus {
  type: 'phase' | 'stable' | 'active' | 'archived' | 'unknown'
  details: string
  confidence: number
}
```

**Analysis Methods**:
1. **Phase Tracking**: Parse CLAUDE.md, project_plan.md for explicit phases
2. **Version Analysis**: Extract version from package.json, Cargo.toml
3. **Activity Analysis**: Git commit recency, file modification dates
4. **TODO Analysis**: Count and categorize TODO comments in tracking files

#### PatternMatcher (`patterns.ts`)
**Purpose**: Configurable pattern matching for tracking files
```typescript
interface PatternMatcher {
  getDefaultPatterns(): TrackingPattern[]
  matchPatterns(files: string[], patterns: TrackingPattern[]): Match[]
  parseTrackingContent(file: string, type: TrackingType): TrackingInfo
}

interface TrackingPattern {
  pattern: string
  type: TrackingType
  parser: (content: string) => TrackingInfo
}
```

### 3. Output Layer (`src/lib/output/`)

#### TableGenerator (`table.ts`)
**Purpose**: Beautiful formatted table creation
```typescript
interface TableGenerator {
  generateTable(projects: AnalyzedProject[]): string
  formatRow(project: AnalyzedProject): TableRow
  applyColorScheme(table: Table, scheme: ColorScheme): Table
}

interface ColorScheme {
  header: ChalkFunction
  phaseStatus: ChalkFunction
  stableStatus: ChalkFunction
  unknownStatus: ChalkFunction
  projectName: ChalkFunction
}
```

**Table Features**:
- Dynamic column width adjustment
- Unicode box characters for professional appearance
- Color coding based on project status
- Pagination for large result sets
- Summary statistics footer

### 4. Configuration Layer (`src/lib/config/`)

#### ConfigurationManager (`config.ts`)
**Purpose**: User configuration and customization
```typescript
interface ConfigurationManager {
  loadConfig(): Promise<ProjectsConfig>
  saveConfig(config: ProjectsConfig): Promise<void>
  getDefaultConfig(): ProjectsConfig
  mergeWithDefaults(userConfig: Partial<ProjectsConfig>): ProjectsConfig
}

interface ProjectsConfig {
  scanDirectory: string
  maxDepth: number
  trackingPatterns: TrackingPattern[]
  descriptions: Record<string, string>
  ignorePatterns: string[]
  colorScheme: ColorScheme
}
```

## Data Models

### Core Types

#### ProjectDirectory
```typescript
interface ProjectDirectory {
  name: string
  path: string
  type: ProjectType
  languages: string[]
  hasGit: boolean
  files: string[]
  lastModified: Date
}
```

#### AnalyzedProject
```typescript
interface AnalyzedProject extends ProjectDirectory {
  status: ProjectStatus
  description: string
  trackingFiles: TrackingFile[]
  confidence: number
}
```

#### TrackingFile
```typescript
interface TrackingFile {
  path: string
  type: TrackingType
  content: TrackingInfo
  lastModified: Date
}

enum TrackingType {
  ProjectPlan = 'project_plan',
  Epics = 'epics',
  Claude = 'claude',
  Todo = 'todo',
  Custom = 'custom'
}
```

## Performance Considerations

### Optimization Strategies

1. **Parallel Processing**
   - Concurrent directory scanning
   - Parallel file reading for analysis
   - Worker threads for CPU-intensive tasks

2. **Caching Strategy**
   ```typescript
   interface CacheEntry {
     projects: AnalyzedProject[]
     timestamp: Date
     directoryHash: string
   }
   ```
   - Cache results based on directory modification times
   - Invalidate cache when directory structure changes
   - LRU eviction for memory management

3. **Lazy Loading**
   - Load project details only when displaying
   - Stream results for large directories
   - Progressive table rendering

4. **Memory Management**
   - Limit concurrent file operations
   - Process projects in batches
   - Release resources after analysis

### Performance Targets

- **Discovery Phase**: <500ms for 50 projects
- **Analysis Phase**: <300ms for tracked projects
- **Rendering Phase**: <100ms for table generation
- **Total Execution**: <1s for typical `/dev` directory

## Error Handling Strategy

### Error Categories

1. **File System Errors**
   - Permission denied: Skip directory with warning
   - File not found: Continue with partial data
   - Path too long: Truncate with indication

2. **Configuration Errors**
   - Invalid YAML: Use defaults with warning
   - Missing config: Create default configuration
   - Permission to config directory: Fallback to in-memory

3. **Analysis Errors**
   - Corrupted tracking files: Mark as unknown
   - Invalid JSON/YAML: Skip specific file
   - Git repository issues: Disable git features

### Error Recovery

```typescript
interface ErrorHandler {
  handleError(error: Error, context: ErrorContext): ErrorResponse
  shouldContinue(error: Error): boolean
  logError(error: Error, context: ErrorContext): void
}

enum ErrorResponse {
  Skip = 'skip',
  Retry = 'retry', 
  Fail = 'fail',
  UseDefault = 'use_default'
}
```

## Testing Strategy

### Test Architecture

1. **Unit Tests** (`*.test.ts`)
   - Individual module functionality
   - Mock file system operations
   - Test error conditions

2. **Integration Tests** (`*.integration.test.ts`)
   - End-to-end command execution
   - Real file system operations
   - Configuration loading

3. **Performance Tests** (`*.perf.test.ts`)
   - Execution time benchmarks
   - Memory usage validation
   - Scalability testing

### Test Data Strategy

```
test/
├── fixtures/
│   ├── sample-projects/
│   │   ├── nodejs-project/
│   │   ├── rust-project/
│   │   └── tracked-project/
│   └── configs/
│       ├── default.yaml
│       └── custom.yaml
└── mocks/
    ├── fs-mock.ts
    └── git-mock.ts
```

## Security Considerations

### File System Access
- Respect directory permissions
- Validate all file paths
- Prevent directory traversal attacks
- Limit file size for analysis

### Configuration Security
- Validate configuration file permissions (0600)
- Sanitize user-provided patterns
- Prevent code injection in custom parsers

## Extensibility Design

### Plugin Architecture (Future)
```typescript
interface AnalyzerPlugin {
  name: string
  version: string
  canAnalyze(directory: ProjectDirectory): boolean
  analyze(directory: ProjectDirectory): Promise<ProjectStatus>
}

interface PluginManager {
  loadPlugin(path: string): Promise<AnalyzerPlugin>
  registerPlugin(plugin: AnalyzerPlugin): void
  getApplicablePlugins(directory: ProjectDirectory): AnalyzerPlugin[]
}
```

### Custom Patterns
- User-defined tracking file patterns
- Custom status calculation logic
- Configurable description extraction rules

This architecture provides a solid foundation for the projects CLI while maintaining flexibility for future enhancements and ensuring maintainable, testable code.

## CLI Usage & Commands

```bash
# Setup and Configuration
projector init                     # Interactive configuration wizard
projector init --force             # Force overwrite existing config

# Scanning
projector                          # Scan default directory
projector --directory ~/code       # Scan a specific directory
projector --depth 3                # Custom scan depth
projector --verbose                # Show progress details
projector --no-cache               # Force fresh analysis
projector --clear-cache            # Clear cache before scanning

# Interactive Selection
projector --select                 # Pick a project after scan; prints path
projector --select --path-only     # Print only selected path (no table)
projector --select --format json   # Print selected project as JSON

# Cache Management
projector cache                    # Show cache statistics
projector cache --clear            # Clear all cached data
projector cache --prune            # Remove old cache entries
```

Notes:
- `--select` requires a TTY; in non-interactive environments it is ignored with a warning.
