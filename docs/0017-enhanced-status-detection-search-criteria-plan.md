status: pending

# 0017 Enhanced Status Detection with Search Criteria — Plan

## Objective
Refine project status detection by implementing configurable "search criteria" - specific patterns and indicators to look for when determining project status. Replace the current loose status types with a clear progression: unknown → planning → in-progress → feature-complete → stable → archived.

## Background
Currently, status detection uses hardcoded logic in `analyzer.ts` that checks for phases, versions, and TODOs. The status types are somewhat ambiguous:
- Current: `phase`, `stable`, `active`, `archived`, `unknown`
- Issues: "phase" and "active" overlap, no distinction between "planning" and "in-progress"

Users need clearer status categories that reflect actual project lifecycle stages, with configurable criteria for detecting each status. This enables customization per team/workflow and more accurate status reporting.

## Scope
- Define new clear status progression: `unknown → planning → in-progress → feature-complete → stable → archived`
- Implement configurable search criteria for each status
- Create pattern-matching system for status indicators
- Support multiple evidence sources (tracking files, git, filesystem)
- Maintain backward compatibility with existing projects
- Make criteria extensible via configuration

## Out of Scope
- Manual status override (future enhancement)
- Status transitions or workflows (just detection, not management)
- Historical status tracking (only current status)
- Per-project custom status types (use standard set)
- Complex boolean logic in criteria (keep simple OR/AND patterns)

## Status Type Definitions

### 1. Unknown
**Definition**: Cannot determine project status from available evidence
**When to use**: New projects, missing tracking files, no clear indicators
**Criteria**: Default when no other status matches

### 2. Planning
**Definition**: Project is in planning/design phase, not yet implementing features
**Indicators**:
- Status field contains: "planning", "design", "RFC", "proposal"
- Phase 0 or Phase 1 (of N)
- Has design docs but minimal code
- TODOs > 50 (heavy planning, not execution)
- No version number or 0.0.x versions

### 3. In Progress
**Definition**: Actively implementing planned features
**Indicators**:
- Status field contains: "in progress", "active", "development", "WIP"
- Phase 2-N (middle phases)
- Version 0.x.x (pre-1.0)
- Recent commits (last 30 days)
- Has TODOs but not excessive
- Code files present and growing

### 4. Feature Complete
**Definition**: All planned features implemented, in testing/stabilization
**Indicators**:
- Status field contains: "feature complete", "RC", "beta", "stabilization"
- Final phase (e.g., Phase 5/5)
- Version 0.9.x or 1.0.0-rc
- Few TODOs remaining (< 5)
- No new feature branches
- Testing/bug fix activity

### 5. Stable
**Definition**: Released, production-ready, maintenance mode
**Indicators**:
- Status field contains: "stable", "released", "production", "v1"
- Version >= 1.0.0
- Minimal recent changes (< 5 commits in 90 days)
- No or very few TODOs
- Has releases/tags in git

### 6. Archived
**Definition**: Project is archived, deprecated, or no longer maintained
**Indicators**:
- Status field contains: "archived", "deprecated", "abandoned", "sunset"
- No commits in 180+ days
- README/CLAUDE.md mentions deprecation
- Git repo is archived (if using GitHub/GitLab API in future)

## Technical Design

### Status Criteria Configuration

Extend `ProjectsConfig` with status criteria:
```typescript
interface StatusCriteria {
  // Patterns to search for in tracking files
  statusPatterns?: string[]        // e.g., ["planning", "design"]

  // Phase-based criteria
  phaseRange?: {
    min?: number                   // minimum phase number
    max?: number                   // maximum phase number
    relative?: 'first' | 'middle' | 'last'  // or specific range
  }

  // Version-based criteria
  versionPattern?: string          // regex like "^0\\..*" or "^1\\."

  // TODO-based criteria
  todoCount?: {
    min?: number
    max?: number
  }

  // Git activity criteria
  gitActivity?: {
    recentCommitDays?: number      // commits within N days
    minCommits?: number
    maxCommits?: number
  }

  // File-based criteria
  filePatterns?: {
    required?: string[]            // must have these files
    forbidden?: string[]           // must NOT have these files
  }
}

interface ProjectsConfig {
  // ... existing fields
  statusCriteria?: {
    planning: StatusCriteria
    'in-progress': StatusCriteria
    'feature-complete': StatusCriteria
    stable: StatusCriteria
    archived: StatusCriteria
  }
}
```

### Default Status Criteria

Provide sensible defaults in config:
```yaml
statusCriteria:
  planning:
    statusPatterns: ["planning", "design", "RFC", "proposal", "draft"]
    phaseRange:
      relative: first
    versionPattern: "^0\\.0\\."
    todoCount:
      min: 20

  in-progress:
    statusPatterns: ["in progress", "active", "development", "WIP", "implementing"]
    phaseRange:
      relative: middle
    versionPattern: "^0\\.[1-9]\\."
    gitActivity:
      recentCommitDays: 30
      minCommits: 1

  feature-complete:
    statusPatterns: ["feature complete", "RC", "beta", "stabilization", "freeze"]
    phaseRange:
      relative: last
    versionPattern: "^(0\\.9\\.|1\\.0\\.0-)"
    todoCount:
      max: 5

  stable:
    statusPatterns: ["stable", "released", "production", "v1", "complete"]
    versionPattern: "^[1-9]\\."
    gitActivity:
      recentCommitDays: 90
      maxCommits: 10

  archived:
    statusPatterns: ["archived", "deprecated", "abandoned", "sunset", "EOL"]
    gitActivity:
      recentCommitDays: 180
      maxCommits: 0
```

### New Status Detection Algorithm

Create `src/lib/tracking/status-detector.ts`:
```typescript
export class StatusDetector {
  constructor(
    private criteria: StatusCriteriaConfig,
    private project: AnalyzedProject
  ) {}

  detectStatus(): ProjectStatus {
    // Check in priority order (most specific first)
    const checks = [
      () => this.checkArchived(),
      () => this.checkStable(),
      () => this.checkFeatureComplete(),
      () => this.checkInProgress(),
      () => this.checkPlanning(),
    ]

    for (const check of checks) {
      const result = check()
      if (result) {
        return result
      }
    }

    // Default to unknown
    return {
      type: 'unknown',
      details: 'No status indicators found',
      confidence: 0.1,
    }
  }

  private checkPlanning(): ProjectStatus | null {
    const criteria = this.criteria.planning
    const evidence: string[] = []
    let score = 0

    // Check status patterns in tracking files
    if (this.matchesStatusPattern(criteria.statusPatterns)) {
      evidence.push('status field indicates planning')
      score += 0.3
    }

    // Check phase
    if (this.matchesPhaseRange(criteria.phaseRange)) {
      evidence.push('early phase')
      score += 0.2
    }

    // Check version
    if (this.matchesVersionPattern(criteria.versionPattern)) {
      evidence.push('pre-alpha version')
      score += 0.2
    }

    // Check TODO count
    if (this.matchesTodoCount(criteria.todoCount)) {
      evidence.push('high TODO count')
      score += 0.1
    }

    if (score >= 0.4) {
      return {
        type: 'planning',
        details: evidence.join(', '),
        confidence: Math.min(score, 0.9),
      }
    }

    return null
  }

  private matchesStatusPattern(patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) return false

    for (const file of this.project.trackingFiles) {
      const content = JSON.stringify(file.content).toLowerCase()
      for (const pattern of patterns) {
        if (content.includes(pattern.toLowerCase())) {
          return true
        }
      }
    }

    return false
  }

  private matchesPhaseRange(range?: PhaseRange): boolean {
    if (!range) return false

    const phase = this.project.trackingFiles
      .map(f => f.content.phases)
      .find(p => p !== undefined)

    if (!phase) return false

    if (range.relative === 'first') {
      return phase.current === 1 || (phase.total > 0 && phase.current <= 2)
    } else if (range.relative === 'middle') {
      return phase.total > 0 && phase.current > 2 && phase.current < phase.total
    } else if (range.relative === 'last') {
      return phase.total > 0 && phase.current === phase.total
    }

    // Check explicit min/max
    if (range.min !== undefined && phase.current < range.min) return false
    if (range.max !== undefined && phase.current > range.max) return false

    return true
  }

  private matchesVersionPattern(pattern?: string): boolean {
    if (!pattern) return false

    const version = this.project.trackingFiles
      .map(f => f.content.version)
      .find(v => v !== undefined)

    if (!version) return false

    const regex = new RegExp(pattern)
    return regex.test(version)
  }

  private matchesTodoCount(range?: { min?: number; max?: number }): boolean {
    if (!range) return false

    const todoCount = this.project.trackingFiles
      .map(f => f.content.todos)
      .reduce((sum, count) => sum + (count || 0), 0)

    if (range.min !== undefined && todoCount < range.min) return false
    if (range.max !== undefined && todoCount > range.max) return false

    return true
  }

  // Similar methods for checkInProgress, checkFeatureComplete, etc.
}
```

### Integration with Analyzer

Update `TrackingAnalyzer.analyzeProject()`:
```typescript
async analyzeProject(directory: ProjectDirectory): Promise<ProjectStatus> {
  try {
    const trackingFiles = await this.detectTrackingFiles(directory)

    // Use new status detector with criteria
    const detector = new StatusDetector(
      this.config.statusCriteria,
      { ...directory, trackingFiles }
    )

    return detector.detectStatus()
  } catch (error) {
    return {
      type: 'unknown',
      details: `Analysis failed: ${error.message}`,
      confidence: 0,
    }
  }
}
```

### Type Updates

Update `src/lib/types.ts`:
```typescript
export interface ProjectStatus {
  type: 'unknown' | 'planning' | 'in-progress' | 'feature-complete' | 'stable' | 'archived'
  details: string
  confidence: number
}

export interface StatusCriteria {
  statusPatterns?: string[]
  phaseRange?: {
    min?: number
    max?: number
    relative?: 'first' | 'middle' | 'last'
  }
  versionPattern?: string
  todoCount?: {
    min?: number
    max?: number
  }
  gitActivity?: {
    recentCommitDays?: number
    minCommits?: number
    maxCommits?: number
  }
  filePatterns?: {
    required?: string[]
    forbidden?: string[]
  }
}

export interface ProjectsConfig {
  // ... existing fields
  statusCriteria?: {
    planning: StatusCriteria
    'in-progress': StatusCriteria
    'feature-complete': StatusCriteria
    stable: StatusCriteria
    archived: StatusCriteria
  }
}
```

## Implementation Steps

1. **Update Types** (`src/lib/types.ts`):
   - Change `ProjectStatus.type` to new status set
   - Add `StatusCriteria` and related interfaces
   - Extend `ProjectsConfig` with `statusCriteria` field

2. **Create Status Detector** (`src/lib/tracking/status-detector.ts`):
   - Implement `StatusDetector` class
   - Add methods for each status check
   - Implement criteria matching functions
   - Calculate confidence scores

3. **Update Analyzer** (`src/lib/tracking/analyzer.ts`):
   - Integrate `StatusDetector` in `analyzeProject()`
   - Pass criteria config to detector
   - Maintain backward compatibility for projects without criteria

4. **Add Default Criteria** (`src/lib/config/config.ts`):
   - Define default status criteria in config schema
   - Provide sensible defaults for each status type
   - Document criteria in config.md

5. **Update Table Output** (`src/lib/output/table.ts`):
   - Update status colors for new types
   - Planning: yellow
   - In-progress: blue
   - Feature-complete: cyan
   - Stable: green
   - Archived: gray
   - Unknown: dim white

6. **Testing** (`test/status-detection.test.ts`):
   - Test each status detection with mock projects
   - Test criteria matching functions
   - Test confidence scoring
   - Test edge cases (no criteria, missing fields)
   - Test backward compatibility

7. **Migration Support**:
   - Map old status types to new ones:
     - `phase` → `in-progress`
     - `active` → `in-progress`
     - `stable` → `stable`
     - `archived` → `archived`
     - `unknown` → `unknown`

8. **Documentation**:
   - Update README.md with new status types
   - Document status criteria in docs/config.md
   - Update CLAUDE.md with status detection logic
   - Add examples of customizing criteria

## Testing Strategy

### Unit Tests
```typescript
describe('Status Detection', () => {
  test('detects planning status from status field', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: { description: 'Status: planning phase' }
      }]
    })

    const status = detector.detectStatus(project)
    expect(status.type).toBe('planning')
  })

  test('detects in-progress from phase and version', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: {
          phases: { current: 3, total: 5 },
          version: '0.3.0'
        }
      }]
    })

    const status = detector.detectStatus(project)
    expect(status.type).toBe('in-progress')
  })

  test('detects feature-complete from final phase and low TODOs', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: {
          phases: { current: 5, total: 5 },
          todos: 3
        }
      }]
    })

    const status = detector.detectStatus(project)
    expect(status.type).toBe('feature-complete')
  })

  test('detects stable from version >= 1.0', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: { version: '1.2.0' }
      }]
    })

    const status = detector.detectStatus(project)
    expect(status.type).toBe('stable')
  })

  test('detects archived from status pattern', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: { description: 'Status: archived' }
      }]
    })

    const status = detector.detectStatus(project)
    expect(status.type).toBe('archived')
  })
})

describe('Criteria Matching', () => {
  test('matches status patterns case-insensitively', () => {
    const criteria = { statusPatterns: ['planning', 'design'] }
    const content = 'Project is in Planning phase'
    expect(matchesStatusPattern(content, criteria)).toBe(true)
  })

  test('matches phase range with relative position', () => {
    const criteria = { phaseRange: { relative: 'middle' } }
    const phase = { current: 3, total: 5 }
    expect(matchesPhaseRange(phase, criteria)).toBe(true)
  })

  test('matches version pattern with regex', () => {
    const criteria = { versionPattern: '^0\\.[1-9]\\.' }
    expect(matchesVersionPattern('0.3.5', criteria)).toBe(true)
    expect(matchesVersionPattern('1.0.0', criteria)).toBe(false)
  })
})
```

### Integration Tests
- Create sample projects with various status indicators
- Verify correct status detection
- Test with custom criteria configuration
- Verify confidence scores are reasonable

### Visual Testing
- Run on real projects and verify status makes sense
- Check status colors in table output
- Verify details field provides useful information

## Acceptance Criteria
- [ ] Six clear status types: unknown, planning, in-progress, feature-complete, stable, archived
- [ ] Configurable search criteria for each status
- [ ] Default criteria work well for common project patterns
- [ ] Status detection uses multiple evidence sources
- [ ] Confidence scores reflect detection reliability
- [ ] Backward compatible with existing projects
- [ ] Custom criteria can be configured per team
- [ ] Tests cover all status types and criteria
- [ ] Documentation explains criteria system
- [ ] Table output uses appropriate colors per status

## Risks & Mitigations

**Risk**: Default criteria don't match all workflows
- *Mitigation*: Make criteria fully configurable
- *Mitigation*: Provide multiple preset profiles (agile, waterfall, etc.)
- *Mitigation*: Document customization clearly

**Risk**: Too many criteria options confuse users
- *Mitigation*: Provide sensible defaults that work without config
- *Mitigation*: Document common use cases
- *Mitigation*: Keep criteria structure simple

**Risk**: Breaking change for existing projects
- *Mitigation*: Map old status types to new ones automatically
- *Mitigation*: Add migration notes in changelog
- *Mitigation*: Support both old and new in transition period

**Risk**: Status detection becomes too complex/slow
- *Mitigation*: Keep criteria checks simple (pattern matching, not AI)
- *Mitigation*: Cache tracking file content during analysis
- *Mitigation*: Profile and optimize if needed

## Migration Notes
- Old status types map to new:
  - `phase` → `in-progress`
  - `active` → `in-progress`
  - `stable` → `stable`
  - `archived` → `archived`
  - `unknown` → `unknown`
- Existing projects will be re-analyzed with new criteria
- Custom status colors may need updating in config
- Sorting by status (Feature 0016) updated with new order

## Future Enhancements (Out of Scope)
- Manual status override via config
- Status transition suggestions
- Status history tracking
- Project health scoring beyond status
- AI/LLM-based status detection
- Team-specific status types

## Dependencies
- Existing tracking file detection system
- Configuration system for criteria
- Git insights (Feature 0005) for activity-based criteria
- Table output for status colors

## Estimated Effort
- Type updates: 1 hour
- Status detector implementation: 4-5 hours
- Integration and migration: 2-3 hours
- Testing: 3-4 hours
- Documentation: 2 hours
- Total: ~12-15 hours

## Success Metrics
- Clear status progression visible in table
- Accurate status detection for 80%+ of projects
- Easy to customize criteria for team workflows
- No performance degradation
- Positive user feedback on clarity
