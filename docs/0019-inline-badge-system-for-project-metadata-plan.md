status: not started

# 0019 Inline Badge System for Project Metadata

## Overview

Replace the dedicated "Git" column with compact inline badges displayed beneath the project name. This GitHub README-style badge system will show git tracking status, version, languages, and other metadata in a visually compact format, freeing horizontal space for more valuable information while providing at-a-glance project insights.

## Problem Statement

Current table layout dedicates an entire column (28 characters wide) to git information, which:
- Consumes valuable horizontal space in terminal output
- Forces wide column widths that may cause wrapping on smaller terminals
- Separates related metadata (git, version, languages) into different columns
- Makes quick scanning harder as eyes must move across wide rows
- Doesn't scale well when adding new metadata fields (each requires a new column)

GitHub README badges provide a proven solution: compact, colorful, inline indicators that group related information and save horizontal space.

## Goals

1. **Compact Display**: Reduce horizontal space usage by consolidating metadata into badges
2. **Visual Clarity**: Use color and symbols to make project metadata instantly scannable
3. **Extensibility**: Create a badge system that can easily accommodate future metadata types
4. **Configurability**: Allow users to control which badges are displayed and in what order
5. **Performance**: No impact on scan performance; badges are purely presentational

## Proposed Solution

### Badge Types

**Git Badge** (replaces Git column):
- Format: `⚡ tracked` (when hasGit is true and git tracking detected)
- Color: Cyan (#00d4ff)
- Shows: Git repository presence
- Example: `⚡ git`

**Version Badge** (from existing version detection):
- Format: `v{version}`
- Color: Green (#4caf50) for stable (1.0+), Yellow (#f0ad4e) for pre-release (0.x)
- Shows: Project version from package.json, Cargo.toml, etc.
- Example: `v1.2.3`, `v0.5.0`

**Language Badge** (from existing language detection):
- Format: Primary language abbreviation
- Color: Type-specific color from existing TypeDetector colors
- Shows: Primary detected language
- Example: `TS`, `Py`, `Rs`, `Go`

**Activity Badge** (from git insights when available):
- Format: `{commits}/{days}d`
- Color: Green for active (>5 commits), yellow for moderate (1-5), gray for quiet (0)
- Shows: Recent commit activity
- Example: `12/30d`, `0/30d`

**Optional Future Badges**:
- Test coverage: `✓ 85%`
- CI status: `✓ passing`, `✗ failing`
- Dependencies: `⚠ 3 outdated`
- License: `MIT`, `Apache-2.0`

### Display Format

Badges appear on a second line beneath the project name within the "Project" column:

```
┌────────────────────┬─────────────┬──────┬──────────────────────────┬─────────────────────────────┐
│ 📁 Project         │ Status      │ Type │ 📍 Location              │ Description                 │
├────────────────────┼─────────────┼──────┼──────────────────────────┼─────────────────────────────┤
│ projector          │ Phase 5/5   │ Node │ ~/dev/tooling/projector  │ Project discovery CLI       │
│ ⚡ git v0.8.0 TS    │             │      │                          │                             │
├────────────────────┼─────────────┼──────┼──────────────────────────┼─────────────────────────────┤
│ api-server         │ ✓ Stable    │ Node │ ~/dev/services/api       │ REST API backend            │
│ ⚡ git v2.1.5 12/30d│             │      │                          │                             │
├────────────────────┼─────────────┼──────┼──────────────────────────┼─────────────────────────────┤
│ data-pipeline      │ ❓ Unknown  │ Py   │ ~/dev/ml/pipeline        │ ETL processing              │
│ v1.0.0 Py          │             │      │                          │                             │
└────────────────────┴─────────────┴──────┴──────────────────────────┴─────────────────────────────┘
```

### Badge Rendering

Each badge is a compact string with:
- Icon/symbol (optional)
- Text content
- Color based on badge type and value
- Space separator between badges

Implementation approach:
```typescript
interface Badge {
  type: 'git' | 'version' | 'language' | 'activity'
  content: string
  color: string
  icon?: string
}

function renderBadge(badge: Badge): string {
  const icon = badge.icon ? `${badge.icon} ` : ''
  return chalk.hex(badge.color)(`${icon}${badge.content}`)
}

function renderBadges(badges: Badge[]): string {
  return badges.map(renderBadge).join(' ')
}
```

### Configuration

Add `badges` configuration block to `config.yaml`:

```yaml
badges:
  enabled: true                    # Master toggle for badge system
  order: ['git', 'version', 'language', 'activity']  # Badge display order
  git:
    enabled: true
    icon: '⚡'
    label: 'git'
  version:
    enabled: true
    showPrefix: true               # Show 'v' prefix
  language:
    enabled: true
    abbreviate: true               # Use 2-3 char abbreviations
  activity:
    enabled: true
    requireGitInsights: true       # Only show when git insights available
```

## Technical Design

### 1. Badge Generator Module

New file: `src/lib/output/badges.ts`

```typescript
import chalk from 'chalk'
import { AnalyzedProject, BadgeConfig } from '../types.js'

export interface Badge {
  type: string
  content: string
  color: string
  icon?: string
}

export class BadgeGenerator {
  constructor(private config?: BadgeConfig) {}

  generateBadges(project: AnalyzedProject): Badge[] {
    const badges: Badge[] = []
    const order = this.config?.order || ['git', 'version', 'language', 'activity']

    for (const badgeType of order) {
      const badge = this.createBadge(badgeType, project)
      if (badge) badges.push(badge)
    }

    return badges
  }

  private createBadge(type: string, project: AnalyzedProject): Badge | null {
    const badgeConfig = this.config?.[type]
    if (badgeConfig?.enabled === false) return null

    switch (type) {
      case 'git':
        return this.createGitBadge(project, badgeConfig)
      case 'version':
        return this.createVersionBadge(project, badgeConfig)
      case 'language':
        return this.createLanguageBadge(project, badgeConfig)
      case 'activity':
        return this.createActivityBadge(project, badgeConfig)
      default:
        return null
    }
  }

  private createGitBadge(project: AnalyzedProject, config?: any): Badge | null {
    if (!project.hasGit && !project.git) return null

    return {
      type: 'git',
      icon: config?.icon || '⚡',
      content: config?.label || 'git',
      color: '#00d4ff'
    }
  }

  private createVersionBadge(project: AnalyzedProject, config?: any): Badge | null {
    // Extract version from tracking info or type-specific version detection
    const version = this.extractVersion(project)
    if (!version) return null

    const prefix = config?.showPrefix !== false ? 'v' : ''
    const isStable = this.isStableVersion(version)

    return {
      type: 'version',
      content: `${prefix}${version}`,
      color: isStable ? '#4caf50' : '#f0ad4e'
    }
  }

  private createLanguageBadge(project: AnalyzedProject, config?: any): Badge | null {
    const language = this.getPrimaryLanguage(project)
    if (!language) return null

    const content = config?.abbreviate
      ? this.abbreviateLanguage(language)
      : language

    return {
      type: 'language',
      content,
      color: this.getLanguageColor(project.type)
    }
  }

  private createActivityBadge(project: AnalyzedProject, config?: any): Badge | null {
    if (config?.requireGitInsights && !project.git) return null
    if (!project.git?.commitsInWindow) return null

    const { count, windowDays } = project.git.commitsInWindow
    const color = count > 5 ? '#4caf50' : count > 0 ? '#f0ad4e' : '#666666'

    return {
      type: 'activity',
      content: `${count}/${windowDays}d`,
      color
    }
  }

  renderBadges(badges: Badge[]): string {
    return badges
      .map(badge => {
        const icon = badge.icon ? `${badge.icon} ` : ''
        return chalk.hex(badge.color)(`${icon}${badge.content}`)
      })
      .join(' ')
  }

  // Helper methods
  private extractVersion(project: AnalyzedProject): string | null {
    // Check tracking info first
    const trackingVersion = project.trackingFiles
      .map(tf => tf.content.version)
      .find(v => v)

    if (trackingVersion) return trackingVersion

    // Type-specific version detection could be added here
    return null
  }

  private isStableVersion(version: string): boolean {
    const match = version.match(/^(\d+)\./)
    if (!match) return false
    return parseInt(match[1], 10) >= 1
  }

  private getPrimaryLanguage(project: AnalyzedProject): string | null {
    return project.languages[0] || null
  }

  private abbreviateLanguage(language: string): string {
    const abbrevMap: Record<string, string> = {
      'typescript': 'TS',
      'javascript': 'JS',
      'python': 'Py',
      'rust': 'Rs',
      'go': 'Go',
      'php': 'PHP',
      'java': 'Java',
      'ruby': 'Rb',
      'swift': 'Sw',
      'kotlin': 'Kt',
      'c': 'C',
      'cpp': 'C++',
      'csharp': 'C#',
    }
    return abbrevMap[language.toLowerCase()] || language.substring(0, 3).toUpperCase()
  }

  private getLanguageColor(type: string): string {
    const typeColors: Record<string, string> = {
      'nodejs': '#68a063',
      'python': '#3776ab',
      'rust': '#ce422b',
      'go': '#00add8',
      'php': '#777bb4',
      'java': '#ed8b00',
      'unknown': '#666666',
    }
    return typeColors[type] || typeColors['unknown']
  }
}
```

### 2. Table Generator Updates

Modify `src/lib/output/table.ts`:

```typescript
// Update formatRow to include badges on second line
formatRow(project: AnalyzedProject, colorScheme?: ColorScheme, badgeConfig?: BadgeConfig): string[] {
  const projectName = chalk.hex(colorScheme?.projectName || '#ffffff')(project.name)

  // Generate badges
  const badgeGen = new BadgeGenerator(badgeConfig)
  const badges = badgeGen.generateBadges(project)
  const badgeLine = badgeGen.renderBadges(badges)

  // Combine name and badges with newline
  const projectCell = badgeLine ? `${projectName}\n${badgeLine}` : projectName

  const status = this.formatStatus(project.status.details, project.status.type, colorScheme)
  // Remove git column - it's now in badges
  const type = this.formatProjectType(project.type, project.languages)
  const location = this.formatLocation(project.path)
  const description = this.formatDescription(project.description, project.status.confidence)

  return [projectCell, status, type, location, description]
}

// Update table headers - remove Git column
generateTable(projects: AnalyzedProject[], colorScheme?: ColorScheme, badgeConfig?: BadgeConfig): string {
  const table = new Table({
    head: [
      chalk.hex(colorScheme?.header || '#00d4ff').bold('📁 Project'),
      chalk.hex(colorScheme?.header || '#00d4ff').bold('Status'),
      chalk.hex(colorScheme?.header || '#00d4ff').bold('Type'),
      chalk.hex(colorScheme?.header || '#00d4ff').bold('📍 Location'),
      chalk.hex(colorScheme?.header || '#00d4ff').bold('Description')
    ],
    style: {
      head: [],
      border: ['gray']
    },
    colWidths: [24, 15, 12, 32, 50],  // Wider Project column, removed Git column
    wordWrap: true
  })

  // ... rest of implementation
}
```

### 3. Type Updates

Add to `src/lib/types.ts`:

```typescript
export interface BadgeConfig {
  enabled?: boolean
  order?: string[]
  git?: {
    enabled?: boolean
    icon?: string
    label?: string
  }
  version?: {
    enabled?: boolean
    showPrefix?: boolean
  }
  language?: {
    enabled?: boolean
    abbreviate?: boolean
  }
  activity?: {
    enabled?: boolean
    requireGitInsights?: boolean
  }
}

export interface ProjectsConfig {
  // ... existing fields
  badges?: BadgeConfig
}
```

### 4. Configuration Defaults

Add to `src/lib/config/config.ts`:

```typescript
getDefaultConfig(): ProjectsConfig {
  return {
    // ... existing defaults
    badges: {
      enabled: true,
      order: ['git', 'version', 'language', 'activity'],
      git: {
        enabled: true,
        icon: '⚡',
        label: 'git'
      },
      version: {
        enabled: true,
        showPrefix: true
      },
      language: {
        enabled: true,
        abbreviate: true
      },
      activity: {
        enabled: true,
        requireGitInsights: true
      }
    }
  }
}
```

## Implementation Steps

### Phase 1: Badge Generator (3-4 hours)
1. Create `src/lib/output/badges.ts` with `BadgeGenerator` class
2. Implement badge creation for each type (git, version, language, activity)
3. Add helper methods for version extraction, language abbreviation, colors
4. Implement `renderBadges()` method with chalk coloring
5. Add unit tests in `test/badge-generator.test.ts`

### Phase 2: Type System & Config (1-2 hours)
1. Add `BadgeConfig` interface to `src/lib/types.ts`
2. Extend `ProjectsConfig` with `badges` field
3. Add badge defaults to `ConfigurationManager.getDefaultConfig()`
4. Add validation for badge configuration
5. Test config loading with badge settings

### Phase 3: Table Integration (2-3 hours)
1. Update `TableGenerator.generateTable()` to remove Git column from headers
2. Modify `formatRow()` to call `BadgeGenerator` and create two-line project cell
3. Adjust column widths to redistribute space from removed Git column
4. Update summary generation to reflect badge-based display
5. Test table rendering with various badge combinations

### Phase 4: Version Detection Enhancement (2-3 hours)
1. Enhance version extraction in `TrackingAnalyzer` to capture version from tracking files
2. Add type-specific version detection (package.json, Cargo.toml, pyproject.toml, go.mod)
3. Store version in `TrackingInfo` or project metadata
4. Test version extraction across different project types
5. Handle edge cases (missing version, invalid format)

### Phase 5: Testing & Edge Cases (2-3 hours)
1. Test badge rendering with all badge types enabled/disabled
2. Test custom badge order configurations
3. Test projects with missing metadata (no git, no version, no language)
4. Test color schemes and terminal compatibility
5. Test column width adjustments and wrapping behavior
6. Add integration tests for full table with badges

### Phase 6: Documentation (1 hour)
1. Update `docs/architecture.md` with badge system details
2. Add badge configuration examples to `docs/config.md`
3. Update README with badge display examples
4. Document badge types and customization options
5. Add troubleshooting section for badge display issues

## Edge Cases & Error Handling

1. **No Badges Available**: Display project name without second line
2. **Disabled Badges**: Skip disabled badge types in order array
3. **Missing Metadata**: Skip badges gracefully when data not available
4. **Invalid Config**: Fall back to defaults, log warning
5. **Color Support**: Degrade gracefully in non-color terminals (plain text badges)
6. **Column Width**: Ensure badges don't cause overflow; truncate if needed
7. **Multi-line Wrapping**: cli-table3 handles newlines; test various terminal widths

## Testing Strategy

### Unit Tests (`test/badge-generator.test.ts`)
```typescript
describe('BadgeGenerator', () => {
  it('generates git badge when hasGit is true', () => {
    const project = { hasGit: true, git: { ... } }
    const badges = badgeGen.generateBadges(project)
    expect(badges.find(b => b.type === 'git')).toBeDefined()
  })

  it('generates version badge with correct color', () => {
    const stableProject = { trackingFiles: [{ content: { version: '1.2.3' } }] }
    const preReleaseProject = { trackingFiles: [{ content: { version: '0.5.0' } }] }

    const stableBadge = badgeGen.createVersionBadge(stableProject, {})
    const preReleaseBadge = badgeGen.createVersionBadge(preReleaseProject, {})

    expect(stableBadge.color).toBe('#4caf50')  // green
    expect(preReleaseBadge.color).toBe('#f0ad4e')  // yellow
  })

  it('abbreviates languages correctly', () => {
    expect(badgeGen.abbreviateLanguage('typescript')).toBe('TS')
    expect(badgeGen.abbreviateLanguage('python')).toBe('Py')
  })

  it('respects badge order configuration', () => {
    const config = { order: ['version', 'git', 'language'] }
    const badges = new BadgeGenerator(config).generateBadges(project)
    expect(badges.map(b => b.type)).toEqual(['version', 'git', 'language'])
  })

  it('skips disabled badges', () => {
    const config = { git: { enabled: false } }
    const badges = new BadgeGenerator(config).generateBadges(project)
    expect(badges.find(b => b.type === 'git')).toBeUndefined()
  })
})
```

### Integration Tests (`test/table-badges-integration.test.ts`)
```typescript
describe('Table with Badges', () => {
  it('renders table without Git column', () => {
    const table = tableGen.generateTable(projects, colorScheme, badgeConfig)
    expect(table).not.toContain('Git')  // No Git column header
  })

  it('displays badges on second line of project cell', () => {
    const table = tableGen.generateTable([projectWithGit], colorScheme, badgeConfig)
    expect(table).toContain('⚡ git')
  })

  it('handles projects with no badges gracefully', () => {
    const projectNoBadges = { hasGit: false, languages: [], trackingFiles: [] }
    const table = tableGen.generateTable([projectNoBadges], colorScheme, badgeConfig)
    expect(table).toContain(projectNoBadges.name)
  })
})
```

## Migration Path

### Backward Compatibility

1. **Default Behavior**: Badges enabled by default; existing users see new layout immediately
2. **Opt-out**: Users can disable badges entirely: `badges.enabled: false`
3. **Git Column Removal**: Git column is removed; git info now in badges
4. **Config Migration**: No breaking changes to existing config; new `badges` block is optional
5. **Legacy Support**: Not needed - this is a purely visual change

### User Communication

Update CHANGELOG.md:
```markdown
### Changed
- **BREAKING**: Removed dedicated Git column from table output
- Git information now displayed as inline badges beneath project names
- Badge system provides compact, colorful metadata display
- Configure badge display via new `badges` config block in `config.yaml`

### Migration
- No action required - badges enabled by default
- To restore more compact output, disable badges: `badges.enabled: false`
- Customize badge display via `badges.order` and individual badge settings
```

## Performance Considerations

1. **Badge Generation**: O(n) per project, minimal overhead (<1ms per project)
2. **Rendering**: Chalk coloring is fast; no performance impact
3. **Version Detection**: Reuse existing tracking file parsing; no extra I/O
4. **Caching**: Badge display is purely presentational; no cache changes needed
5. **Memory**: Badge objects are small; negligible memory impact

## Success Criteria

- [ ] Badge system implemented with all four badge types (git, version, language, activity)
- [ ] Git column removed from table headers
- [ ] Badges display on second line beneath project name
- [ ] Configuration system allows enabling/disabling individual badges
- [ ] Custom badge order respected
- [ ] Version badge shows correct color for stable vs pre-release
- [ ] Language abbreviations work correctly for common languages
- [ ] Activity badge respects `requireGitInsights` setting
- [ ] All unit tests pass with >90% coverage for badge generator
- [ ] Integration tests verify table rendering with badges
- [ ] Documentation updated with badge examples and configuration
- [ ] No performance degradation vs current implementation
- [ ] Works correctly in terminals with and without color support

## Benefits

1. **Space Efficiency**: Reclaim ~28 characters of horizontal space per row
2. **Visual Clarity**: Related metadata grouped together beneath project name
3. **Scalability**: Easy to add new badge types without changing table structure
4. **Familiarity**: GitHub README-style badges are widely recognized
5. **Flexibility**: Users can customize which badges are shown and order
6. **Consistency**: Unified badge rendering for all metadata types

## Estimated Effort

- Badge Generator: 3-4 hours
- Type System & Config: 1-2 hours
- Table Integration: 2-3 hours
- Version Detection: 2-3 hours
- Testing & Edge Cases: 2-3 hours
- Documentation: 1 hour

**Total: 11-16 hours**

## Dependencies

- Existing `AnalyzedProject` interface with `hasGit`, `git`, `languages`, `trackingFiles`
- Existing color scheme system in `TableGenerator`
- Existing version detection in tracking analyzer (may need enhancement)
- cli-table3 multi-line cell support (already supported)

## Future Enhancements

Once badge system is established, easily add:
- Test coverage badge
- CI/CD status badge
- Dependency health badge (outdated packages)
- License badge
- Custom user-defined badges via config
- Badge click actions (if terminal supports hyperlinks)
