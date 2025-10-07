# Project Development Plan

## Overview
The **manage-projects-cli** tool development follows a structured 4-phase approach designed to deliver immediate value while allowing for future extensibility. The package is named `manage-projects-cli` but provides the `projects` command.

## Development Phases

### Phase 1: Core Foundation ✅ COMPLETE
**Objective**: Establish solid foundation with basic functionality

#### Deliverables
- [x] Project scaffold with oclif + TypeScript setup
- [x] Complete documentation structure
- [x] Basic CLI entry point and command structure (`src/index.ts`, `src/commands/list.ts`)
- [x] Core project discovery engine (`src/lib/discovery/scanner.ts`)
- [x] File system scanning logic with recursive traversal and ignore patterns
- [x] Basic project type detection (`src/lib/discovery/detector.ts`)
 c
#### Success Criteria ✅ ALL MET
- [x] `projects --help` works correctly
- [x] Can discover and list project directories in `/dev`
- [x] Basic project types identified (Node.js, Python, Rust, Go, PHP, Java)

#### Implemented Features Beyond Plan
- Intelligent caching system (`src/lib/cache/manager.ts`)
- Comprehensive project type detection with version extraction
- Git repository detection and remote info extraction
- Symlink handling with cycle detection
- Parallel directory processing with concurrency limits

### Phase 2: Detection & Analysis ✅ COMPLETE  
**Objective**: Implement core analysis capabilities

#### Deliverables
- [x] Tracking status detection system (`src/lib/tracking/analyzer.ts`)
- [x] Description extraction from multiple sources (README, package.json, tracking files)
- [x] Configuration system (`src/lib/config/config.ts`) 
- [x] Advanced table output with colors and formatting (`src/lib/output/table.ts`)

#### Success Criteria ✅ ALL MET
- [x] Detects project tracking files (CLAUDE.md, epics.md, project_plan.md, *.todo)
- [x] Extracts project descriptions from README/package.json/tracking files
- [x] Shows detailed status information (phase tracking, version analysis, TODO counts)
- [x] Full YAML configuration file support with XDG compliance

#### Implemented Features Beyond Plan
- Phase parsing from tracking files (e.g., "Phase 2/5")
- Version-based status analysis (stable vs active)
- TODO counting and analysis
- Custom tracking pattern support
- Cache management command (`src/commands/cache.ts`)

### Phase 3: Polish & UX ✅ COMPLETE
**Objective**: Create beautiful, production-ready output

#### Deliverables
- [x] Beautiful colored table output with cli-table3
- [x] Comprehensive error handling and graceful degradation
- [x] Performance optimization with intelligent caching
- [x] Rich CLI features (verbose mode, cache management, etc.)

#### Success Criteria ✅ ALL MET
- [x] Table output is visually appealing with proper colors and status icons
- [x] Handles edge cases gracefully (permissions, corrupted files, missing directories)
- [x] Performance is sub-second for typical directory sizes with caching
- [x] Complete command structure with help system

#### Implemented Features Beyond Plan
- Cache statistics and management
- Progress indicators for large directories
- Status confidence scoring
- Compact and detailed view modes
- Color-coded project types and status indicators
- Summary statistics in output

### Phase 4: Enhanced Project Discovery ✅ COMPLETE
**Objective**: Implement enhanced recursive project discovery with improved root detection logic

#### Deliverables
- [x] Enhanced project root detection with code file extensions as strong indicators
- [x] Node.js projects detected by node_modules directory presence
- [x] Configurable code file extensions for user customization
- [x] Increased default depth limit from 2 to 10 for true recursive behavior
- [x] Removed weak indicator logic and depth-based limitations for code files
- [x] Updated configuration system to support codeFileExtensions array

#### Success Criteria ✅ ALL MET
- [x] Discovers projects at any reasonable depth without manual depth configuration
- [x] Correctly identifies project roots by code files (.ts, .py, .php, etc.)
- [x] Treats directories with node_modules as project roots
- [x] Maintains excellent performance even with deep directory structures
- [x] Preserves existing functionality for manifest-file-based detection

#### Implemented Features
- **Enhanced Code File Detection**: Added comprehensive list of code file extensions (.ts, .js, .py, .php, .go, .rs, .java, .c, .cpp, .cs, .rb, .swift, .dart, .vue, .svelte, .html, .css, .sh, .ps1, .bat, etc.)
- **Node.js Root Detection**: Directories containing node_modules folder are automatically identified as project roots
- **Configurable Extensions**: Users can customize code file extensions via `~/.config/projects/config.yaml`
- **Deep Recursive Scanning**: Default depth increased to 10 levels for comprehensive project discovery
- **Simplified Logic**: Removed complex weak indicator logic in favor of clear, strong indicators

## Current Project Status: Phase 4 COMPLETE ✅

**The manage-projects-cli has exceeded initial expectations and completed all core functionality through Phase 4:**

### What Works Right Now
1. **Enhanced Project Discovery**: Recursively scans directories with enhanced root detection
2. **Code File Detection**: Automatically detects projects by code file extensions (.ts, .js, .py, .php, etc.)
3. **Node.js Root Detection**: Identifies project roots by node_modules directory presence
4. **Deep Recursive Scanning**: Scans up to 10 levels deep by default for comprehensive discovery
5. **Comprehensive Type Detection**: Supports Node.js, Python, Rust, Go, PHP, Java projects
6. **Advanced Status Analysis**: Phase tracking, version analysis, TODO counting
7. **Beautiful Output**: Color-coded table with status icons and project type indicators
8. **Performance Optimized**: Intelligent caching with 24-hour invalidation
9. **Rich Configuration**: YAML config with customizable code file extensions and patterns
10. **Cache Management**: Full cache statistics and management commands
11. **Robust Error Handling**: Graceful degradation for permissions and file system issues

### Beyond Original Plan
The implementation significantly exceeds the original Phase 1-4 scope:
- **Caching System**: Not planned until later but fully implemented
- **Advanced Parsing**: Phase information extraction from tracking files  
- **Version Analysis**: Automatic version detection across project types
- **Confidence Scoring**: Status reliability indicators
- **Progress Indicators**: Real-time progress for large directories
- **Cache Statistics**: Detailed performance metrics and hit rates
- **Enhanced Discovery**: Deep recursive scanning with code file detection
- **Configurable Extensions**: User-customizable code file extension lists
- **Smart Root Detection**: Multiple strategies for identifying project roots

## Technical Implementation Strategy

### Development Approach
1. **Test-Driven Development**: Write tests before implementation where possible
2. **Incremental Delivery**: Each phase produces working, usable software
3. **Documentation First**: Keep documentation current with implementation
4. **Performance Awareness**: Profile and optimize from the start

### Quality Gates
Each phase requires:
- [ ] All tests passing
- [ ] ESLint/Prettier compliance
- [ ] TypeScript strict mode compliance
- [ ] Documentation updates
- [ ] Manual testing on sample projects

### Risk Management

#### Technical Risks
- **File System Performance**: Large directories may cause slowdowns
  - *Mitigation*: Implement depth limits and ignore patterns
- **Permission Issues**: May not be able to read all directories
  - *Mitigation*: Graceful error handling and user feedback
- **Cross-Platform Compatibility**: Path handling differences
  - *Mitigation*: Use Node.js path utilities consistently

#### Scope Risks
- **Feature Creep**: Tendency to add too many features early
  - *Mitigation*: Strict phase boundaries, defer non-essential features
- **Perfect UX**: Over-engineering the display format
  - *Mitigation*: Start simple, iterate based on real usage

## Success Metrics

### Phase 1 Success Metrics
- Discovers all projects in `/dev` directory correctly
- Identifies project types with >90% accuracy
- Execution time <2 seconds for typical directory structure

### Phase 2 Success Metrics  
- Detects tracking files in projects that have them
- Extracts meaningful descriptions for >80% of projects
- Configuration system handles user customizations

### Phase 3 Success Metrics
- Visual output receives positive feedback
- No crashes on edge cases during manual testing
- Performance maintains sub-second execution

### Overall Success Metrics
- Daily usage by developer after initial setup
- Saves time in project discovery/management tasks  
- Easily extensible for future features

## Dependencies & Prerequisites

### External Dependencies
- Node.js 20+ LTS environment
- pnpm package manager v10+
- Access to `/dev` directory structure

### Internal Dependencies
- Consistent project structure in `/dev` directory
- Some projects with tracking files for testing
- Understanding of project types and patterns


## Phase 5: Enhanced Visual Organization & UX
**Objective**: Improve visual organization and user experience with tags, sorting, and refined status system

### Feature 0014: Parent Directory Tags with Color Schemes
**Status**: Pending
**Plan**: `docs/0014-parent-directory-tags-with-color-schemes-plan.md`

#### Deliverables
- [ ] Extract parent directory name as visual tag for each project
- [ ] Stable color assignment using hash-based palette selection
- [ ] Badge-style tag rendering with background colors
- [ ] Configuration options for tag display (enabled, style, maxLength)
- [ ] Tag extraction handles edge cases (root-level, deep nesting)
- [ ] Tests for tag extraction, color consistency, and formatting
- [ ] Updated table output with tags before project names

#### Success Criteria
- [ ] Tags provide immediate visual categorization of projects
- [ ] Same tag always shows same color across runs
- [ ] Tag display is toggleable via config (`tags.enabled: false`)
- [ ] Table alignment remains clean with tags
- [ ] No performance impact on scanning

#### Planned Features (Phase 5 - Remaining)
- [ ] allow projects to be sorted. Default to last-edited, but should be sortable by name and categories (which is parent folder names)
- [ ] add "search criteria" for finding the project status - this is the different aspects to look for when deciding on the project's status
- [ ] status should be one of "unknown", "planning", "in progress", "feature complete" (for all planned tasks completed)
- [ ] add a 'progress' column that is the completed tickets/total value where available) - leave blank if not 'in progress' or 'feature complete'
- [ ] move the 'git' (lightning for tracked project) into the bottom line of the project name as a 'badges' like the github README style badges - but for useful information on the app
- [ ] add a last edited column.

#### Future Considerations  
- Plugin system for custom analyzers
- GitHub/GitLab API integration
- Dependency health checking (outdated packages, security issues)
- Project relationship mapping
- Test coverage analysis
- Build status monitoring

## Ongoing Maintenance

### Ongoing Tasks
- Update project type detection as new languages/frameworks emerge
- Refine tracking pattern detection based on real usage
- Performance optimization as `/dev` directory grows
- Bug fixes and edge case handling

### Version Strategy
- Major versions for breaking CLI changes
- Minor versions for new features
- Patch versions for bug fixes and improvements

This development plan provides a clear roadmap while maintaining flexibility for adjustments based on implementation discoveries and user feedback.
